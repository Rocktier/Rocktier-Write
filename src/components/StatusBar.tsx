import { memo } from "react";
import { t, useUiLang, cycleUiLang } from "../i18n";
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
    // 2026-10-30 家族统一（06-write 设计稿）：状态栏说人话 —— 未保存时红点 +
    // 文字一起出现（红点永不单独编码状态），数字走等宽字体，右侧是许可/专注/语言。
    <footer className="status-bar" role="status" aria-live="polite">
      <span className="status-item mono">{t("status.words", { n: words })}</span>
      <span className="sep" />
      <span className="status-item mono">{t("status.chars", { n: chars })}</span>
      <span className="sep" />
      <span className="status-item mono">{t("status.session", { m: sessionMinutes })}</span>
      {currentChapter && (
        <>
          <span className="sep" />
          <span className="status-item status-chapter" title={currentChapter}>{currentChapter}</span>
        </>
      )}
      {wordGoal > 0 && (
        <>
          <span className="sep" />
          <span className="status-item status-goal mono">{t("status.goal", { pct: goalProgress })}</span>
        </>
      )}
      {saveState && (
        <>
          <span className="sep" />
          {/* 红点只配「未保存」：已保存/草稿已存都是结束态，说结果不带点。 */}
          {saveState === "unsaved" && (
            <span className="dot-live" role="img" aria-label={t("status.unsavedTitle")} />
          )}
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
          /* 徽标颜色统一由 .badge-license（母版 tokens.css）负责，试用/过期同色，
              不再用 expired 修饰类切警示色。 */
          <button
            type="button"
            className="badge-license"
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
          {/* 2026-11-15 用户令：语言控件统一为 A+地球图标（纯图标，去文字） */}
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M3.5 16.5 8.8 4.5l5.3 12" />
            <path d="M5.5 11.5h6.6" />
            <circle cx="16.8" cy="16.8" r="5.2" />
            <ellipse cx="16.8" cy="16.8" rx="2.3" ry="5.2" />
            <path d="M11.9 16.8h9.8" />
          </svg>
        </button>
      </div>
    </footer>
  );
});
