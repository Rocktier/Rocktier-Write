/**
 * 富文本视图的**内容双向转换**与**外部内容回灌**逻辑。
 *
 * ## 背景：为什么不能拿字符串比
 * 富文本视图与源码视图共用同一份 markdown（App 里的 `activeDoc.content`）。
 * 用户在富文本里改一个字 → `onUpdate` → `onChange` → App 更新 state →
 * `content` prop 变 → 回灌 effect 重跑。
 *
 * 若此时用「字符串不相等」判定「外部改了内容」，就会触发 `setContent` ——
 * 而 `setContent` 内部是 `tr.replaceWith(0, doc.content.size, nodes)`（**整篇替换**）。
 *
 * ## 整篇替换的两处实测后果（别照抄推测）
 * 1. **选区被映射到文档末尾** —— 这就是用户看到的现象：「在段落中间按回车/
 *    退格，光标莫名其妙跳到文末」。实测：光标在 11，按回车后跑到 20。
 * 2. **撤销栈被「顶替」** —— 栈没被清空（`can().undo()` 仍为 true），
 *    但栈顶被塞进一条「整篇重置」记录。用户按一次 ⌘Z，撤掉的是那次重置
 *    （连同刚打进去的字一起消失），而不是撤掉刚打的那一个字。
 *    实测：打一个字后回灌，⌘Z 一次 → 字没了、栈深度耗尽。
 *    **别写「撤销栈被清空」—— 实测不是那样。**
 *
 * ⚠️ 即使回灌的**内容与编辑器现状语义相同**（只是序列化形态不同），
 * `setContent` 照样会产生新的 doc 对象、照样重置选区、照样污染撤销栈。
 * 所以「内容看起来一样」不能作为「可以安全整篇替换」的依据。
 *
 * 字符串比较之所以恒不相等，是因为**同一篇文档有多种写法**：
 *  · 磁盘原文带末尾换行，Tiptap 序列化不带；
 *  · 表格会被重新对齐（`| a | b |` → `| a   | b   |`）；
 *  · 反斜杠转义的写法也不同（`\_` / `_`）。
 * 三者任意一条不同，字符串就判成「内容变了」。
 *
 * ## 现在的做法：两层门
 * 1. **回声识别**（最快的一条路）：本组件自己推上去的内容被父组件原样送回来时
 *    直接跳过 —— 连解析都不做。
 * 2. **结构比较**：真正来自外部的改动，用 ProseMirror 的**文档树**比较
 *    （`doc.eq`）判断「是不是同一篇」；只有确实不同才整篇替换。
 *    结构比较天然忽略「同一篇文档的不同写法」。
 *
 * ## 为什么这层要独立成模块
 * 判定逻辑一旦写死在组件里就没有回归测试的位置 —— 而这个 bug 已经因为
 * 「判定基准错位」被漏过一次（详见 `richTextSync.test.ts`）。
 */
import type { Editor } from "@tiptap/core";
import { extractFrontmatter } from "./markdown";
import {
  protectEscapedChars,
  unprotectEscapedChars,
  restoreEscapedBackslashes,
} from "./restoreBackslashes";

/** 回灌的结果：`unchanged` = 编辑器现状已经是对的，没动它。 */
export type RichTextSyncOutcome = "unchanged" | "replaced";

/**
 * 编辑器当前内容 → **磁盘形态**的 markdown 正文（不含 frontmatter）。
 *
 * 与写盘路径同一条管线：先 unprotect（占位符还原成「\x」），
 * 再折半还原（Tiptap 加的转义 / HTML 实体去掉）。
 *
 * ⚠️ 这是**写盘形态**：末尾换行按原文补回（`original` 决定），
 * 与磁盘上长什么样一致。**不要拿它做「两篇文档是不是同一篇」的比较** ——
 * 末尾换行的差异正是字符串比较失效的原因之一。
 * 比较请走 `isSameDocument`（结构比较，天然忽略末尾换行）。
 */
export function editorBodyToDisk(editor: Editor, original?: string): string {
  const raw = unprotectEscapedChars(editor.getMarkdown());
  return restoreEscapedBackslashes(raw, original);
}

/**
 * 把正文与 frontmatter 拼成 App 侧的完整 markdown。
 * frontmatter 为空时只给正文 —— 与磁盘原文的形态一致。
 */
export function composeContent(body: string, frontmatter: string | null): string {
  return frontmatter ? `---\n${frontmatter}\n---\n\n${body}` : body;
}

/**
 * 判断「外部传来的这段 markdown」与编辑器当前内容**是不是同一篇文档**。
 *
 * 走 ProseMirror 的结构比较（`doc.eq`）：把 markdown 解析成文档树再比节点，
 * 而不是比字符串。同一篇文档的不同写法（末尾换行、表格对齐空格、转义写法）
 * 在结构上是同一棵树，因此不会误判成「内容变了」。
 *
 * 解析失败（markdown 非法）时保守返回 false —— 让调用方去替换，
 * 大不了显示一次错误，也不会静默把用户的文档留成旧的。
 */
export function isSameDocument(editor: Editor, markdownBody: string): boolean {
  const manager = editor.markdown;
  if (!manager) return false;
  try {
    const json = manager.parse(protectEscapedChars(markdownBody));
    const incoming = editor.schema.nodeFromJSON(json);
    return editor.state.doc.eq(incoming);
  } catch {
    return false;
  }
}

/**
 * 把外部内容回灌进富文本编辑器。
 *
 * @param content     父组件传入的完整 markdown（含 frontmatter）
 * @param lastEmitted 本组件最近一次推给父组件的字符串；用于识别「回声」
 * @returns 是否真的替换了编辑器内容
 */
export function syncRichTextContent(
  editor: Editor,
  content: string,
  lastEmitted: string | null,
): RichTextSyncOutcome {
  // ① 回声：父组件把我们刚推上去的内容原样送回来了。内容就是编辑器自己
  //    产出的，编辑器现状必然是对的 —— 一个字都不动。
  //    这条路径连 markdown 解析都不做，是最热的一条路。
  if (lastEmitted !== null && content === lastEmitted) return "unchanged";

  // ② 真正的外部改动：先剥 frontmatter（编辑器不碰元数据），再统一行尾。
  const { body } = extractFrontmatter(content);
  const next = body.replace(/\r\n/g, "\n");

  // ③ 结构相同就别碰 —— 碰了就是整篇替换，选区与撤销栈一起遭殃。
  if (isSameDocument(editor, next)) return "unchanged";

  editor.commands.setContent(protectEscapedChars(next), { contentType: "markdown" });
  return "replaced";
}
