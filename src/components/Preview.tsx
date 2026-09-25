/**
 * Rocktier Write — rendered Markdown preview.
 * Reuses services/markdown.ts (micromark + KaTeX + highlight.js + DOMPurify)
 * and the .md-viewer typography from styles/markdown.css.
 * This component was always bundled (deps already in tree) but never mounted —
 * wiring it up closes the write → review loop with zero new bytes.
 */
import { memo, useMemo } from "react";
import { parseMarkdown } from "../services/markdown";
import { t } from "../i18n";

interface Props {
  content: string;
  onExit: () => void;
}

export const Preview = memo(function Preview({ content, onExit }: Props) {
  const html = useMemo(() => parseMarkdown(content), [content]);

  return (
    <div className="preview-pane">
      <div className="preview-toolbar">
        <span className="preview-title">{t("toolbar.preview")}</span>
        <button className="tbar-btn" onClick={onExit} title={t("preview.exit")} aria-label={t("preview.exit")}>
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" aria-hidden="true">
            <line x1="3" y1="2" x2="11" y2="2" />
            <line x1="5" y1="7" x2="9" y2="7" />
            <line x1="7" y1="12" x2="11" y2="12" />
          </svg>
          <span className="focus-label">{t("toolbar.editView")}</span>
        </button>
      </div>
      <div className="preview-scroll">
        <article className="md-viewer" dangerouslySetInnerHTML={{ __html: html }} />
      </div>
    </div>
  );
});
