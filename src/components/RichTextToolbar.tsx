/**
 * 富文本格式条（2026-10-04，Tiptap）。
 *
 * 放在**编辑区正上方**而不是顶部 Toolbar：顶部那条装的是对文档的动作
 * （新建、打开、导入、导出），格式是对**当前选区**的动作 —— 混在一起会让
 * 两类东西互相干扰，且用户在长文档里滚到中间时够不到顶部。
 *
 * ## 交互模型跟随国外用户肌肉记忆
 * Notion / Google Docs 的预期是：**看得见的格式按钮 + markdown 输入规则**。
 * 所以这里既给按钮（点得着、可发现），也保留 Tiptap 的输入规则
 * （打 `**粗体**` 自动变粗）—— 熟手用后者，生手用前者，两条路都通。
 *
 * ## 为什么按钮常驻而不是浮动（BubbleMenu）
 * 浮动工具栏在网页正文里很好，但 Write 是**桌面应用的编辑面板**：屏幕窄、
 * 常分屏、窗口小。浮层会遮住正在写的字，且在窄面板里容易溢出到窗口外。
 * 宁可用固定一条、占掉一行高度。
 *
 * ## 无障碍
 * 每个按钮带 `aria-pressed`（反映当前选区的状态，不只是「点过」）与
 * `aria-label`；`title` 与 `aria-label` 同源（都走 i18n 键），避免出现
 * 「悬停显示英文、屏幕阅读器念中文」这种分裂。
 */
import { memo } from "react";
import type { Editor } from "@tiptap/core";
import { t } from "../i18n";

interface Props {
  editor: Editor | null;
}

/** 工具栏用到的 i18n 键 —— 字面量联合，写错键名编译不过。 */
type LabelKey =
  | "rt.toolbarLabel" | "rt.addLink" | "rt.removeLinkConfirm"
  | "rt.bold" | "rt.italic" | "rt.strike" | "rt.h1" | "rt.h2"
  | "rt.bulletList" | "rt.orderedList" | "rt.taskList"
  | "rt.blockquote" | "rt.codeBlock" | "rt.link";

type FormatId =
  | "bold" | "italic" | "strike"
  | "h1" | "h2"
  | "bulletList" | "orderedList" | "taskList"
  | "blockquote" | "codeBlock"
  | "link";

/** 每一项怎么「问编辑器当前状态」与「怎么执行」。
 *  两件事必须成对：只做执行不做状态查询，按钮就永远不高亮；
 *  只做状态查询不执行，按钮就是摆设。 */
const ITEMS: ReadonlyArray<{
  id: FormatId;
  labelKey: LabelKey;
  /** 返回该格式在当前选区是否生效 */
  active: (e: Editor) => boolean;
  run: (e: Editor) => void;
  /** 需要重绘高亮的命令名（Tiptap 的事件名）；省略表示每次事务都刷新 */
  redraw?: boolean;
}> = [
  { id: "bold", labelKey: "rt.bold",
    active: (e) => e.isActive("bold"), run: (e) => e.chain().focus().toggleBold().run() },
  { id: "italic", labelKey: "rt.italic",
    active: (e) => e.isActive("italic"), run: (e) => e.chain().focus().toggleItalic().run() },
  { id: "strike", labelKey: "rt.strike",
    active: (e) => e.isActive("strike"), run: (e) => e.chain().focus().toggleStrike().run() },
  { id: "h1", labelKey: "rt.h1",
    active: (e) => e.isActive("heading", { level: 1 }),
    run: (e) => e.chain().focus().toggleHeading({ level: 1 }).run() },
  { id: "h2", labelKey: "rt.h2",
    active: (e) => e.isActive("heading", { level: 2 }),
    run: (e) => e.chain().focus().toggleHeading({ level: 2 }).run() },
  { id: "bulletList", labelKey: "rt.bulletList",
    active: (e) => e.isActive("bulletList"), run: (e) => e.chain().focus().toggleBulletList().run() },
  { id: "orderedList", labelKey: "rt.orderedList",
    active: (e) => e.isActive("orderedList"), run: (e) => e.chain().focus().toggleOrderedList().run() },
  { id: "taskList", labelKey: "rt.taskList",
    active: (e) => e.isActive("taskList"), run: (e) => e.chain().focus().toggleTaskList().run() },
  { id: "blockquote", labelKey: "rt.blockquote",
    active: (e) => e.isActive("blockquote"), run: (e) => e.chain().focus().toggleBlockquote().run() },
  { id: "codeBlock", labelKey: "rt.codeBlock",
    active: (e) => e.isActive("codeBlock"), run: (e) => e.chain().focus().toggleCodeBlock().run() },
  { id: "link", labelKey: "rt.link",
    active: (e) => e.isActive("link"),
    run: (e) => {
      // 已有链接 → 先问要不要删（避免「想改链接却先删掉了」）；
      // 没有 → 提示输入。没有输入内容就不动，胜过插入一个空链接。
      if (e.isActive("link")) {
        if (window.confirm(t("rt.removeLinkConfirm"))) e.chain().focus().unsetLink().run();
        return;
      }
      const prev = (e.getAttributes("link").href as string | undefined) ?? "";
      const url = window.prompt(t("rt.addLink"), prev);
      if (!url) return;
      // 缺协议就补上：用户直接粘贴 "example.com" 时 Tiptap 会当成相对路径，
      // 存进 .md 源码后别人点不开 —— 写盘前补全是最省事的时机。
      const full = /^[a-z][a-z0-9+.-]*:/i.test(url) ? url : `https://${url}`;
      e.chain().focus().setLink({ href: full }).run();
    } },
];

/* 极简图标：全部 16×16、stroke 走 currentColor，与家族 .icon-btn / .tbar-btn 同规范。
   刻意不引图标库 —— 12 个图标撑不起一个依赖，而这几个 path 手写更可控。 */
function Icon({ id }: { id: FormatId }) {
  const common = {
    width: 15, height: 15, viewBox: "0 0 16 16", fill: "none",
    stroke: "currentColor", strokeWidth: 1.5,
    strokeLinecap: "round" as const, strokeLinejoin: "round" as const,
  };
  switch (id) {
    case "bold":
      return <svg {...common}><path d="M4.5 3h4a2.5 2.5 0 0 1 0 5h-4z" /><path d="M4.5 8h4.6a2.5 2.5 0 0 1 0 5H4.5z" /></svg>;
    case "italic":
      return <svg {...common}><line x1="6.5" y1="3" x2="9.5" y2="3" /><line x1="5.5" y1="13" x2="8.5" y2="13" /><line x1="9.5" y1="3" x2="6.5" y2="13" /></svg>;
    case "strike":
      return <svg {...common}><path d="M3 8h10" /><path d="M5.5 5.2A2.6 2.6 0 0 1 8 3.8c1.5 0 2.6.7 2.6 1.9" /><path d="M10.5 10.8A2.6 2.6 0 0 1 8 12.2c-1.5 0-2.6-.7-2.6-1.9" /></svg>;
    case "h1":
      return <svg {...common}><path d="M3 4v8M7 4v8M3 8h4" /><path d="M10.5 5.2c.6-.5 1.7-.4 1.7.6V12" /></svg>;
    case "h2":
      return <svg {...common}><path d="M2.5 4v8M6.5 4v8M2.5 8h4" /><path d="M9.5 5.4c0-1 1.9-1.2 2.2-.2.3 1-2.2 2-2.2 3.8h2.4" /></svg>;
    case "bulletList":
      return <svg {...common}><circle cx="3.2" cy="4.2" r="1" /><circle cx="3.2" cy="8" r="1" /><circle cx="3.2" cy="11.8" r="1" /><line x1="6" y1="4.2" x2="13" y2="4.2" /><line x1="6" y1="8" x2="13" y2="8" /><line x1="6" y1="11.8" x2="13" y2="11.8" /></svg>;
    case "orderedList":
      return <svg {...common}><path d="M2.6 3.4l1.3-.7v3.6" /><path d="M2.4 7.1h2v1.3h-2zM2.4 10.6h2v1.3h-2z" /><line x1="6" y1="4" x2="13.5" y2="4" /><line x1="6" y1="8" x2="13.5" y2="8" /><line x1="6" y1="12" x2="13.5" y2="12" /></svg>;
    case "taskList":
      return <svg {...common}><path d="M2 4.4l1.4 1.4L5.8 3" /><path d="M2 11.6l1.4 1.4L5.8 10.6" /><line x1="7.6" y1="4.6" x2="13.5" y2="4.6" /><line x1="7.6" y1="11.8" x2="13.5" y2="11.8" /></svg>;
    case "blockquote":
      return <svg {...common}><path d="M3 12V7.2c0-1.6.9-2.6 2.4-3M8 12V7.2c0-1.6.9-2.6 2.4-3" /></svg>;
    case "codeBlock":
      return <svg {...common}><rect x="2.2" y="3.2" width="11.6" height="9.6" rx="1.6" /><path d="M6 6.6L4.4 8 6 9.4M10 6.6L11.6 8 10 9.4" /></svg>;
    case "link":
      return <svg {...common}><path d="M6.6 9.4a2.6 2.6 0 0 0 3.7 0l2-2a2.6 2.6 0 0 0-3.7-3.7l-1 1" /><path d="M9.4 6.6a2.6 2.6 0 0 0-3.7 0l-2 2a2.6 2.6 0 0 0 3.7 3.7l1-1" /></svg>;
  }
}

export const RichTextToolbar = memo(function RichTextToolbar({ editor }: Props) {
  // 编辑器未挂载时渲染空条：宁可短暂空白，也不要渲染一排点了没反应的按钮
  if (!editor) return <div className="rt-toolbar" aria-hidden="true" />;

  return (
    /* role="toolbar" 的 aria-label 要说的是**这一整条**是什么，不是第一个按钮。
       早先图省事填了 t("rt.bold")，屏幕阅读器会念「加粗，工具栏」——
       语义反了。 */
    <div className="rt-toolbar" role="toolbar" aria-label={t("rt.toolbarLabel")}>
      {ITEMS.map((item) => {
        const label = t(item.labelKey);
        const on = item.active(editor);
        return (
          <button
            key={item.id}
            type="button"
            className={`rt-btn${on ? " active" : ""}`}
            // `onMouseDown` + preventDefault：否则按钮会抢走编辑器选区，
            // 点了「加粗」之后光标丢失，无法继续输入 —— 这是格式条最常见的坑。
            onMouseDown={(ev) => ev.preventDefault()}
            onClick={() => item.run(editor)}
            aria-pressed={on}
            aria-label={label}
            title={label}
          >
            <Icon id={item.id} />
          </button>
        );
      })}
    </div>
  );
});