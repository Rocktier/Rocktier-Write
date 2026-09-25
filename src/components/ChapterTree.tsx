import { memo } from "react";
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
}

export const ChapterTree = memo(function ChapterTree({ headings, currentLine, visible, onJumpTo }: Props) {
  useUiLang();

  return (
    <nav className={`chapter-tree ${visible ? "open" : ""}`} aria-label={t("chapters.title")}>
      <div className="chapter-header">{t("chapters.title")}</div>
      <div className="chapter-list">
        {headings.length === 0 ? (
          <div className="chapter-empty">{t("chapters.empty")}</div>
        ) : (
          headings.map((h, i) => (
            <button
              key={`${h.line}-${i}`}
              className={`chapter-item level-${Math.min(h.level, 3)} ${h.line <= currentLine ? "passed" : ""} ${
                headings.findIndex((x) => x.line > currentLine) === i ? "current" : ""
              }`}
              onClick={() => onJumpTo(h.line)}
              title={h.text}
            >
              {h.text}
            </button>
          ))
        )}
      </div>
    </nav>
  );
});
