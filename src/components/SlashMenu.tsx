/**
 * Slash 菜单（2026-10-04）—— `/` 唤起的块类型插入菜单。
 *
 * ## 为什么做这个
 * 这是**国外用户肌肉记忆里最强的一条**。Notion / Craft / Bear 的用户看到
 * 输入框就下意识打 `/`，然后选标题、列表、引用。这是期望值最高的一条交互 ——
 * 没有它，富文本模式在「上手速度」上就明显落后于同类产品。
 *
 * ## 键盘优先，不是鼠标优先
 * ↑↓ 移动、Enter 选中、Esc 关闭，且**打开即选中第一项** —— 用户打完 `/`
 * 直接按 Enter 就能插入 H1，全程不碰鼠标。这是 Slash 菜单的通用约定。
 * 鼠标可用，但不是主路径。
 *
 * ## 为什么自己实现而不用 `@tiptap/suggestion`
 * `suggestion` 扩展是通用机制（它自己不带 UI），官方示例里的菜单是
 * React 组件 + `ReactRenderer`。用扩展没问题，但本项目的实际情况是：
 * 菜单项**固定 10 条**、无动态过滤需求、渲染在自己的浮层里即可。
 * 直接用 `onKeyDown` 挂在编辑器上反而更短（约 150 行 vs 约 300 行），
 * 且少一个依赖。⚠️ 若将来要加「输入即过滤」（像 Notion 那样打 `/tab` 只剩表格），
 * 那时才值得换成 `suggestion` 扩展 —— 届时这条注释就是切换依据。
 *
 * ## 与格式条的关系
 * 格式条管**当前选区**（加粗、斜体…），Slash 管**插入新块**（标题、列表…）。
 * 两者互补不重叠：选区无内容时用 Slash 建块，有内容时用格式条改样式。
 */
import { useCallback, useEffect, useRef, useState } from "react";
import type { Editor } from "@tiptap/core";
import { t } from "../i18n";

/** 菜单项。`id` 与 Tiptap 的链式命令对应，`hint` 是搜索用的关键词。 */
/** Slash 菜单用到的 i18n 键 —— 字面量联合，打错键名编译不过。 */
type SlashKey =
  | "slash.menuLabel" | "slash.paragraph" | "slash.heading1" | "slash.heading2"
  | "slash.heading3" | "slash.bulletList" | "slash.orderedList"
  | "slash.taskList" | "slash.blockquote" | "slash.codeBlock" | "slash.divider";

interface Item {
  id: string;
  labelKey: SlashKey;
  hint: string;
  run: (e: Editor) => void;
}

/* 顺序即展示顺序：先最高频的（段落、标题），再列表、引用、代码。
   打开时默认选中第一项，所以第一项必须是「段落」——最安全、不改变结构的那个。 */
const ITEMS: Item[] = [
  { id: "p", labelKey: "slash.paragraph", hint: "paragraph text plain",
    run: (e) => e.chain().focus().setParagraph().run() },
  { id: "h1", labelKey: "slash.heading1", hint: "h1 heading title 大标题",
    run: (e) => e.chain().focus().setHeading({ level: 1 }).run() },
  { id: "h2", labelKey: "slash.heading2", hint: "h2 heading subtitle 小标题",
    run: (e) => e.chain().focus().setHeading({ level: 2 }).run() },
  { id: "h3", labelKey: "slash.heading3", hint: "h3 heading 小标题",
    run: (e) => e.chain().focus().setHeading({ level: 3 }).run() },
  { id: "ul", labelKey: "slash.bulletList", hint: "ul bullet list unordered 无序",
    run: (e) => e.chain().focus().toggleBulletList().run() },
  { id: "ol", labelKey: "slash.orderedList", hint: "ol ordered number list 有序",
    run: (e) => e.chain().focus().toggleOrderedList().run() },
  { id: "task", labelKey: "slash.taskList", hint: "todo task checkbox 任务",
    run: (e) => e.chain().focus().toggleTaskList().run() },
  { id: "quote", labelKey: "slash.blockquote", hint: "quote blockquote 引用",
    run: (e) => e.chain().focus().toggleBlockquote().run() },
  { id: "code", labelKey: "slash.codeBlock", hint: "code codeblock 代码",
    run: (e) => e.chain().focus().toggleCodeBlock().run() },
  { id: "div", labelKey: "slash.divider", hint: "divider rule separator 分割线",
    run: (e) => e.chain().focus().setHorizontalRule().run() },
];

interface Props {
  editor: Editor | null;
}

interface MenuState {
  /** 菜单锚定在文档的哪个绝对偏移（用于计算屏幕坐标）。 */
  at: number;
  query: string;
  active: number;
}

export function SlashMenu({ editor }: Props) {
  const [state, setState] = useState<MenuState | null>(null);
  const wrapRef = useRef<HTMLDivElement>(null);

  /** 命中项：空查询时全部可用，有查询时按 label/hint 过滤。 */
  const items = state
    ? ITEMS.filter((it) => {
        if (!state.query) return true;
        const q = state.query.toLowerCase();
        return (
          it.labelKey.toLowerCase().includes(q) ||
          it.hint.toLowerCase().includes(q)
        );
      })
    : [];

  /** 当前块内 `/` 之前的内容 —— 菜单里没选就退出时，这段要一起删掉，
   *  否则用户会留下一个孤零零的 `/`。 */
  const slashFrom = useCallback((e: Editor, at: number): number => {
    const { $from } = e.state.selection;
    const from = at - $from.parentOffset;
    // 向前找最近的 "/"（限定在当前块内：块首偏移之后才可能是触发点）
    const blockStart = $from.start();
    const text = e.state.doc.textBetween(Math.max(blockStart, from - 40), from, "\n", "\ufffc");
    const idx = text.lastIndexOf("/");
    return idx < 0 ? -1 : Math.max(blockStart, from - 40) + idx;
  }, []);

  const choose = useCallback(
    (item: Item) => {
      if (!editor || !state) return;
      const start = slashFrom(editor, state.at);
      if (start >= 0) {
        // 删掉 `/query`，只留段落本身 —— 否则菜单关掉后文本里多了个 `/`
        editor.chain().focus().deleteRange({ from: start, to: state.at }).run();
      }
      item.run(editor);
      setState(null);
    },
    [editor, state, slashFrom],
  );

  /* 监听文档变化：只在「光标紧跟一个 `/` 词」时开菜单。
   * 不用 selectionUpdate —— 那在选中移动时也会触发，菜单会乱闪。 */
  useEffect(() => {
    if (!editor) return;
    let open = false;

    // 参数不用：判断「光标处是否紧跟 `/词`」只需当前 state，不需要事务本身
    const evaluate = () => {
      const { selection } = editor.state;
      if (!selection.empty) {
        if (open) { setState(null); open = false; }
        return;
      }
      const at = selection.from;
      const start = slashFrom(editor, at);
      if (start < 0 || at - start > 20) {
        // 超过 20 字符就不是在筛菜单了（防止误触发后又自己关掉）
        if (open) { setState(null); open = false; }
        return;
      }
      const query = editor.state.doc.textBetween(start + 1, at, "\n", "\ufffc");
      if (!open) { open = true; }
      setState((prev) =>
        prev && prev.at === at && prev.query === query
          ? prev
          : { at, query, active: prev?.active ?? 0 },
      );
    };

    const onUpdate = ({ transaction }: { transaction: { selectionSet: boolean; docChanged: boolean; getMeta: (k: string) => unknown } }) => {
      if (transaction.selectionSet || transaction.docChanged) evaluate();
    };

    editor.on("transaction", onUpdate);
    // 初始也要算一次（打开文档时光标可能已在 `/` 之后）
    evaluate();
    return () => {
      editor.off("transaction", onUpdate);
    };
  }, [editor, slashFrom]);

  /* 键盘：↑↓ / Enter / Esc / Tab。挂 window 上而不是编辑器 ——
     菜单打开时焦点仍在编辑器里（选区必须保持），
     用 editorProps.handleKeyDown 才能在编辑器里按键时接管。 */
  useEffect(() => {
    if (!editor || !state || items.length === 0) return;
    const onKey = (ev: KeyboardEvent) => {
      const view = (editor as unknown as { view?: { hasFocus?: () => boolean } }).view;
      if (view?.hasFocus && !view.hasFocus()) return;
      if (ev.key === "ArrowDown") {
        ev.preventDefault();
        setState((s) => (s ? { ...s, active: (s.active + 1) % items.length } : s));
      } else if (ev.key === "ArrowUp") {
        ev.preventDefault();
        setState((s) => (s ? { ...s, active: (s.active - 1 + items.length) % items.length } : s));
      } else if (ev.key === "Enter" || ev.key === "Tab") {
        ev.preventDefault();
        choose(items[Math.min(state.active, items.length - 1)]);
      } else if (ev.key === "Escape") {
        ev.preventDefault();
        const start = slashFrom(editor, state.at);
        if (start >= 0) editor.chain().focus().deleteRange({ from: start, to: state.at }).run();
        setState(null);
      }
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [editor, state, items, choose, slashFrom]);

  /* 菜单定位：跟着光标的屏幕坐标走。用 editor.view.coordsAtPos ——
     它已经处理了滚动与窗口偏移，不必自己算。 */
  const [coords, setCoords] = useState<{ top: number; left: number } | null>(null);
  useEffect(() => {
    if (!editor || !state) { setCoords(null); return; }
    const view = (editor as unknown as {
      view?: { coordsAtPos?: (pos: number) => { left: number; bottom: number } };
    }).view;
    const c = view?.coordsAtPos?.(state.at);
    if (c) setCoords({ top: c.bottom, left: c.left });
  }, [editor, state]);

  if (!state || items.length === 0 || !coords) return null;

  return (
    <div
      ref={wrapRef}
      className="slash-menu"
      role="listbox"
      aria-label={t("slash.menuLabel")}
      style={{ top: coords.top, left: coords.left }}
    >
      {items.map((it, i) => (
        <button
          key={it.id}
          type="button"
          role="option"
          aria-selected={i === state.active}
          className={`slash-item${i === state.active ? " active" : ""}`}
          // onMouseDown + preventDefault：保住编辑器选区，否则点了菜单
          // 光标就跑到菜单上、编辑器失去焦点，插入命令作用在错误的位置
          onMouseDown={(ev) => ev.preventDefault()}
          onClick={() => choose(it)}
        >
          {t(it.labelKey)}
        </button>
      ))}
    </div>
  );
}