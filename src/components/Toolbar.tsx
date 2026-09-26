/**
 * Rocktier Write — toolbar.
 *
 * One visual grammar: icon + word for every action, grouped by verb with
 * hairline seams — Create (New, Open, Import) on the left with the brand,
 * Output (Save, PDF) and Tools (Find, Goal, Focus, Info, Theme) on the right.
 * The floating middle is gone: Focus lives in Tools, the status bar keeps the
 * fuller state copy, and Recent is a chevron on Open instead of a second clock.
 */
import { memo, useState, useRef, useEffect } from "react";
import { t } from "../i18n";
import { RecentMenu } from "./RecentMenu";

type FocusMode = "off" | "paragraph" | "sentence";

interface Props {
  onToggleSidebar: () => void;
  onNew: () => void;
  onOpen: () => void;
  onSave: () => void;
  onImportDocx: () => void;
  modified: boolean;
  onToggleTheme: () => void;
  onFindReplace: () => void;
  hasFrontmatter: boolean;
  frontmatterOpen: boolean;
  onToggleInfo: () => void;
  focusMode: FocusMode;
  onCycleFocus: () => void;
  wordGoal: number;
  words: number;
  onSetWordGoal: (n: number) => void;
  onExportPdf?: () => void;
  recentItems?: string[];
  onOpenRecent?: (path: string) => void;
  onClearRecent?: () => void;
}

// 状态芯片里只放档位词；"Focus:" 前缀由按钮标签本身承担
const FOCUS_MODE_WORD: Record<FocusMode, () => string> = {
  off: () => t("toolbar.focusOff"),
  paragraph: () => t("toolbar.focusParagraph"),
  sentence: () => t("toolbar.focusSentence"),
};

export const Toolbar = memo(function Toolbar({
  onToggleSidebar,
  onNew,
  onOpen,
  onSave,
  onImportDocx,
  modified,
  onToggleTheme,
  onFindReplace,
  hasFrontmatter,
  frontmatterOpen,
  onToggleInfo,
  focusMode,
  onCycleFocus,
  wordGoal,
  words,
  onSetWordGoal,
  onExportPdf,
  recentItems,
  onOpenRecent,
  onClearRecent,
}: Props) {
  const [goalInputOpen, setGoalInputOpen] = useState(false);
  const [goalDraft, setGoalDraft] = useState("");
  const [recentMenuOpen, setRecentMenuOpen] = useState(false);
  const goalInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (goalInputOpen) goalInputRef.current?.focus();
  }, [goalInputOpen]);

  const commitGoal = () => {
    const n = parseInt(goalDraft, 10);
    onSetWordGoal(Number.isFinite(n) && n > 0 ? n : 0);
    setGoalInputOpen(false);
    setGoalDraft("");
  };

  const openGoalEditor = () => {
    setGoalDraft(wordGoal > 0 ? String(wordGoal) : "1000");
    setGoalInputOpen(true);
  };

  const goalProgress = wordGoal > 0 ? Math.min(100, Math.round((words / wordGoal) * 100)) : 0;

  return (
    <header className="toolbar">
      <div className="toolbar-side">
        <button className="tbar-btn" onClick={onToggleSidebar} title={t("toolbar.toggleSidebar")} aria-label={t("toolbar.toggleSidebar")}>
          <svg width="15" height="15" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.3" aria-hidden="true">
            <rect x="1.5" y="1.5" width="13" height="13" rx="2" />
            <line x1="5.5" y1="1.5" x2="5.5" y2="14.5" />
          </svg>
        </button>
        <div className="brand">
          <svg className="brand-mark" viewBox="0 0 32 32" fill="none" aria-hidden="true">
            <rect className="brand-tile" x="1" y="1" width="30" height="30" rx="8.5" />
            <text className="brand-letters" x="17" y="17.4" fontSize="12" fontWeight="700" letterSpacing="-0.5" textAnchor="middle" dominantBaseline="central">WR</text>
            <circle className="brand-badge" cx="8.6" cy="8.6" r="4.6" />
            <path d="M6.6 8.7l1.4 1.4 2.4-2.7" stroke="#0a0a0a" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" fill="none" />
            <circle className="brand-pip" cx="25.8" cy="6.2" r="2.2" />
          </svg>
          <span className="brand-name">Rocktier<span className="tag">Write</span></span>
        </div>

        {/* ── Create：进来 ── */}
        <div className="tgroup" role="group" aria-label={t("toolbar.groupCreate")}>
          <button className="tbar-btn labeled" onClick={onNew} title={t("toolbar.new")} aria-label={t("toolbar.new")}>
            <svg width="15" height="15" viewBox="0 0 15 15" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" aria-hidden="true">
              <line x1="7.5" y1="2" x2="7.5" y2="13" />
              <line x1="2" y1="7.5" x2="13" y2="7.5" />
            </svg>
            <span className="tbar-label">{short(t("toolbar.new"))}</span>
          </button>
          <div className="split">
            <button className="tbar-btn labeled split-main" onClick={onOpen} title={t("toolbar.open")} aria-label={t("toolbar.open")}>
              <svg width="15" height="15" viewBox="0 0 15 15" fill="none" stroke="currentColor" strokeWidth="1.3" aria-hidden="true">
                <path d="M2 4h4l1.5 1.5H12a1 1 0 0 1 1 1V11a1 1 0 0 1-1 1H2a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1z" />
              </svg>
              <span className="tbar-label">{short(t("toolbar.open"))}</span>
            </button>
            <button
              className="split-caret"
              onClick={() => setRecentMenuOpen((v) => !v)}
              title={t("recent.title")}
              aria-label={t("recent.title")}
              aria-haspopup="menu"
              aria-expanded={recentMenuOpen}
            >
              <svg width="8" height="8" viewBox="0 0 8 8" fill="none" stroke="currentColor" strokeWidth="1.2" aria-hidden="true">
                <polyline points="1.5,3 4,5.5 6.5,3" />
              </svg>
            </button>
            {recentMenuOpen && onOpenRecent && onClearRecent && (
              <RecentMenuHost items={recentItems ?? []} onOpen={onOpenRecent} onClear={onClearRecent} onClose={() => setRecentMenuOpen(false)} />
            )}
          </div>
          <button className="tbar-btn labeled" onClick={onImportDocx} title={t("toolbar.importDocx")} aria-label={t("toolbar.importDocx")}>
            <svg width="15" height="15" viewBox="0 0 15 15" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <line x1="7.5" y1="12.5" x2="7.5" y2="3.5" />
              <polyline points="5,5.5 7.5,2.5 10,5.5" fill="none" />
              <line x1="2.5" y1="13" x2="12.5" y2="13" />
            </svg>
            <span className="tbar-label">{t("toolbar.import")}</span>
          </button>
        </div>
      </div>

      <div className="toolbar-spacer" />

      {/* ── Output：出去 ── */}
      <div className="tgroup" role="group" aria-label={t("toolbar.groupOutput")}>
        <button className={`tbar-btn labeled ${modified ? "has-action" : ""}`} onClick={onSave} title={t("toolbar.saveAs")} aria-label={t("toolbar.saveAs")}>
          {modified && <span className="save-dot" aria-hidden="true" />}
          <svg width="15" height="15" viewBox="0 0 15 15" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round" aria-hidden="true">
            <path d="M3 1v5h8V1M3 14v-4h9v4" />
            <path d="M1 6v8h13V6" />
          </svg>
          <span className="tbar-label">{t("toolbar.saveAs")}</span>
        </button>
        {onExportPdf && (
          <button className="tbar-btn labeled" onClick={onExportPdf} title={t("menu.exportPdf")} aria-label={t("menu.exportPdf")}>
            <svg width="15" height="15" viewBox="0 0 15 15" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <line x1="7.5" y1="2.5" x2="7.5" y2="11.5" />
              <polyline points="5,9.5 7.5,12.5 10,9.5" fill="none" />
              <line x1="2.5" y1="13" x2="12.5" y2="13" />
            </svg>
            <span className="tbar-label">PDF</span>
          </button>
        )}
      </div>

      <div className="vsep" />

      {/* ── Tools ── */}
      <div className="tgroup" role="group" aria-label={t("toolbar.groupTools")}>
        <button className="tbar-btn labeled" onClick={onFindReplace} title={t("toolbar.find")} aria-label={t("toolbar.find")}>
          <svg width="15" height="15" viewBox="0 0 15 15" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" aria-hidden="true">
            <circle cx="6.5" cy="6.5" r="4" />
            <line x1="9.5" y1="9.5" x2="13" y2="13" />
          </svg>
          <span className="tbar-label">{t("toolbar.findShort")}</span>
        </button>

        {goalInputOpen ? (
          <input
            ref={goalInputRef}
            className="goal-input"
            type="number"
            min="1"
            placeholder={t("toolbar.goalPlaceholder")}
            value={goalDraft}
            onChange={(e) => setGoalDraft(e.target.value)}
            onBlur={commitGoal}
            onKeyDown={(e) => {
              if (e.key === "Enter") commitGoal();
              else if (e.key === "Escape") { setGoalInputOpen(false); setGoalDraft(""); }
            }}
            aria-label={t("toolbar.setGoal")}
          />
        ) : (
          <button className="tbar-btn labeled" onClick={openGoalEditor} title={t("toolbar.setGoal")} aria-label={t("toolbar.setGoal")}>
            <span className="tbar-label">{t("toolbar.goalShort")}</span>
            {wordGoal > 0 && (
              <span className="state" title={`${t("status.words", { n: words })} · ${t("toolbar.goalProgress", { pct: goalProgress })}`}>
                {wordGoal >= 1000 ? `${(wordGoal / 1000).toFixed(1)}k` : wordGoal}
              </span>
            )}
          </button>
        )}

        <button className="tbar-btn labeled" onClick={onCycleFocus} title={t("toolbar.focusCycle")} aria-label={t("toolbar.focusCycle")}>
          <span className="tbar-label">{t("toolbar.focus")}</span>
          <span className={`state ${focusMode !== "off" ? "on" : ""}`}>{FOCUS_MODE_WORD[focusMode]()}</span>
        </button>

        {hasFrontmatter && (
          <button className={`tbar-btn ghost-ic ${frontmatterOpen ? "active" : ""}`} onClick={onToggleInfo} title={t("toolbar.info")} aria-label={t("toolbar.info")}>
            <svg width="15" height="15" viewBox="0 0 15 15" fill="none" stroke="currentColor" strokeWidth="1.3" aria-hidden="true">
              <circle cx="7.5" cy="7.5" r="5.5" />
              <circle cx="7.5" cy="5" r="0.8" fill="currentColor" stroke="none" />
              <line x1="7.5" y1="7" x2="7.5" y2="11" />
            </svg>
          </button>
        )}

        <button className="tbar-btn ghost-ic theme-btn" onClick={onToggleTheme} title={t("toolbar.theme")} aria-label={t("toolbar.theme")}>
          <svg className="icon-sun" width="15" height="15" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" aria-hidden="true">
            <circle cx="7" cy="7" r="3" />
            <line x1="7" y1="1" x2="7" y2="2.5" />
            <line x1="7" y1="11.5" x2="7" y2="13" />
            <line x1="1" y1="7" x2="2.5" y2="7" />
            <line x1="11.5" y1="7" x2="13" y2="7" />
            <line x1="2.8" y1="2.8" x2="3.9" y2="3.9" />
            <line x1="10.1" y1="10.1" x2="11.2" y2="11.2" />
            <line x1="2.8" y1="11.2" x2="3.9" y2="10.1" />
            <line x1="10.1" y1="3.9" x2="11.2" y2="2.8" />
          </svg>
          <svg className="icon-moon" width="15" height="15" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.3" aria-hidden="true">
            <path d="M11 8.5A5 5 0 0 1 5.5 3a4.98 4.98 0 0 1 5.5 5.5z" />
          </svg>
        </button>
      </div>
    </header>
  );

  function short(label: string): string {
    // “新建 (⌘N)” 这类带快捷键的提示文案，进按钮时剥掉括号段
    return label.replace(/\s*\([^)]*\)\s*$/, "");
  }
});

function RecentMenuPopover({ items, onOpen, onClear }: {
  items: string[];
  onOpen: (p: string) => void;
  onClear: () => void;
}) {
  return (
    <div className="recent-popover" role="menu" aria-label="Open Recent">
      <RecentMenu items={items} onOpen={onOpen} onClear={onClear} />
    </div>
  );
}

/** Toolbar-side wrapper: closes menu when an item is chosen. */
function RecentMenuHost({ items, onOpen, onClear, onClose }: {
  items: string[];
  onOpen: (p: string) => void;
  onClear: () => void;
  onClose: () => void;
}) {
  const wrapOpen = (p: string) => { onClose(); onOpen(p); };
  const wrapClear = () => { onClose(); onClear(); };
  return <RecentMenuPopover items={items} onOpen={wrapOpen} onClear={wrapClear} />;
}
