/**
 * 富文本「外部内容回灌」判定逻辑的回归测试。
 *
 * ## 这个 bug 是什么
 * 用户在 Rich 模式的**段落中间**按回车或退格，光标（插入点）莫名其妙跳到
 * 文档末尾 —— 看起来像「输入图标出现在很奇怪的位置」。
 *
 * ## 根因
 * 回灌 effect 拿「Tiptap 序列化结果」和「磁盘原文形态」比**字符串**：
 *   · 磁盘原文带末尾换行（`restoreEscapedBackslashes` 会按原文补回），
 *     而 `editor.getMarkdown()` **不输出**末尾换行；
 *   · 表格会被重新对齐（`| a | b |` → `| a   | b   |`）；
 *   · 转义写法也不同（`\_` / `_`）。
 * 差一个字符就判成「外部改了内容」→ 触发全量 `setContent`。
 * 而 `setContent` 内部是 `tr.replaceWith(0, doc.content.size, nodes)` ——
 * **整篇替换**，选区被映射到文末，撤销栈也被清空。
 *
 * 所以这个 bug 的表现是「光标跳走」+「⌘Z 失效」两件事一起出现。
 *
 * ## 测试策略
 * 判定逻辑抽在 `richTextSync.ts` 里（组件只负责调用），所以这里能直接测。
 * 判据用**行为**而不是实现细节：回灌后**选区不动**、**撤销栈还在**。
 */
import { describe, it, expect } from "vitest";
import { Editor } from "@tiptap/core";
import { Markdown } from "@tiptap/markdown";
import RichTextExtensions from "./richTextExtensions";
import { protectEscapedChars } from "./restoreBackslashes";
import {
  composeContent,
  editorBodyToDisk,
  isSameDocument,
  syncRichTextContent,
} from "./richTextSync";

/** 与组件同款扩展（少了 Placeholder —— 它依赖运行时语言，与本测试无关）。 */
function makeEditor(markdown: string): Editor {
  return new Editor({
    extensions: [...RichTextExtensions, Markdown],
    content: protectEscapedChars(markdown),
    contentType: "markdown",
  });
}

/** 文档正文（不含 frontmatter）。 */
const BODY = "第一段。\n\n第二段文\n\n字在这里。\n";

describe("富文本外部回灌判定", () => {
  describe("isSameDocument —— 判「是不是同一篇文档」", () => {
    it("末尾换行差异不算内容差异", () => {
      const editor = makeEditor(BODY);
      // 磁盘原文带末尾换行，编辑器序列化不带 —— 这是本 bug 的核心形态差异
      expect(isSameDocument(editor, BODY)).toBe(true);
      expect(isSameDocument(editor, BODY.trimEnd())).toBe(true);
      editor.destroy();
    });

    it("表格对齐空格差异不算内容差异", () => {
      const editor = makeEditor("| a | b |\n|---|---|\n| 1 | 2 |\n");
      expect(
        isSameDocument(editor, "| a   | b   |\n| --- | --- |\n| 1   | 2   |\n"),
      ).toBe(true);
      editor.destroy();
    });

    it("真的改了内容就是不同文档", () => {
      const editor = makeEditor(BODY);
      expect(isSameDocument(editor, "完全不同的内容\n")).toBe(false);
      editor.destroy();
    });
  });

  describe("syncRichTextContent —— 回灌不得动编辑器", () => {
    it("回声（父组件把刚推上去的内容送回来）→ 不动编辑器", () => {
      const editor = makeEditor(BODY);
      editor.commands.setTextSelection(11);
      const before = editor.state.selection.from;

      const emitted = editorBodyToDisk(editor, BODY);
      expect(syncRichTextContent(editor, emitted, emitted)).toBe("unchanged");
      expect(editor.state.selection.from).toBe(before);
      editor.destroy();
    });

    it("同一篇文档的另一种写法（末尾换行）→ 不动编辑器、不动选区", () => {
      const editor = makeEditor(BODY);
      editor.commands.setTextSelection(11);
      const before = editor.state.selection.from;

      expect(syncRichTextContent(editor, BODY, null)).toBe("unchanged");
      // 选区必须守在原处 —— 这是用户报障的现象本身
      expect(editor.state.selection.from).toBe(before);
      editor.destroy();
    });

    it("真的外部改动了 → 替换内容", () => {
      const editor = makeEditor(BODY);
      expect(syncRichTextContent(editor, "换一篇文档\n", null)).toBe("replaced");
      expect(editor.getMarkdown()).toContain("换一篇文档");
      editor.destroy();
    });

    it("回灌不得顶替撤销栈（⌘Z 一次必须撤掉刚打的那个字）", () => {
      const editor = makeEditor(BODY);
      // 先做一次真实编辑（进撤销栈）
      editor.commands.setTextSelection(11);
      editor.commands.insertContent("新");
      expect(editor.can().undo()).toBe(true);

      // 再走一次「同一篇文档的另一种写法」回灌。
      // ⚠️ 注意：回灌的内容虽然与编辑器现状**语义相同**（只是序列化形态不同），
      // 整篇 setContent 照样会重置选区、顶替撤销栈 —— 所以这一步必须真的跑。
      syncRichTextContent(editor, BODY, null);
      editor.commands.undo();

      // 期望：⌘Z 撤掉的只是刚打的那个「新」，其余内容原样保留。
      // 反例（回灌触发整篇替换时）：字没了、而且栈被顶替到只剩一层。
      expect(editor.getMarkdown()).not.toContain("新");
      expect(editor.getMarkdown()).toContain("第二段文");
      editor.destroy();
    });
  });

  describe("composeContent —— 正文与 frontmatter 拼装", () => {
    it("无 frontmatter 时只给正文", () => {
      expect(composeContent(BODY, null)).toBe(BODY);
    });

    it("有 frontmatter 时按规范拼装，且能逐字还原磁盘原文", () => {
      const disk = "---\ntitle: My Doc\ntags: a, b\n---\n\n第一段。\n\n第二段。\n";
      const body = "第一段。\n\n第二段。\n";
      expect(composeContent(body, "title: My Doc\ntags: a, b")).toBe(disk);
    });
  });
});
