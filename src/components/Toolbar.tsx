/**
 * Rocktier Write — top bar（2026-10-30 家族统一，06-write 设计稿）。
 *
 * 品牌位（图标 + h1 产品名 + 一句话自述 + 家族红点）靠左，随后是 doc-title
 * （文档名 + 未保存标记）。主操作只有一个：保存（实心 .primary，位置固定）；
 * 其余动作全部降级为幽灵按钮，按动词分三组：Create（新建/打开/导入）、
 * Output（保存/导出 PDF）、Tools（查找/目标/专注/打字机/信息/主题）。
 * 最近文件是打开按钮上的小箭头，不另占一个入口。
 */
import { memo, useState, useRef, useEffect } from "react";
import { t } from "../i18n";
import { RecentMenu } from "./RecentMenu";

type FocusMode = "off" | "paragraph" | "sentence";

interface Props {
  onNew: () => void;
  onOpen: () => void;
  onSave: () => void;
  onSaveAsWithFormat?: () => void;
  onImportDocx: () => void;
  modified: boolean;
  /** 当前文档名（未保存过为「未命名」）——顶栏 doc-title 显示，绝不编造。 */
  docName: string;
  themeMode: "auto" | "light" | "dark";
  onToggleTheme: () => void;
  onFindReplace: () => void;
  hasFrontmatter: boolean;
  frontmatterOpen: boolean;
  onToggleInfo: () => void;
  focusMode: FocusMode;
  onCycleFocus: () => void;
  /** Typewriter scrolling 开关（独立于 Focus Mode，经设置持久化） */
  typewriter: boolean;
  onToggleTypewriter: () => void;
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
  onNew,
  onOpen,
  onSave,
  onSaveAsWithFormat,
  onImportDocx,
  modified,
  docName,
  themeMode,
  onToggleTheme,
  onFindReplace,
  hasFrontmatter,
  frontmatterOpen,
  onToggleInfo,
  focusMode,
  onCycleFocus,
  typewriter,
  onToggleTypewriter,
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
    // data-tauri-drag-region：窗口标题栏为 Overlay+hiddenTitle，顶部条充当拖动区。
    // Tauri v2 只认带该属性的命中元素自身，子元素（按钮/输入框/菜单）点击不受影响；
    // 弹性的空白中间区 .toolbar-spacer 也带上属性，保证有可拖动的空白带。
    //
    // 2026-10-30 家族统一顶栏（06-write 设计稿）：品牌位 = 图标 + h1 产品名 +
    // 一句话自述；随后是 doc-title（文档名 + 未保存标记）；主操作只有「保存」
    // 一个（实心、位置固定在最右侧组首位），其余动作一律幽灵按钮降级。
    <header className="topbar" data-tauri-drag-region>
      <div className="brand">
        <img className="brand-mark" src="/favicon.png" alt="" />
        <h1 className="brand-name">Rocktier Write</h1>
        <span className="brand-tag">{t("topbar.tagline")}</span>
        <span className="dot-live" aria-hidden="true" />
      </div>

      <div className="doc-title">
        <b>{docName}</b>
        {modified && <span>{t("toolbar.unsaved")}</span>}
      </div>

      <div className="toolbar-spacer" data-tauri-drag-region />

      {/* ── Create：进来（幽灵按钮） ── */}
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

      <div className="vsep" />

      {/* ── Output：出去。保存是全屏唯一的主操作（实心），导出降级为幽灵。 ── */}
      <div className="tgroup" role="group" aria-label={t("toolbar.groupOutput")}>
        <div className="split">
          <button className="tbar-btn labeled split-main primary" onClick={onSave} title={t("toolbar.save")} aria-label={t("toolbar.save")}>
            <svg width="15" height="15" viewBox="0 0 15 15" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round" aria-hidden="true">
              <path d="M3 1v5h8V1M3 14v-4h9v4" />
              <path d="M1 6v8h13V6" />
            </svg>
            <span className="tbar-label">{short(t("toolbar.save"))}</span>
          </button>
          {onSaveAsWithFormat && (
            <button
              className="split-caret"
              onClick={onSaveAsWithFormat}
              title={t("toolbar.saveAs")}
              aria-label={t("toolbar.saveAs")}
              aria-haspopup="true"
            >
              <svg width="8" height="8" viewBox="0 0 8 8" fill="none" stroke="currentColor" strokeWidth="1.2" aria-hidden="true">
                <polyline points="1.5,3 4,5.5 6.5,3" />
              </svg>
            </button>
          )}
        </div>
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

      {/* ── Tools（幽灵按钮） ── */}
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

        {/* Typewriter：光标锁 40%。与 Focus 平级的独立开关（设计稿顶栏的「打字机」） */}
        <button
          className={`tbar-btn labeled ${typewriter ? "active" : ""}`}
          onClick={onToggleTypewriter}
          title={t("toolbar.typewriterCycle")}
          aria-label={t("toolbar.typewriterCycle")}
          aria-pressed={typewriter}
        >
          <span className="tbar-label">{t("toolbar.typewriter")}</span>
          <span className={`state ${typewriter ? "on" : ""}`}>{t(typewriter ? "toolbar.typewriterOn" : "toolbar.typewriterOff")}</span>
        </button>

        {hasFrontmatter && (
          <button className={`tbar-btn ${frontmatterOpen ? "active" : ""}`} onClick={onToggleInfo} title={t("toolbar.info")} aria-label={t("toolbar.info")}>
            <svg width="15" height="15" viewBox="0 0 15 15" fill="none" stroke="currentColor" strokeWidth="1.3" aria-hidden="true">
              <circle cx="7.5" cy="7.5" r="5.5" />
              <circle cx="7.5" cy="5" r="0.8" fill="currentColor" stroke="none" />
              <line x1="7.5" y1="7" x2="7.5" y2="11" />
            </svg>
          </button>
        )}

        {/* 家族唯一主题按钮：.icon-btn（28×28 + 40px 命中区）。
            三态 auto → light → dark，data-mode 驱动角标，title/aria-label 说明当前档。 */}
        <button
          className="icon-btn"
          data-mode={themeMode}
          onClick={onToggleTheme}
          title={`${t("toolbar.theme")} \u00b7 ${t(`theme.mode.${themeMode}`)}`}
          aria-label={`${t("toolbar.theme")}: ${t(`theme.mode.${themeMode}`)}`}
        >
          {themeMode === "auto" ? (
            <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <rect x="2.5" y="4" width="19" height="13" rx="2" />
              <path d="M8 20.5h8M12 17v3.5" />
            </svg>
          ) : themeMode === "dark" ? (
            <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <circle cx="12" cy="12" r="4" />
              <path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
            </svg>
          ) : (
            <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M21 12.8A9 9 0 1 1 11.2 3 7 7 0 0 0 21 12.8z" />
            </svg>
          )}
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
