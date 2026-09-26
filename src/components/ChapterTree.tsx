/**
 * Rocktier Write — ChapterTree with word counts + per-chapter goals.
 * v1.1.x: extends the original heading list with:
 *   - word count per chapter (computed from active content chapter boundaries)
 *   - inline goal setting per chapter (persisted by parent via goals map)
 *   - progress "12/50" / bar shown when goal set
 */
import { memo, useMemo, useState } from "react";
import { t, useUiLang } from "../i18n";

interface Heading {
  level: number;
  text: string;
  line: number;
}

interface Props {
  headings: Heading[];
  currentLine: number;
  visible: boolean;
  onJumpTo: (line: number) => void;
  content: string;                                 // active doc content, for chapter word counts
  chapterGoals?: Record<number, number>;           // line → goal words
  onSetChapterGoal?: (line: number, goal: number) => void;
}

/**
 * Count words between startLine and endLine (1-indexed, endLine exclusive).
 * `lines` must be the already-split document — splitting per chapter is what
 * made the old implementation O(headings × document) on every keystroke.
 */
function wordsInLines(lines: string[], startLine: number, endLine: number): number {
  const slice = lines.slice(startLine - 1, endLine - 1).join("\n").trim();
  if (!slice) return 0;
  const cn = (slice.match(/[\u3400-\u9fff\uf900-\ufaff]/g) || []).length;
  const en = (slice.match(/[a-zA-Z0-9_]+/g) || []).length;
  return cn + en;
}

const ChapterGoalInput = memo(function ChapterGoalInput({
  initialValue,
  onCommit,
  onCancel,
}: {
  initialValue: number;
  onCommit: (n: number) => void;
  onCancel: () => void;
}) {
  const [v, setV] = useState(String(initialValue || "500"));
  return (
    <input
      type="number"
      min="1"
      autoFocus
      value={v}
      onChange={(e) => setV(e.target.value)}
      onKeyDown={(e) => {
        if (e.key === "Enter") {
          const n = parseInt(v, 10);
          if (n > 0) onCommit(n);
        } else if (e.key === "Escape") onCancel();
      }}
      onBlur={() => {
        const n = parseInt(v, 10);
        if (n > 0) onCommit(n);
        else onCancel();
      }}
      className="chapter-goal-input"
      aria-label={t("chapters.goalPlaceholder")}
    />
  );
});

export const ChapterTree = memo(function ChapterTree({
  headings,
  currentLine,
  visible,
  onJumpTo,
  content,
  chapterGoals = {},
  onSetChapterGoal,
}: Props) {
  const [editingLine, setEditingLine] = useState<number | null>(null);
  useUiLang();

  // Per-chapter word counts: split the document once, count in one pass.
  const counts = useMemo(() => {
    const lines = content.split("\n");
    const c: Record<number, number> = {};
    for (let i = 0; i < headings.length; i++) {
      const start = headings[i].line;                                             // 1-indexed
      const end = i + 1 < headings.length ? headings[i + 1].line : lines.length + 1;
      c[start] = wordsInLines(lines, start, end);
    }
    return c;
  }, [content, headings]);

  // Index of the chapter containing currentLine — one pass instead of the
  // old per-row findIndex (O(n²) over headings).
  const currentIndex = useMemo(() => {
    let idx = -1;
    for (let i = 0; i < headings.length; i++) {
      if (headings[i].line <= currentLine) idx = i; else break;
    }
    return idx;
  }, [headings, currentLine]);

  return (
    <nav className={`chapter-tree ${visible ? "open" : ""}`} aria-label={t("chapters.title")}>
      <div className="chapter-header">{t("chapters.title")}</div>
      <div className="chapter-list">
        {headings.length === 0 ? (
          <div className="chapter-empty">{t("chapters.empty")}</div>
        ) : (
          headings.map((h, i) => {
            const goal = chapterGoals[h.line] ?? 0;
            const words = counts[h.line] ?? 0;
            const isEditing = editingLine === h.line;
            const isCurrent = i === currentIndex;
            const overflow = goal > 0 && words > goal;
            return (
              <div key={`${h.line}-${i}`} className={`chapter-row ${isCurrent ? "current" : ""}`}>
                <button
                  className={`chapter-item level-${Math.min(h.level, 3)} ${h.line <= currentLine ? "passed" : ""}`}
                  onClick={() => onJumpTo(h.line)}
                  title={h.text}
                >
                  {h.text}
                </button>
                <div className="chapter-meta">
                  <span className={`chapter-words ${overflow ? "overflow" : ""}`}>
                    {words}
                  </span>
                  {goal > 0 && (
                    <span className="chapter-goal-badge" title={t("chapters.goalBadge", { goal: String(goal) })}>
                      {Math.min(100, Math.round((words / goal) * 100))}%
                    </span>
                  )}
                  {isEditing ? (
                    <ChapterGoalInput
                      initialValue={goal}
                      onCommit={(n) => {
                        onSetChapterGoal?.(h.line, n);
                        setEditingLine(null);
                      }}
                      onCancel={() => setEditingLine(null)}
                    />
                  ) : (
                    <button
                      className="chapter-set-goal"
                      title={t("chapters.setGoal")} aria-label={t("chapters.setGoal")}
                      onClick={() => setEditingLine(h.line)}
                    >
                      {goal > 0 ? "★" : "+"}
                    </button>
                  )}
                </div>
              </div>
            );
          })
        )}
      </div>
    </nav>
  );
});
