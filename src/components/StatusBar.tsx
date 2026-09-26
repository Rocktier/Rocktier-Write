import { memo } from "react";
import { t, useUiLang, getUiLang, cycleUiLang } from "../i18n";

type FocusMode = "off" | "paragraph" | "sentence";

interface Props {
  words: number;
  chars: number;
  minutes: number;
  sessionMinutes: number;
  currentChapter: string;
  focusMode: FocusMode;
  onCycleFocus: () => void;
  wordGoal: number;
}

export const StatusBar = memo(function StatusBar({
  words,
  chars,
  minutes,
  sessionMinutes,
  currentChapter,
  focusMode,
  onCycleFocus,
  wordGoal,
}: Props) {
  useUiLang();

  const goalProgress = wordGoal > 0 ? Math.min(100, Math.round((words / wordGoal) * 100)) : 0;

  return (
    <footer className="status-bar">
      <span className="status-item">{t("status.words", { n: words })}</span>
      <span className="sep" />
      <span className="status-item">{t("status.chars", { n: chars })}</span>
      <span className="sep" />
      <span className="status-item">{t("status.minutes", { m: minutes })}</span>
      <span className="sep" />
      <span className="status-item">{t("status.session", { m: sessionMinutes })}</span>
      {currentChapter && (
        <>
          <span className="sep" />
          <span className="status-item status-chapter" title={currentChapter}>{currentChapter}</span>
        </>
      )}
      {wordGoal > 0 && (
        <>
          <span className="sep" />
          <span className="status-item status-goal">{t("status.goal", { pct: goalProgress })}</span>
        </>
      )}
      <div className="status-right">
        <button
          type="button"
          className={`status-focus-btn ${focusMode !== "off" ? "active" : ""}`}
          onClick={onCycleFocus}
          title={t("status.focusToggle")}
        >
          {focusMode === "off" ? t("status.focusOff") : focusMode === "paragraph" ? t("status.focusParagraph") : t("status.focusSentence")}
        </button>
        <button
          type="button"
          className="status-lang"
          onClick={() => void cycleUiLang()}
          title={t("statusBar.lang")}
        >
          <svg width="11" height="11" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.2" aria-hidden="true">
            <circle cx="7" cy="7" r="5.5" />
            <ellipse cx="7" cy="7" rx="2.6" ry="5.5" />
            <line x1="1.5" y1="7" x2="12.5" y2="7" />
          </svg>
          {getUiLang().toUpperCase()}
        </button>
      </div>
    </footer>
  );
});
