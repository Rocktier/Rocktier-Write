import { memo, useCallback, useRef, useEffect, type RefObject } from "react";
import { t, useUiLang } from "../i18n";

type FocusMode = "off" | "paragraph" | "sentence";

interface Props {
  content: string;
  onChange: (content: string) => void;
  textareaRef?: RefObject<HTMLTextAreaElement | null>;
  onCursorMove?: () => void;
  focusMode: FocusMode;
  cursorLine: number;
}

const INDENT = "  ";

export const Editor = memo(function Editor({ content, onChange, textareaRef, onCursorMove, focusMode, cursorLine }: Props) {
  const internalRef = useRef<HTMLTextAreaElement>(null);
  const ref = textareaRef || internalRef;
  useUiLang();

  // Typewriter scrolling: keep cursor at ~40% viewport height
  const typewriterScroll = useCallback(() => {
    const el = ref.current;
    if (!el) return;
    const lineHeight = parseFloat(getComputedStyle(el).lineHeight) || 28;
    const viewportHeight = el.clientHeight;
    const targetPos = viewportHeight * 0.4;
    const cursorPos = (cursorLine - 1) * lineHeight;
    const desiredScroll = cursorPos - targetPos;
    if (Math.abs(el.scrollTop - desiredScroll) > lineHeight * 0.5) {
      el.scrollTop = Math.max(0, desiredScroll);
    }
  }, [cursorLine, ref]);

  useEffect(() => {
    if (focusMode !== "off") {
      // Delay one frame so the selection has been set
      requestAnimationFrame(typewriterScroll);
    }
  }, [cursorLine, focusMode, typewriterScroll]);

  const onInput = useCallback((e: React.ChangeEvent<HTMLTextAreaElement>) => {
    onChange(e.target.value);
  }, [onChange]);

  const splice = useCallback((el: HTMLTextAreaElement, from: number, to: number, text: string) => {
    el.focus();
    el.setSelectionRange(from, to);
    if (!document.execCommand("insertText", false, text)) {
      el.value = el.value.slice(0, from) + text + el.value.slice(to);
      el.setSelectionRange(from + text.length, from + text.length);
    }
    onChange(el.value);
  }, [onChange]);

  const onKey = useCallback((e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    const el = e.currentTarget;
    if (e.key === "Tab") {
      e.preventDefault();
      const s = el.selectionStart;
      const end = el.selectionEnd;
      const value = el.value;

      if (s !== end && value.slice(s, end).includes("\n")) {
        const lineStart = value.lastIndexOf("\n", s - 1) + 1;
        const block = value
          .slice(lineStart, end)
          .split("\n")
          .map((line) => {
            if (e.shiftKey) {
              return line.startsWith(INDENT) ? line.slice(INDENT.length) : line;
            }
            return INDENT + line;
          })
          .join("\n");
        splice(el, lineStart, end, block);
        el.setSelectionRange(lineStart, lineStart + block.length);
        return;
      }

      if (e.shiftKey) {
        const nl = value.lastIndexOf("\n", s - 1) + 1;
        if (value.slice(nl, nl + INDENT.length) === INDENT) {
          splice(el, nl, nl + INDENT.length, "");
          const caret = Math.max(nl, s - INDENT.length);
          el.setSelectionRange(caret, caret);
        }
      } else {
        splice(el, s, end, INDENT);
      }
      return;
    }
    if (e.key === "Enter" && !e.shiftKey && el.selectionStart === el.selectionEnd) {
      const s = el.selectionStart;
      const before = el.value.slice(0, s);
      const nl = before.lastIndexOf("\n") + 1;
      const line = before.slice(nl);

      if (/^\s*[-*+]\s+$/.test(line) || /^\s*[-*+]\s+\[[ xX]\]\s*$/.test(line)) {
        e.preventDefault();
        splice(el, nl, s, "");
        return;
      }
      const task = line.match(/^(\s*)([-*+])\s+\[[ xX]\]\s+(.+)$/);
      if (task) {
        e.preventDefault();
        splice(el, s, s, `\n${task[1]}${task[2]} [ ] `);
        return;
      }
      const list = line.match(/^(\s*)([-*+]|\d+[.)])\s+(.+)$/);
      if (list) {
        e.preventDefault();
        const marker = /^\d+/.test(list[2]) ? `${parseInt(list[2], 10) + 1}. ` : `${list[2]} `;
        splice(el, s, s, `\n${list[1]}${marker}`);
        return;
      }
    }
  }, [onChange, splice]);

  const focusClass = focusMode !== "off" ? `focus-${focusMode}` : "";

  return (
    <div className={`editor-pane ${focusClass}`} data-cursor-line={cursorLine}>
      <div className="editor-scroll">
        <textarea
          ref={ref as React.Ref<HTMLTextAreaElement>}
          className="editor-area"
          value={content}
          onChange={onInput}
          onKeyDown={onKey}
          onKeyUp={onCursorMove}
          onClick={onCursorMove}
          spellCheck={false}
          autoCapitalize="off"
          autoComplete="off"
          autoCorrect="off"
          placeholder={t("editor.placeholder")}
        />
      </div>
    </div>
  );
});
