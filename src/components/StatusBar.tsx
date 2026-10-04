import { memo } from "react";
import { t, useUiLang, getUiLang, cycleUiLang } from "../i18n";
import type { LicenseInfo } from "../services/license";

type FocusMode = "off" | "paragraph" | "sentence";

interface Props {
  words: number;
  chars: number;
  sessionMinutes: number;
  currentChapter: string;
  focusMode: FocusMode;
  onCycleFocus: () => void;
  wordGoal: number;
  /** 当前标签最近一次保存时刻（未保存过为 null） */
  savedAt: number | null;
  /** 当前标签草稿自动保存时刻 */
  draftAt: number | null;
  /** 当前标签是否有未保存修改 */
  modified: boolean;
  /** 许可状态：显示试用剩余天数，并作为进入"许可与激活"的入口。 */
  license?: LicenseInfo | null;
  onLicenseClick?: () => void;
}

export const StatusBar = memo(function StatusBar({
  words,
  chars,
  sessionMinutes,
  currentChapter,
  focusMode,
  onCycleFocus,
  wordGoal,
  savedAt,
  draftAt,
  modified,
  license,
  onLicenseClick,
}: Props) {
  useUiLang();

  const goalProgress = wordGoal > 0 ? Math.min(100, Math.round((words / wordGoal) * 100)) : 0;

  // 保存状态显式化（W-P1-09）：手动保存 > 草稿自动保存 > 未保存。
  // 未修改且从未手动保存过的空白文档不显示任何保存态。
  const fmtTime = (ts: number) => {
    const d = new Date(ts);
    return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
  };
  const saveState: "saved" | "draft" | "unsaved" | null =
    !modified && savedAt ? "saved" : modified && draftAt ? "draft" : modified ? "unsaved" : null;

  /* 只在直链版且尚未买断时提示 —— 商店版由商店收款，这里再提一句"试用/购买"既多余，
     又容易在审核眼里变成"引导外部购买"。已激活时同样不占状态栏（入口在帮助菜单）。 */
  const showLicenseChip =
    !!license && license.channel === "direct" && license.status !== "licensed";

  return (
    <footer className="status-bar">
      <span className="status-item">{t("status.words", { n: words })}</span>
      <span className="sep" />
      <span className="status-item">{t("status.chars", { n: chars })}</span>
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
      {saveState && (
        <>
          <span className="sep" />
          <span
            className={`status-item status-save${saveState === "unsaved" ? " unsaved" : ""}`}
            title={
              saveState === "saved" ? t("status.savedTitle") :
              saveState === "draft" ? t("status.draftTitle") : t("status.unsavedTitle")
            }
          >
            {saveState === "saved" ? t("status.savedAt", { time: fmtTime(savedAt as number) }) :
             saveState === "draft" ? t("status.draftSavedAt", { time: fmtTime(draftAt as number) }) :
             t("status.unsaved")}
          </span>
        </>
      )}
      <div className="status-right">
        {showLicenseChip && (
          <button
            type="button"
            className={`status-license${license.status === "expired" ? " expired" : ""}`}
            onClick={onLicenseClick}
            title={license.status === "expired" ? t("license.expired") : t("license.trialLeft", { days: license.daysLeft })}
          >
            {license.status === "expired"
              ? t("license.expiredChip")
              : t("license.trialChip", { days: license.daysLeft })}
          </button>
        )}
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
          {getUiLang() === "zh" ? "EN" : "中文"}
        </button>
      </div>
    </footer>
  );
});
