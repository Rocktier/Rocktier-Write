/**
 * Rocktier Write — Workspace Stats (v1.1.x add-on)
 * Renders at top of sidebar: total words, total goal progress,
 * per-doc goal hit count. 100% local, 0 extra deps.
 */
import { memo } from "react";
import { t } from "../i18n";

interface Props {
  docCount: number;
  totalWords: number;
  totalGoal: number;
  completedDocs: number;        // # docs that hit their goal
  goalDocs: number;             // # docs with any goal set
}

export const WorkspaceStats = memo(function WorkspaceStats({
  docCount,
  totalWords,
  totalGoal,
  completedDocs,
  goalDocs,
}: Props) {
  if (docCount === 0) return null;

  const pct = totalGoal > 0 ? Math.min(100, Math.round((totalWords / totalGoal) * 100)) : 0;

  return (
    <div className="workspace-stats" role="region" aria-label={t("dashboard.title")}>
      <div className="ws-row">
        <span className="ws-label">{t("dashboard.totalWords")}</span>
        <span className="ws-val">{totalWords.toLocaleString()}</span>
      </div>
      {totalGoal > 0 && (
        <div className="ws-goal">
          <div className="ws-progress">
            <div className="ws-bar" style={{ width: `${pct}%` }} />
          </div>
          <div className="ws-goal-row">
            <span className="ws-pct">{pct}%</span>
            <span className="ws-goal-target">
              {t("dashboard.ofGoal", { goal: totalGoal.toLocaleString() })}
            </span>
          </div>
        </div>
      )}
      {goalDocs > 0 && (
        <div className="ws-row ws-sub">
          <span>{t("dashboard.docsProgress", { completed: completedDocs, total: goalDocs })}</span>
        </div>
      )}
    </div>
  );
});
