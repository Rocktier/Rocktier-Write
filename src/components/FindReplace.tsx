import { memo, useCallback, useEffect, useRef, useState } from "react";
import { t, useUiLang } from "../i18n";

interface FindReplaceButtonProps {
  onClick: () => void;
  disabled?: boolean;
  title?: string;
  children: React.ReactNode;
  bordered?: boolean;
  active?: boolean;
}

const FindReplaceButton = memo(function FindReplaceButton({
  onClick,
  disabled,
  title,
  children,
  bordered,
  active,
}: FindReplaceButtonProps) {
  const [hovered, setHovered] = useState(false);
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      title={title}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        border: bordered
          ? "1px solid var(--border, rgba(255,255,255,0.06))"
          : "none",
        background: hovered && !disabled
          ? "var(--accent-muted, rgba(255,255,255,0.08))"
          : active
            ? "var(--accent, rgba(255,255,255,0.15))"
            : "transparent",
        cursor: !disabled ? "pointer" : "default",
        padding: bordered ? "4px 8px" : "4px 6px",
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        borderRadius: "4px",
        color: hovered && !disabled
          ? "var(--text-primary, #fff)"
          : "var(--text-secondary, rgba(255,255,255,0.7))",
        fontSize: bordered ? "12px" : "14px",
        opacity: disabled ? 0.35 : 1,
        whiteSpace: bordered ? "nowrap" : "normal",
        lineHeight: 1,
        transition: "background 0.15s, color 0.15s",
      }}
    >
      {children}
    </button>
  );
});

interface Props {
  content: string;
  textareaRef: React.RefObject<HTMLTextAreaElement>;
  onChange: (newContent: string) => void;
  onClose: () => void;
}

export const FindReplace = memo(function FindReplace({
  content,
  textareaRef,
  onChange,
  onClose,
}: Props) {
  const [searchTerm, setSearchTerm] = useState("");
  const [replaceText, setReplaceText] = useState("");
  const [matchIndex, setMatchIndex] = useState(0);
  const [matchCount, setMatchCount] = useState(0);
  const [useRegex, setUseRegex] = useState(false);
  const [caseSensitive, setCaseSensitive] = useState(false);

  const searchInputRef = useRef<HTMLInputElement>(null);

  useUiLang(); // 语言切换时重渲染

  // Focus search input on mount
  useEffect(() => {
    const tid = setTimeout(() => searchInputRef.current?.focus(), 30);
    return () => clearTimeout(tid);
  }, []);

  // 通过 execCommand("insertText") 改写文本区：浏览器会把它记入原生 undo 栈，
  // 替换/全部替换之后 Ctrl+Z（⌘Z）可以一步撤销。
  const splice = useCallback(
    (from: number, to: number, text: string) => {
      const el = textareaRef.current;
      if (!el) return;
      el.focus();
      el.setSelectionRange(from, to);
      if (!document.execCommand("insertText", false, text)) {
        // 兜底：极老内核不支持 execCommand 时退回直接赋值（此时撤销不可用）
        el.value = el.value.slice(0, from) + text + el.value.slice(to);
        el.setSelectionRange(from + text.length, from + text.length);
      }
      onChange(el.value);
    },
    [textareaRef, onChange]
  );

  // Compute all match positions for the current search term in content
  // Returns index+length pairs so regex matches work (variable-length).
  const computeMatches = useCallback(
    (term: string): { index: number; length: number }[] => {
      if (!term) return [];
      const matches: { index: number; length: number }[] = [];
      try {
        if (useRegex) {
          const flags = caseSensitive ? "g" : "gi";
          const re = new RegExp(term, flags);
          let m: RegExpExecArray | null;
          while ((m = re.exec(content)) !== null) {
            matches.push({ index: m.index, length: m[0].length });
            if (m.index === re.lastIndex) re.lastIndex++;
          }
        } else {
          const target = caseSensitive ? content : content.toLowerCase();
          const query = caseSensitive ? term : term.toLowerCase();
          let i = 0;
          while (i <= target.length - query.length) {
            const found = target.indexOf(query, i);
            if (found === -1) break;
            matches.push({ index: found, length: query.length });
            i = found + query.length;
          }
        }
      } catch {
        // regex parse failure — return no matches
      }
      return matches;
    },
    [content, useRegex, caseSensitive]
  );

  // Select a match in the textarea and scroll into view
  const selectMatch = useCallback(
    (matches: { index: number; length: number }[], idx: number) => {
      const el = textareaRef.current;
      if (!el || matches.length === 0) return;
      const clamped = ((idx % matches.length) + matches.length) % matches.length;
      const start = matches[clamped].index;
      const end = start + matches[clamped].length;

      el.focus();
      el.setSelectionRange(start, end);

      // Scroll into view: compute line number by counting \n before match
      const line = content.substring(0, start).split("\n").length - 1;
      const lineHeight = parseFloat(getComputedStyle(el).lineHeight) || 22;
      const targetScroll = line * lineHeight - el.clientHeight / 3;
      el.scrollTop = Math.max(0, targetScroll);
    },
    [textareaRef, content]
  );

  // Handle search input change
  const onSearchChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const term = e.target.value;
      setSearchTerm(term);
      const matches = computeMatches(term);
      setMatchCount(matches.length);
      setMatchIndex(matches.length > 0 ? 1 : 0);
      if (matches.length > 0) {
        selectMatch(matches, 0);
      }
    },
    [computeMatches, selectMatch]
  );

  // Go to next match
  const goNext = useCallback(() => {
    const matches = computeMatches(searchTerm);
    if (matches.length === 0) return;
    const el = textareaRef.current;
    let nextIndex = matchIndex % matches.length;
    if (el) {
      const selStart = el.selectionStart;
      const foundAt = matches.findIndex((m) => m.index === selStart);
      if (foundAt !== -1) {
        nextIndex = (foundAt + 1) % matches.length;
      }
    }
    setMatchIndex(nextIndex + 1);
    selectMatch(matches, nextIndex);
  }, [computeMatches, matchIndex, searchTerm, selectMatch, textareaRef]);

  // Go to previous match
  const goPrev = useCallback(() => {
    const matches = computeMatches(searchTerm);
    if (matches.length === 0) return;
    const el = textareaRef.current;
    let prevIndex = (matchIndex - 2 + matches.length) % matches.length;
    if (el) {
      const selStart = el.selectionStart;
      const foundAt = matches.findIndex((m) => m.index === selStart);
      if (foundAt !== -1) {
        prevIndex = (foundAt - 1 + matches.length) % matches.length;
      }
    }
    setMatchIndex(prevIndex + 1);
    selectMatch(matches, prevIndex);
  }, [computeMatches, matchIndex, searchTerm, selectMatch, textareaRef]);

  // Replace current selection and advance
  const doReplace = useCallback(() => {
    const el = textareaRef.current;
    if (!el || !searchTerm) return;
    const selStart = el.selectionStart;
    const selEnd = el.selectionEnd;
    const selectedText = content.substring(selStart, selEnd);

    // Figure out whether the current selection matches (regex-aware)
    let isMatch = false;
    try {
      if (useRegex) {
        const flags = caseSensitive ? "g" : "gi";
        const re = new RegExp(searchTerm, flags);
        isMatch = re.test(selectedText) && selectedText.match(re)?.[0] === selectedText;
      } else {
        isMatch = caseSensitive
          ? selectedText === searchTerm
          : selectedText.toLowerCase() === searchTerm.toLowerCase();
      }
    } catch {
      isMatch = false;
    }

    if (isMatch) {
      // 经由 execCommand 改写，保留原生 undo 栈
      splice(selStart, selEnd, replaceText);
      const newContent = content.substring(0, selStart) + replaceText + content.substring(selEnd);

      requestAnimationFrame(() => {
        // Recompute matches against the NEW content (stale closure otherwise)
        let newMatches: { index: number; length: number }[] = [];
        try {
          if (useRegex) {
            const flags = caseSensitive ? "g" : "gi";
            const re = new RegExp(searchTerm, flags);
            let m: RegExpExecArray | null;
            while ((m = re.exec(newContent)) !== null) {
              newMatches.push({ index: m.index, length: m[0].length });
              if (m.index === re.lastIndex) re.lastIndex++;
            }
          } else {
            const target = caseSensitive ? newContent : newContent.toLowerCase();
            const query = caseSensitive ? searchTerm : searchTerm.toLowerCase();
            let i = 0;
            while (i <= target.length - query.length) {
              const found = target.indexOf(query, i);
              if (found === -1) break;
              newMatches.push({ index: found, length: query.length });
              i = found + query.length;
            }
          }
        } catch { /* regex failure */ }
        setMatchCount(newMatches.length);

        if (newMatches.length > 0) {
          const nextPos = selStart + replaceText.length;
          let nextMatchIdx = newMatches.findIndex((m) => m.index >= nextPos);
          if (nextMatchIdx === -1) nextMatchIdx = 0;
          setMatchIndex(nextMatchIdx + 1);
          const m = newMatches[nextMatchIdx];
          el.focus();
          el.setSelectionRange(m.index, m.index + m.length);
          const line = newContent.substring(0, m.index).split("\n").length - 1;
          const lh = parseFloat(getComputedStyle(el).lineHeight) || 22;
          el.scrollTop = Math.max(0, line * lh - el.clientHeight / 3);
        } else {
          setMatchIndex(0);
        }
      });
    } else {
      // Selection doesn't match; go to next instead
      goNext();
    }
  }, [textareaRef, searchTerm, replaceText, content, splice, useRegex, caseSensitive, goNext]);

  // Replace all occurrences — 单次整体改写，Ctrl+Z / ⌘Z 一步撤销
  const doReplaceAll = useCallback(() => {
    if (!searchTerm) return;
    let newContent: string;
    try {
      if (useRegex) {
        const flags = caseSensitive ? "g" : "gi";
        newContent = content.replace(new RegExp(searchTerm, flags), replaceText);
      } else {
        // Escape regex special chars for literal replace
        const escaped = searchTerm.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
        const flags = caseSensitive ? "g" : "gi";
        // 函数式替换：字面量模式下 $& / $1 必须原样输出，否则"替换成 $&"会变成
        // 插入匹配内容（"替换当前"走 splice 是字面语义，两处必须一致）
        newContent = content.replace(new RegExp(escaped, flags), () => replaceText);
      }
    } catch {
      return;
    }
    if (newContent === content) {
      setMatchCount(0);
      setMatchIndex(0);
      return;
    }
    const el = textareaRef.current;
    if (el) {
      el.focus();
      el.setSelectionRange(0, content.length);
      if (!document.execCommand("insertText", false, newContent)) {
        // 兜底：不支持 execCommand 时退回直接赋值（此时撤销不可用）
        el.value = newContent;
        el.setSelectionRange(newContent.length, newContent.length);
      }
    }
    onChange(newContent);
    setMatchCount(0);
    setMatchIndex(0);
  }, [searchTerm, replaceText, content, onChange, textareaRef, useRegex, caseSensitive]);

  // Global Escape handler + Enter/Shift+Enter on search input
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        onClose();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onClose]);

  const onSearchKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      e.preventDefault();
      if (e.shiftKey) {
        goPrev();
      } else {
        goNext();
      }
    } else if (e.key === "Escape") {
      e.preventDefault();
      onClose();
    }
  };

  const hasTerm = searchTerm.length > 0;
  const counterLabel = matchCount > 0 ? `${matchIndex}/${matchCount}` : "0/0";

  return (
    <div
      style={{
        position: "absolute",
        top: 0,
        left: 0,
        right: 0,
        zIndex: 5,
        background: "var(--bg-floating, #141414)",
        borderBottom: "1px solid var(--border, rgba(255,255,255,0.06))",
        padding: "6px 10px",
        display: "flex",
        gap: "6px",
        alignItems: "center",
        font: "inherit",
      }}
      className="find-replace-bar"
    >
      {/* Search input */}
      <input
        ref={searchInputRef}
        type="text"
        value={searchTerm}
        onChange={onSearchChange}
        onKeyDown={onSearchKeyDown}
        placeholder={t("find.find")}
        spellCheck={false}
        autoCapitalize="off"
        autoComplete="off"
        autoCorrect="off"
        style={{
          flex: "1 1 auto",
          minWidth: 0,
          border: "1px solid var(--border, rgba(255,255,255,0.06))",
          background: "var(--bg-primary, #000)",
          color: "var(--text-primary, #fff)",
          padding: "4px 8px",
          fontSize: "13px",
          borderRadius: "4px",
          outline: "none",
          fontFamily: "inherit",
        }}
      />

      {/* Match counter */}
      <span
        style={{
          fontSize: "12px",
          color: "var(--text-muted, rgba(255,255,255,0.3))",
          minWidth: "40px",
          textAlign: "center",
          flexShrink: 0,
          userSelect: "none",
        }}
      >
        {counterLabel}
      </span>

      {/* Replace input */}
      <input
        type="text"
        value={replaceText}
        onChange={(e) => setReplaceText(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Escape") {
            e.preventDefault();
            onClose();
          }
        }}
        placeholder={t("find.replace")}
        spellCheck={false}
        autoCapitalize="off"
        autoComplete="off"
        autoCorrect="off"
        style={{
          flex: "1 1 auto",
          minWidth: 0,
          border: "1px solid var(--border, rgba(255,255,255,0.06))",
          background: "var(--bg-primary, #000)",
          color: "var(--text-primary, #fff)",
          padding: "4px 8px",
          fontSize: "13px",
          borderRadius: "4px",
          outline: "none",
          fontFamily: "inherit",
        }}
      />

      {/* Options */}
      <div style={{ display: "flex", gap: "4px", alignItems: "center", flexShrink: 0, fontSize: "11px" }}>
        <FindReplaceButton onClick={() => setCaseSensitive((v) => !v)} title={t("find.matchCase")} bordered active={caseSensitive}>
          Aa
        </FindReplaceButton>
        <FindReplaceButton onClick={() => setUseRegex((v) => !v)} title={t("find.useRegex")} bordered active={useRegex}>
          .*
        </FindReplaceButton>
      </div>

      {/* Buttons */}
      <div
        style={{
          display: "flex",
          gap: "2px",
          alignItems: "center",
          flexShrink: 0,
        }}
      >
        {/* Previous */}
        <FindReplaceButton onClick={goPrev} disabled={!hasTerm} title={t("find.prevTitle")}>
          &#9664;
        </FindReplaceButton>

        {/* Next */}
        <FindReplaceButton onClick={goNext} disabled={!hasTerm} title={t("find.nextTitle")}>
          &#9654;
        </FindReplaceButton>

        {/* Separator */}
        <div
          style={{
            width: "1px",
            height: "18px",
            background: "var(--border, rgba(255,255,255,0.06))",
            flexShrink: 0,
          }}
        />

        {/* Replace */}
        <FindReplaceButton
          onClick={doReplace}
          disabled={!hasTerm || matchCount === 0}
          title={t("find.replaceTitle")}
          bordered
        >
          {t("find.replace")}
        </FindReplaceButton>

        {/* Replace All */}
        <FindReplaceButton
          onClick={doReplaceAll}
          disabled={!hasTerm}
          title={t("find.replaceAllTitle")}
          bordered
        >
          {t("find.replaceAll")}
        </FindReplaceButton>

        {/* Close */}
        <FindReplaceButton onClick={onClose} title={t("find.closeTitle")}>
          &times;
        </FindReplaceButton>
      </div>

      {/* Focus ring for inputs */}
      <style>{`
        .find-replace-bar input:focus {
          border-color: var(--border-mid, rgba(255,255,255,0.1)) !important;
        }
      `}</style>
    </div>
  );
});
