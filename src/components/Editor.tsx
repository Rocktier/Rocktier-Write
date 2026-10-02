/**
 * Rocktier Write — CodeMirror 6 editor
 * Replaces the textarea from v1. Tree-shaken: only state + view + markdown + search.
 * Keeps v1 features: typewriter scroll, paragraph/sentence focus, Tab indent, list auto-continue.
 */
import { memo, useEffect, useRef } from "react";
import { Compartment, EditorState, Transaction } from "@codemirror/state";
import { EditorView, keymap } from "@codemirror/view";
import { defaultKeymap, history, historyKeymap, indentWithTab } from "@codemirror/commands";
import { markdown, markdownLanguage } from "@codemirror/lang-markdown";
import { search, searchKeymap, highlightSelectionMatches } from "@codemirror/search";
import { searchHighlight } from "./searchHighlight";
import { getUiLang } from "../i18n";
import { focusExtension } from "./focusMode";

type FocusMode = "off" | "paragraph" | "sentence";

interface CmAPI {
  view: EditorView;
}

interface Props {
  content: string;
  onChange: (content: string) => void;
  onEditorReady?: (api: CmAPI) => void;
  onCursorMove?: (line: number) => void;
  onPasteImage?: (mime: string, base64Data: string) => void;
  focusMode: FocusMode;
  /** Typewriter scrolling（光标锁 40%）——独立于 Focus Mode 的开关 */
  typewriter: boolean;
  cursorLine: number;
  placeholder?: string;
}

// ── Keymap: Enter auto-continues lists; Tab indented respecting multi-line blocks ────────────
const rocktierKeymap = keymap.of([
  {
    key: "Enter",
    run: (v) => {
      const { from } = v.state.selection.main;
      const line = v.state.doc.lineAt(from);
      const text = line.text;
      // Empty list marker → clear line
      if (/^\s*[-*+]\s+$/.test(text) || /^\s*[-*+]\s+\[[ xX]\]\s*$/.test(text)) {
        v.dispatch({ changes: { from: line.from, to: line.to, insert: "" } });
        return true;
      }
      // Task continuation
      const task = text.match(/^(\s*)([-*+])\s+\[[ xX]\]\s+(.+)$/);
      if (task) {
        v.dispatch({
          changes: { from, insert: `\n${task[1]}${task[2]} [ ] ` },
          selection: { anchor: from + 1 + task[1].length + task[2].length + 5 },
        });
        return true;
      }
      // Ordered / unordered list
      const list = text.match(/^(\s*)([-*+]|\d+[.)])\s+(.+)$/);
      if (list) {
        const marker = /^\d+/.test(list[2])
          ? `${parseInt(list[2], 10) + 1}. `
          : `${list[2]} `;
        v.dispatch({
          changes: { from, insert: `\n${list[1]}${marker}` },
          selection: { anchor: from + 1 + list[1].length + marker.length },
        });
        return true;
      }
      return false;
    },
  },
  indentWithTab,
]);

// ── EditorView theme to match tokens.css ─────────────────────────────────────────────────
const rocktierTheme = EditorView.theme({
  "&": {
    height: "100%",
    fontSize: "15px",
    fontFamily: "var(--font-mono)",
    color: "var(--text-primary)",
    backgroundColor: "transparent",
    caretColor: "var(--accent)",
  },
  ".cm-content": {
    // 居中不在这一层做：cm-content 是 CM 弹性布局的一部分，宽度约束会被
    // flex-grow 吃掉；居中在宿主 .cm-root 上做（见 app.css）。
    // padding-top 56px clears the floating Edit/Preview switch (~38px tall at top:10px)
    padding: "56px 48px 96px",
    lineHeight: "1.8",
    whiteSpace: "pre-wrap",
    wordWrap: "break-word",
    tabSize: "4",
    caretColor: "var(--accent)",
  },
  // 键盘聚焦时补一个高对比焦点环（点击进入文字区是文本输入惯例，不给鼠标噪音）
  ".cm-content:focus-visible": { outline: "2px solid var(--accent)", outlineOffset: "-2px" },
  ".cm-placeholder": { color: "var(--text-tertiary)", fontStyle: "italic" },
  ".cm-line": { padding: "0" },
  // Markdown syntax highlighting (subtle, monochrome)
  ".tok-heading": { fontWeight: "700", color: "var(--text-primary)" },
  ".tok-emphasis": { fontStyle: "italic" },
  ".tok-strong": { fontWeight: "700" },
  ".tok-link": { color: "var(--accent)" },
  ".tok-string": { color: "var(--text-secondary)" },
  ".tok-keyword": { color: "var(--accent)" },
  ".tok-comment": { color: "var(--text-muted)", fontStyle: "italic" },
  ".tok-meta": { color: "var(--text-tertiary)" },
  ".cm-selectionBackground, &.cm-focused .cm-selectionBackground": {
    background: "var(--selection) !important",
  },
  ".cm-activeLine": { backgroundColor: "transparent" },
});

export const Editor = memo(function Editor({
  content,
  onChange,
  onEditorReady,
  onCursorMove,
  onPasteImage,
  focusMode,
  typewriter,
  cursorLine,
  placeholder,
}: Props) {
  const hostRef = useRef<HTMLDivElement>(null);
  const viewRef = useRef<EditorView | null>(null);
  // Focus mode swaps its plugin in and out, so it lives in a compartment.
  const focusCompartment = useRef<Compartment>(new Compartment());

  // Keep latest callbacks in refs so CM listener doesn't re-subscribe
  const onChangeRef = useRef(onChange);
  const onCursorRef = useRef(onCursorMove);
  onChangeRef.current = onChange;
  onCursorRef.current = onCursorMove;

  // Build the editor once
  useEffect(() => {
    if (!hostRef.current) return;

    const state = EditorState.create({
      doc: content,
      extensions: [
        rocktierTheme,
        highlightSelectionMatches(),
        search(),
        searchHighlight(),
        history(),
        markdown({ base: markdownLanguage }),
        keymap.of([...defaultKeymap, ...historyKeymap, ...searchKeymap]),
        rocktierKeymap,
        focusCompartment.current.of(
          focusMode === "off" ? [] : focusExtension(focusMode),
        ),
        EditorView.updateListener.of((u) => {
          if (u.docChanged) {
            onChangeRef.current(u.state.doc.toString());
          }
          if (u.selectionSet) {
            const ln = u.state.doc.lineAt(u.state.selection.main.head).number;
            onCursorRef.current?.(ln);
          }
        }),
        EditorView.contentAttributes.of({
          "aria-label": placeholder || "",
          "spellcheck": "true",
          "lang": getUiLang(),
        }),
      ],
    });

    const view = new EditorView({ state, parent: hostRef.current });
    viewRef.current = view;
    onEditorReady?.({ view });

    return () => {
      view.destroy();
      viewRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Focus mode: swap the dimming plugin when the mode changes
  useEffect(() => {
    const view = viewRef.current;
    if (!view) return;
    view.dispatch({
      effects: focusCompartment.current.reconfigure(
        focusMode === "off" ? [] : focusExtension(focusMode),
      ),
    });
  }, [focusMode]);

  // Sync external content changes (file open / undo / switch doc)
  useEffect(() => {
    const view = viewRef.current;
    if (!view) return;
    const current = view.state.doc.toString();
    if (current !== content) {
      view.dispatch({
        changes: { from: 0, to: current.length, insert: content },
        // 外部内容同步（切标签 / 打开文件）不进撤销栈，否则 ⌘Z 会把别的文档写回当前文档（P0-3）
        annotations: Transaction.addToHistory.of(false),
      });
    }
  }, [content]);

  // Paste image → report to App so it can persist + insert the markdown link.
  // Hooked to the host's contenteditable so we can see clipboard files without
  // disturbing normal CM text paste handling.
  useEffect(() => {
    if (!onPasteImage) return;
    const host = hostRef.current;
    if (!host) return;
    const handler = (e: ClipboardEvent) => {
      const items = e.clipboardData?.items;
      if (!items) return;
      for (const item of Array.from(items)) {
        if (item.type.startsWith("image/")) {
          e.preventDefault();
          const file = item.getAsFile();
          if (!file) return;
          const reader = new FileReader();
          reader.onload = () => {
            const result = reader.result as string;
            const comma = result.indexOf(",");
            if (comma > 0) onPasteImage(item.type, result.slice(comma + 1));
          };
          reader.readAsDataURL(file);
          return;
        }
      }
    };
    host.addEventListener("paste", handler);
    return () => host.removeEventListener("paste", handler);
  }, [onPasteImage]);

  // Expose view globally so FindReplace + ChapterTree can call into it
  useEffect(() => {
    (window as unknown as { __cmView?: EditorView }).__cmView = viewRef.current ?? undefined;
  });

  // Typewriter scrolling: 光标锁在视口 40% 处。独立开关——不再焊死在
  // Focus Mode 上（W-P1-02）。坐标算取走 CM 的 coordsAtPos：折行、图片块、
  // 可变行高都正确；不再手算 (行号-1)×行高。
  const FOCUS_SCROLL_ANCHOR = 0.4;
  useEffect(() => {
    if (focusMode === "off" && !typewriter) return;
    const view = viewRef.current;
    if (!view) return;
    const pos = view.state.selection.main.head;
    let coords: { top: number } | null = null;
    try {
      coords = view.coordsAtPos(pos);
    } catch {
      return; // 布局未就绪（视图切换/隐藏时），下次光标移动再钉
    }
    if (!coords) return;
    const scroller = view.scrollDOM;
    const anchor = scroller.clientHeight * FOCUS_SCROLL_ANCHOR;
    const delta = coords.top - scroller.getBoundingClientRect().top - anchor;
    if (Math.abs(delta) > 2) {
      scroller.scrollTo({ top: scroller.scrollTop + delta });
    }
  }, [cursorLine, focusMode, typewriter]);

  return (
    <div
      className={`editor-pane cm-host ${focusMode !== "off" ? `focus-${focusMode}` : ""}`}
      data-cursor-line={cursorLine}
    >
      <div className="editor-scroll">
        <div ref={hostRef} className="cm-root" />
      </div>
    </div>
  );
});
