import { memo, useState, useRef, useEffect } from "react";
import { t, useUiLang } from "../i18n";
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
  // v11.3 preview + recent
  onExportPdf?: () => void;
  recentItems?: string[];
  onOpenRecent?: (path: string) => void;
  onClearRecent?: () => void;
}

const FOCUS_LABELS: Record<FocusMode, () => string> = {
  off: () => t("status.focusOff"),
  paragraph: () => t("status.focusParagraph"),
  sentence: () => t("status.focusSentence"),
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
  useUiLang();
  const [goalInputOpen, setGoalInputOpen] = useState(false);
  const [goalDraft, setGoalDraft] = useState("");
  const goalInputRef = useRef<HTMLInputElement>(null);
  const [recentMenuOpen, setRecentMenuOpen] = useState(false);

  useEffect(() => {
    if (!recentMenuOpen) return;
    const close = (e: MouseEvent) => {
      const t = e.target as HTMLElement;
      if (!t.closest(".recent-btn") && !t.closest(".recent-menu")) setRecentMenuOpen(false);
    };
    const esc = (e: KeyboardEvent) => { if (e.key === "Escape") setRecentMenuOpen(false); };
    window.addEventListener("mousedown", close);
    window.addEventListener("keydown", esc);
    return () => { window.removeEventListener("mousedown", close); window.removeEventListener("keydown", esc); };
  }, [recentMenuOpen]);

  useEffect(() => {
    if (goalInputOpen && goalInputRef.current) {
      goalInputRef.current.focus();
      goalInputRef.current.select();
    }
  }, [goalInputOpen]);

  const commitGoal = () => {
    const n = parseInt(goalDraft, 10);
    if (n > 0) onSetWordGoal(n);
    setGoalInputOpen(false);
    setGoalDraft("");
  };

  const goalProgress = wordGoal > 0 ? Math.min(100, Math.round((words / wordGoal) * 100)) : 0;

  return (
    <header className="toolbar">
      <div className="toolbar-side">
        <button className="tbar-btn" onClick={onToggleSidebar} title={t("toolbar.toggleSidebar")} aria-label={t("toolbar.toggleSidebar")}>
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.3" aria-hidden="true">
            <rect x="1.5" y="1.5" width="13" height="13" rx="2" />
            <line x1="5.5" y1="1.5" x2="5.5" y2="14.5" />
          </svg>
        </button>
        <div className="brand">
          <svg className="brand-mark" viewBox="0 0 32 32" fill="none" aria-hidden="true">
            <rect className="brand-tile" x="1" y="1" width="30" height="30" rx="8.5" />
            <text
              className="brand-letters"
              x="17"
              y="17.4"
              fontSize="12"
              fontWeight="700"
              letterSpacing="-0.5"
              textAnchor="middle"
              dominantBaseline="central"
            >
              WR
            </text>
            <circle className="brand-badge" cx="8.6" cy="8.6" r="4.6" />
            <path
              d="M6.6 8.7l1.4 1.4 2.4-2.7"
              stroke="#0a0a0a"
              strokeWidth="1.2"
              strokeLinecap="round"
              strokeLinejoin="round"
              fill="none"
            />
            <circle className="brand-pip" cx="25.8" cy="6.2" r="2.2" />
          </svg>
          <span className="brand-name">Rocktier<span className="tag">Write</span></span>
        </div>
        <button className="tbar-btn" onClick={onNew} title={t("toolbar.new")} aria-label={t("toolbar.new")}>
          <svg width="15" height="15" viewBox="0 0 15 15" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" aria-hidden="true">
            <line x1="7.5" y1="2" x2="7.5" y2="13" />
            <line x1="2" y1="7.5" x2="13" y2="7.5" />
          </svg>
        </button>
        <button className="tbar-btn" onClick={onOpen} title={t("toolbar.open")} aria-label={t("toolbar.open")}>
          <svg width="15" height="15" viewBox="0 0 15 15" fill="none" stroke="currentColor" strokeWidth="1.2" aria-hidden="true">
            <path d="M2 4h4l1.5 1.5H12a1 1 0 0 1 1 1V11a1 1 0 0 1-1 1H2a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1z" />
          </svg>
        </button>
        <button className="tbar-btn labeled" onClick={onImportDocx} title={t("toolbar.importDocx")} aria-label={t("toolbar.importDocx")}>
            <svg width="15" height="15" viewBox="0 0 15 15" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <line x1="7.5" y1="12.5" x2="7.5" y2="3.5" />
              <polyline points="5,5.5 7.5,2.5 10,5.5" fill="none" />
              <line x1="2.5" y1="13" x2="12.5" y2="13" />
            </svg>
            <span className="tbar-label">{t("toolbar.importDocx")}</span>
        </button>
      </div>

      <div className="toolbar-center">
        <button
          className={`tbar-btn focus-btn ${focusMode !== "off" ? "active" : ""}`}
          onClick={onCycleFocus}
          title={t("toolbar.focusCycle")}
          aria-label={t("toolbar.focusCycle")}
        >
          <svg width="15" height="15" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.3" aria-hidden="true">
            <line x1="1" y1="2" x2="13" y2="2" />
            <line x1="3" y1="7" x2="11" y2="7" />
            <line x1="5" y1="12" x2="9" y2="12" />
          </svg>
          <span className="focus-label">{FOCUS_LABELS[focusMode]()}</span>
        </button>
        {wordGoal > 0 && (
          <div className="goal-pill" title={t("toolbar.goalProgress", { pct: goalProgress })}>
            <div className="goal-track"><div className="goal-fill" style={{ width: `${goalProgress}%` }} /></div>
            <span className="goal-text">{goalProgress}%</span>
          </div>
        )}
      </div>

      <div className="toolbar-actions">
        {wordGoal > 0 ? (
          <button
            className="tbar-btn goal-btn labeled"
            onClick={() => onSetWordGoal(0)}
            title={t("toolbar.clearGoal")}
            aria-label={t("toolbar.clearGoal")}
          >
            <span className="stat-num">{wordGoal >= 1000 ? `${(wordGoal / 1000).toFixed(1)}k` : wordGoal}</span>
              <span className="tbar-label">{t("toolbar.goalShort")}</span>
          </button>
        ) : goalInputOpen ? (
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
          <button
            className="tbar-btn labeled"
            onClick={() => { setGoalDraft("1000"); setGoalInputOpen(true); }}
            title={t("toolbar.setGoal")}
            aria-label={t("toolbar.setGoal")}
          >
            <svg width="15" height="15" viewBox="0 0 15 15" fill="none" stroke="currentColor" strokeWidth="1.3" aria-hidden="true">
              <circle cx="7.5" cy="7.5" r="5.5" />
              <line x1="7.5" y1="4" x2="7.5" y2="7.5" strokeLinecap="round" />
              <line x1="7.5" y1="7.5" x2="10" y2="9" strokeLinecap="round" />
            </svg>
              <span className="tbar-label">{t("toolbar.goalShort")}</span>
          </button>
        )}
          <button
            className={`tbar-btn ${modified ? "has-action" : ""}`}
          onClick={onSave}
          title={t("toolbar.saveAs")}
          aria-label={t("toolbar.saveAs")}
        >
          <svg width="15" height="15" viewBox="0 0 15 15" fill="none" stroke="currentColor" strokeWidth="1.2" aria-hidden="true">
            <path d="M3 1v5h8V1M3 14v-4h9v4" />
            <path d="M1 6v8h13V6" />
          </svg>
        </button>
        {onExportPdf && (
          <button className="tbar-btn export-btn" onClick={onExportPdf} title={t("menu.exportPdf")} aria-label={t("menu.exportPdf")}>
              <svg width="15" height="15" viewBox="0 0 15 15" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <line x1="7.5" y1="2.5" x2="7.5" y2="11.5" />
                <polyline points="5,9.5 7.5,12.5 10,9.5" fill="none" />
                <line x1="2.5" y1="13" x2="12.5" y2="13" />
              </svg>
            <span className="export-fmt">PDF</span>
          </button>
        )}
        {recentItems !== undefined && recentItems.length > 0 && (
          <button
            className="tbar-btn recent-btn"
            onClick={() => setRecentMenuOpen((v) => !v)}
            title={t("recent.title")}
            aria-label={t("recent.title")}
            aria-haspopup="menu"
          >
            <svg width="15" height="15" viewBox="0 0 15 15" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M12.3 9.3A5 5 0 1 1 12.6 6" fill="none" />
              <polyline points="12.6,2.2 12.6,6 9.4,6" fill="none" />
            </svg>
            <span className="recent-badge">{recentItems.length}</span>
          </button>
        )}
        <button
          className="tbar-btn"
          onClick={onFindReplace}
          title={t("toolbar.find")}
          aria-label={t("toolbar.find")}
        >
          <svg width="15" height="15" viewBox="0 0 15 15" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" aria-hidden="true">
            <circle cx="6.5" cy="6.5" r="4" />
            <line x1="9.5" y1="9.5" x2="13" y2="13" />
          </svg>
        </button>
        {hasFrontmatter && (
          <button
            className={`tbar-btn ${frontmatterOpen ? "active" : ""}`}
            onClick={onToggleInfo}
            title={t("toolbar.info")}
            aria-label={t("toolbar.info")}
          >
            <svg width="15" height="15" viewBox="0 0 15 15" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" aria-hidden="true">
              <circle cx="7.5" cy="7.5" r="5.5" />
              <circle cx="7.5" cy="5" r="0.8" fill="currentColor" stroke="none" />
              <line x1="7.5" y1="7" x2="7.5" y2="11" />
            </svg>
          </button>
        )}
        <button className="tbar-btn theme-btn" onClick={onToggleTheme} title={t("toolbar.theme")} aria-label={t("toolbar.theme")}>
          <svg className="icon-sun" width="15" height="15" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.3" aria-hidden="true">
            <circle cx="7" cy="7" r="3" />
            <line x1="7" y1="1" x2="7" y2="2.5" strokeLinecap="round" />
            <line x1="7" y1="11.5" x2="7" y2="13" strokeLinecap="round" />
            <line x1="1" y1="7" x2="2.5" y2="7" strokeLinecap="round" />
            <line x1="11.5" y1="7" x2="13" y2="7" strokeLinecap="round" />
            <line x1="2.8" y1="2.8" x2="3.9" y2="3.9" strokeLinecap="round" />
            <line x1="10.1" y1="10.1" x2="11.2" y2="11.2" strokeLinecap="round" />
            <line x1="2.8" y1="11.2" x2="3.9" y2="10.1" strokeLinecap="round" />
            <line x1="10.1" y1="3.9" x2="11.2" y2="2.8" strokeLinecap="round" />
          </svg>
          <svg className="icon-moon" width="15" height="15" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.3" aria-hidden="true">
            <path d="M11 8.5A5 5 0 0 1 5.5 3a4.98 4.98 0 0 1 5.5 5.5z" />
            <path d="M7 1a6 6 0 0 0 6 6c0 3.31-2.69 6-6 6S1 10.31 1 7a6 6 0 0 2.5-4.87" />
          </svg>
        </button>
      </div>
      {recentMenuOpen && onOpenRecent && onClearRecent && (
        <RecentMenuHost items={recentItems ?? []} onOpen={onOpenRecent} onClear={onClearRecent} onClose={() => setRecentMenuOpen(false)} />
      )}
    </header>
  );
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
