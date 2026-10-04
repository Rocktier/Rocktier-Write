/**
 * 富文本编辑器的扩展清单 —— **单一来源**。
 *
 * 为什么抽出来：组件（`RichTextEditor.tsx`）与两组往返测试都必须用**同一份**
 * 扩展列表。测试若自己写一份，两边不同步时会测出「假绿」—— 用例通过但线上
 * 因为少了某个扩展而丢内容，而测试完全测不到。
 *
 * 这份列表是**产品决策**：哪些语法属于 Write 的富文本视图。
 * 加语法 = 装扩展 + 在 markdown.ts 的预览侧也支持（否则只有源码视图能用）。
 *
 * 刻意**不包含**：
 *   · 数学公式 / Mermaid 的渲染扩展 —— 富文本里没有 KaTeX 渲染器，
 *     它们只作为纯文本/代码块原样透传（写盘必须逐字不变，见
 *     `richTextFidelity.test.ts`）。真要在富文本里渲染 KaTeX 是独立的一轮工作。
 *   · 表格的列宽**允许**拖拽：实测 2026-10-04，`colwidth` 只存在于
 *     ProseMirror 的 JSON 里，**不参与 markdown 序列化**
 *     （设了 colwidth=200 后 `getMarkdown()` 输出与不设时逐字相同）。
 *     所以拖列宽只是「本次会话的视觉偏好」，不会污染用户的 .md 源码。
 *     早先关掉它时我以为会写出 HTML 属性 —— 实测证明不会，这里更正。
 */
import StarterKit from "@tiptap/starter-kit";
import Image from "@tiptap/extension-image";
import TaskList from "@tiptap/extension-task-list";
import TaskItem from "@tiptap/extension-task-item";
import {
  Table,
  TableRow,
  TableCell,
  TableHeader,
} from "@tiptap/extension-table";

/** 不含 Placeholder —— 它依赖运行时语言，文案要跟着 i18n 走，故由组件现场 configure。 */
export const RichTextExtensions = [
  StarterKit,
  /** allowBase64：Write 支持粘贴图片入库，落盘策略由 App 的 onPasteImage 决定，
   *  编辑器侧只需允许 base64 data URL 存在。 */
  Image.configure({ allowBase64: true }),
  TaskList,
  /** nested：GFM 任务列表可以嵌套子任务，不开的话编辑器会拒绝嵌套结构。 */
  TaskItem.configure({ nested: true }),
  Table.configure({ resizable: true }),
  TableRow,
  TableHeader,
  TableCell,
];

export default RichTextExtensions;