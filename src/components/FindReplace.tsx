/**
 * Rocktier Write — Find & Replace panel (v1.1, CodeMirror 6 edition).
 * Hooks into window.__cmView shared by Editor.
 */
import { memo, useCallback, useEffect, useRef, useState } from "react";
import { EditorView } from "@codemirror/view";
import { findNext, findPrevious, replaceAll, replaceNext, SearchQuery, setSearchQuery } from "@codemirror/search";
import { t } from "../i18n";

interface FRBtnProps {
  onClick: () => void;
  disabled?: boolean;
  title?: string;
  children: React.ReactNode;
  bordered?: boolean;
  active?: boolean;
}

const FRBtn = memo(function FRBtn({ onClick, disabled, title, children, bordered, active }: FRBtnProps) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      title={title}
      style={{
        border: bordered ? "1px solid var(--border, rgba(255,255,255,0.06))" : "none",
        background: active ? "var(--accent, rgba(255,255,255,0.1))" : "transparent",
        cursor: !disabled ? "pointer" : "default",
        padding: bordered ? "4px 8px" : "4px 6px",
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        borderRadius: "4px",
        color: "var(--text-secondary, rgba(255,255,255,0.7))",
        fontSize: bordered ? "12px" : "14px",
        opacity: disabled ? 0.35 : 1,
        transition: "background 0.15s, color 0.15s",
      }}
    >
      {children}
    </button>
  );
});

function cm(): EditorView | undefined {
  return (window as unknown as { __cmView?: EditorView }).__cmView;
}

function matchCount(text: string, term: string, regex: boolean, cs: boolean): number {
  if (!term) return 0;
  try {
    if (regex) return (text.match(new RegExp(term, cs ? "g" : "gi")) || []).length;
    const a = cs ? text : text.toLowerCase();
    const b = cs ? term : term.toLowerCase();
    let c = 0, i = 0;
    while ((i = a.indexOf(b, i)) !== -1) { c++; i += b.length; }
    return c;
  } catch { return 0; }
}

interface Props {
  onClose: () => void;
}

export const FindReplace = memo(function FindReplace({ onClose }: Props) {
  const [term, setTerm] = useState("");
  const [repl, setRepl] = useState("");
  const [regex, setRegex] = useState(false);
  const [cSens, setCSens] = useState(false);
  const [info, setInfo] = useState({ cur: 0, tot: 0 });
  const ref = useRef<HTMLInputElement>(null);

  useEffect(() => { setTimeout(() => ref.current?.focus(), 30); }, []);

  // Update search highlight + recount
  useEffect(() => {
    const v = cm();
    if (!v) return;
    const q = new SearchQuery({ search: term, caseSensitive: cSens, regexp: regex, replace: repl });
    v.dispatch({ effects: setSearchQuery.of(q) });
    const tot = matchCount(v.state.doc.toString(), term, regex, cSens);
    setInfo((p) => ({ cur: Math.min(p.cur > 0 ? p.cur : 1, tot), tot }));
  }, [term, repl, regex, cSens]);

  const go = useCallback((dir: 1 | -1) => {
    const v = cm();
    if (!v) return;
    // Use view extension commands: findNext/findPrevious
    const cmd = dir === 1 ? findNext : findPrevious;
    const ok = (cmd as unknown as (v: EditorView) => boolean)(v);
    if (ok) setInfo((p) => ({ ...p, cur: dir === 1 ? (p.cur >= p.tot ? 1 : p.cur + 1) : (p.cur <= 1 ? p.tot : p.cur - 1) }));
  }, []);

  const doReplace = useCallback(() => {
    const v = cm();
    if (!v || !term) return;
    (replaceNext as unknown as (v: EditorView) => boolean)(v);
  }, [term]);

  const doReplaceAll = useCallback(() => {
    const v = cm();
    if (!v || !term) return;
    (replaceAll as unknown as (v: EditorView) => boolean)(v);
  }, [term]);

  useEffect(() => {
    const h = (e: KeyboardEvent) => { if (e.key === "Escape") { e.preventDefault(); onClose(); } };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [onClose]);

  const has = term.length > 0;
  const label = info.tot > 0 ? `${info.cur}/${info.tot}` : "0/0";

  return (
    <div className="find-replace-bar" role="search">
      <input
        ref={ref}
        type="text"
        value={term}
        onChange={(e) => setTerm(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Escape") { e.preventDefault(); onClose(); return; }
          if (e.key === "Enter") { e.preventDefault(); e.shiftKey ? go(-1) : go(1); }
        }}
        placeholder={t("find.find")}
        spellCheck={false}
        autoCapitalize="off"
        autoComplete="off"
        autoCorrect="off"
        className="find-input"
        style={{ width: 180 }}
      />
      <span className="find-counter">{label}</span>
      <input
        type="text"
        value={repl}
        onChange={(e) => setRepl(e.target.value)}
        onKeyDown={(e) => { if (e.key === "Escape") { e.preventDefault(); onClose(); } }}
        placeholder={t("find.replace")}
        spellCheck={false}
        autoCapitalize="off"
        autoComplete="off"
        autoCorrect="off"
        className="find-input"
        style={{ width: 180 }}
      />
      <div style={{ display: "flex", gap: "4px", alignItems: "center", flexShrink: 0, fontSize: 11 }}>
        <FRBtn onClick={() => setCSens((v) => !v)} title={t("find.matchCase")} bordered active={cSens}>Aa</FRBtn>
        <FRBtn onClick={() => setRegex((v) => !v)} title={t("find.useRegex")} bordered active={regex}>.*</FRBtn>
      </div>
      <div style={{ display: "flex", gap: 2, alignItems: "center", flexShrink: 0 }}>
        <FRBtn onClick={() => go(-1)} disabled={!has} title={t("find.prevTitle")}>◀</FRBtn>
        <FRBtn onClick={() => go(1)} disabled={!has} title={t("find.nextTitle")}>▶</FRBtn>
        <FRBtn onClick={doReplace} disabled={!has || info.tot === 0} title={t("find.replaceTitle")} bordered>
          {t("find.replace")}
        </FRBtn>
        <FRBtn onClick={doReplaceAll} disabled={!has} title={t("find.replaceAllTitle")} bordered>
          {t("find.replaceAll")}
        </FRBtn>
        <FRBtn onClick={onClose} title={t("find.closeTitle")}>×</FRBtn>
      </div>
    </div>
  );
});
