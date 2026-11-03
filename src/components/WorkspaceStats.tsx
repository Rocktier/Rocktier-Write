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

  /* 2026-10-30 家族统一（06-write 设计稿的 tree-foot）：大数字 + 一句人话，
     固定在侧栏底部。数字全部来自真实统计，没有目标时只报总字数。 */
  return (
    <div className="workspace-stats" role="region" aria-label={t("dashboard.title")}>
      <span className="ws-big">{totalWords.toLocaleString()}</span>
      <span className="ws-cap">
        {totalGoal > 0
          ? t("dashboard.summary", { total: totalWords.toLocaleString(), goal: totalGoal.toLocaleString(), pct })
          : t("dashboard.totalWords")}
      </span>
      {goalDocs > 0 && (
        <span className="ws-cap">{t("dashboard.docsProgress", { completed: completedDocs, total: goalDocs })}</span>
      )}
    </div>
  );
});
