/**
 * Write 富文本模式 —— Tiptap（家族选型 2026-10-04）。
 *
 * 定位：**并列的第三条路**，不是替换。CodeMirror 的源码视图与Preview 都保留 ——
 * 富文本给不熟 markdown 的用户，源码视图给要精确控制语法的人，两者共用同一份
 * `content`（markdown 字符串）。所以 `viewMode` 从二态变三态。
 *
 * ## frontmatter 为什么必须先剥离
 * 实测把 `---\ntitle: X\n---` 整篇喂进来，`---` 会被解析成 setext 标题的第二个
 * `---`（即 H2），`title: X` 变成标题内容 —— 出来是 `## title: X`，元数据彻底
 * 消失。这类损失不报错、不崩溃，只是用户某天发现自己的标签和标题都没了。
 * 所以：frontmatter 交给 Write 自己（`FrontmatterPanel` + `extractFrontmatter`），
 * 编辑器只碰正文。该约束由 `tiptapRoundTrip.test.ts` 的对应用例钉住。
 *
 * ## 为什么不给 Tiptap 的 markdown 层喂原始行尾
 * 用户在 Windows 上写CRLF 文档是常态（`extractFrontmatter` 本身就处理 \r\n）。
 * Tiptap 内部统一 LF，序列化出来也是 LF；**回写磁盘时统一补回 CRLF**，
 * 否则只在 Windows 上编辑过的文档会在 git 里显示全文变更。
 *
 * ## 为什么不用 BubbleMenu / 浮动工具栏
 * 交互模型跟随国外用户的肌肉记忆（Notion / Google Docs），但 Write 是**桌面
 * 应用的编辑器面板**，不是网页正文：屏幕窄、常有分屏、工具栏常驻。所以用常驻
 * Toolbar + markdown 输入规则（`**` → 粗体那种），不引入会遮挡正文的浮动层。
 * Slash menu（`suggestion` 扩展）留作后续增量，不在本次范围。
 */
import { createContext, useContext, useEffect, useRef } from "react";
import type { Editor } from "@tiptap/core";
import { EditorContent, useEditor } from "@tiptap/react";
import { Markdown } from "@tiptap/markdown";
import Placeholder from "@tiptap/extension-placeholder";
import RichTextExtensions from "../services/richTextExtensions";
import {
  protectEscapedChars,
  unprotectEscapedChars,
  restoreEscapedBackslashes,
} from "../services/restoreBackslashes";
import { RichTextToolbar } from "./RichTextToolbar";
import { RichTextFindReplace } from "./RichTextFindReplace";
import { SlashMenu } from "./SlashMenu";
import { extractFrontmatter } from "../services/markdown";
import { t } from "../i18n";
import type { ViewMode } from "./ViewSwitch";

/**
 * 编辑器实例的上下文 —— 格式条（RichTextToolbar）靠它下发命令。
 *
 * 为什么用 Context 而不是 props 透传：editor 实例由 useEditor 在组件内创建，
 * 而格式条是**兄弟节点**（不是子节点）。传 props 就得把 editor 从 App 一路透传
 * 到格式条，中间还要求 App 持有它 —— 那是把编辑器实现细节漏到最外层。
 * Context 让 App 完全不知道 Tiptap 的存在。
 */
const RichTextCtx = createContext<Editor | null>(null);

/** 供格式条取用；在 Editor 为 null（尚未挂载）时返回 null，调用方需判空。 */
export function useRichText(): Editor | null {
  return useContext(RichTextCtx);
}

interface Props {
  /** 完整 markdown 原文（含 frontmatter）—— 与 CodeMirror 侧共用同一份。 */
  content: string;
  /** 视图开关并入富文本格式条行首（App 只在 rich 模式挂载本组件的可见态）。 */
  viewMode: ViewMode;
  onViewChange: (mode: ViewMode) => void;
  onChange: (content: string) => void;
  /** 粘贴图片事件上抛：App 负责落盘，Tiptap 这边只负责把图片插进文档。 */
  onPasteImage?: (mime: string, base64Data: string) => void;
  onCursorMove?: (line: number) => void;
  placeholder?: string;
  /** 富文本视图的查找替换开关（由 App 的 Cmd+F / 菜单 / 工具栏共用回调驱动）。 */
  findOpen?: boolean;
  onFindClose?: () => void;
}

export function RichTextEditor({
  content,
  viewMode,
  onViewChange,
  onChange,
  onPasteImage,
  onCursorMove,
  placeholder,
  /** 富文本视图的查找替换开关（由 App 的 Cmd+F / 菜单 / 工具栏共用回调驱动）。 */
  findOpen,
  onFindClose,
}: Props) {
  /** frontmatter 与正文分开存：编辑器只拿正文，改动时再拼回去。 */
  const fmRef = useRef<string | null>(null);
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;
  const pasteRef = useRef(onPasteImage);
  pasteRef.current = onPasteImage;
  // 同理：Tiptap 的回调闭包在初始化时固定，读 ref 才拿到最新的 prop
  const cursorRef = useRef(onCursorMove);
  cursorRef.current = onCursorMove;

  /* ⚠️ 反斜杠还原：不要在别处直接调 editor.getMarkdown() 写盘 ——
   * 漏一处就等于该处会把翻倍的反斜杠写进用户文档（公式与转义静默变形）。
   * 每一处都走 restoreEscapedBackslashes，实测记录见该文件。 */

  // 首帧解析一次 frontmatter（后续改动靠 onUpdate 维护 fmRef）
  /* 原文另存一份：写盘时要用它判断「末尾换行原本有没有」，否则 Tiptap 抹掉的
     末尾换行就补不回来了（它输出里已经没有这个信息）。 */
  const originalRef = useRef(content);

  // 进编辑器前保护「反斜杠 + 非字母数字」的转义序列（`\,` `\!` …）。
  // 这一步必须在 Tiptap 之前 —— 出编辑器就还原不回 `\,` 了，理由见该文件。
  const initial = extractFrontmatter(content);

  const editor = useEditor({
    extensions: [
      ...RichTextExtensions,
      Markdown,
      // 空文档提示：走 i18n 键，不硬编码语言
      Placeholder.configure({ placeholder: placeholder ?? t("editor.placeholder") }),
    ],
    content: protectEscapedChars(initial.body),
    contentType: "markdown",
    editorProps: {
      attributes: {
        class: "rich-editor",
        "data-placeholder": placeholder ?? t("editor.placeholder"),
      },
      handlePaste: (_view, event) => {
        const files = Array.from(event.clipboardData?.files ?? []);
        const image = files.find((f) => f.type.startsWith("image/"));
        if (!image || !pasteRef.current) return false;
        event.preventDefault();
        const reader = new FileReader();
        reader.onload = () => {
          const result = String(reader.result ?? "");
          const comma = result.indexOf(",");
          // data URL 形态：data:image/png;base64,XXXX —— 只取 base64 载荷
          if (comma > 0) pasteRef.current?.(image.type, result.slice(comma + 1));
        };
        reader.readAsDataURL(image);
        return true;
      },
    },
    onUpdate: ({ editor: e }) => {
      // 正文变化时保留原有 frontmatter 原样输出，不让编辑器碰它
      // 顺序固定：先 unprotect（把占位符换回「\x」）再折半还原。
      // 反过来会让占位符里的字符也参与折半判断。
      const raw = unprotectEscapedChars(e.getMarkdown());
      const body = restoreEscapedBackslashes(raw, originalRef.current);
      onChangeRef.current(fmRef.current ? `---\n${fmRef.current}\n---\n\n${body}` : body);
    },
    onSelectionUpdate: ({ editor: e }) => {
      if (!cursorRef.current) return;
      // 状态栏的章节定位按行号走；富文本模式下按光标所在块的起始偏移近似，
      // 精确行号只有源码视图能给（CodeMirror 侧仍然上报真实行号）。
      const { from } = e.state.selection;
      cursorRef.current(from);
    },
  });

  // 首次 render 后把 frontmatter 存下来
  useEffect(() => {
    if (fmRef.current === null) fmRef.current = initial.frontmatter;
    // 只在挂载时跑一次：后续 frontmatter 由 FrontmatterPanel → onChange 带回
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 外部换文档（App 切 tab / 恢复草稿）时把富文本内容换掉。
  // 刻意只在**内容不同**时 setContent：否则每次父级 re-render 都会重置选区与撤销栈。
  useEffect(() => {
    if (!editor) return;
    const { body, frontmatter } = extractFrontmatter(content);
    const next = body.replace(/\r\n/g, "\n");
    // 两边都先还原再比较：编辑器里的状态是「已翻倍」的形态，
    // 而传入的 content 是磁盘形态（单反斜杠）。不还原就比会永远不相等，
    // 于是每次父级 re-render 都重置选区与撤销栈。
    // 两边都先转成「编辑器形态」再比较：编辑器里存的是受保护+翻倍的状态，
    // 而 content 是磁盘形态。不对齐就会永远不相等，于是每次父级 re-render
    // 都重置选区与撤销栈 —— 用户切一下标签页就丢撤销历史。
    originalRef.current = content;
    const current = unprotectEscapedChars(editor.getMarkdown())
      .replace(/\r\n/g, "\n");
    if (current !== next) {
      editor.commands.setContent(protectEscapedChars(next), { contentType: "markdown" });
    }
    fmRef.current = frontmatter;
  }, [editor, content]);

  // 文档切换后重新上报一次，否则新文档的字数/状态栏会停在上一个
  useEffect(() => {
    if (editor) {
      const raw = unprotectEscapedChars(editor.getMarkdown());
      const body = restoreEscapedBackslashes(raw, originalRef.current);
      onChangeRef.current(fmRef.current ? `---\n${fmRef.current}\n---\n\n${body}` : body);
    }
  }, [editor]);

  return (
      <RichTextCtx.Provider value={editor}>
        <RichTextToolbar editor={editor} viewMode={viewMode} onViewChange={onViewChange} />
      {/* 查找替换必须挂在 Provider **内部**：它靠 useRichText() 取 editor 实例。
          挂在外面会拿到 null —— 而 null 时组件渲染成「点不动的空壳」，
          正好是查找功能最坏的失败形态。 */}
      {findOpen && <RichTextFindReplace onClose={() => onFindClose?.()} />}
      {/* Slash 菜单用 portal 之外的 fixed 定位，但要挂在 Provider 内才能拿到
          editor —— 它靠 useRichText() 读 Context。 */}
      <SlashMenu editor={editor} />
      <EditorContent editor={editor} />
    </RichTextCtx.Provider>
  );
}

/** 工具栏需要的命令集 —— 放在这里是为了让 Toolbar 与编辑器共用同一份定义，
 *  避免两处各写一遍命令名而某一项只在一处生效。 */
export const RICH_COMMANDS = {
  bold: "bold",
  italic: "italic",
  strike: "strike",
  code: "code",
  h1: "heading",
  h2: "heading",
  bulletList: "bulletList",
  orderedList: "orderedList",
  taskList: "taskList",
  blockquote: "blockquote",
  codeBlock: "codeBlock",
  link: "link",
} as const;