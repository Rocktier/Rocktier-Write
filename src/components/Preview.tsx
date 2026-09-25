/**
 * Rocktier Write — rendered Markdown preview.
 * Reuses services/markdown.ts (micromark + KaTeX + highlight.js + DOMPurify)
 * and the .md-viewer typography from styles/markdown.css.
 * This component was always bundled (deps already in tree) but never mounted —
 * wiring it up closes the write → review loop with zero new bytes.
 * Switching back to editing is the ViewSwitch's job, so there is no toolbar here.
 */
import { memo, useMemo } from "react";
import { parseMarkdown } from "../services/markdown";

interface Props {
  content: string;
}

export const Preview = memo(function Preview({ content }: Props) {
  const html = useMemo(() => parseMarkdown(content), [content]);

  return (
    <div className="preview-pane">
      <div className="preview-scroll">
        <article className="md-viewer" dangerouslySetInnerHTML={{ __html: html }} />
      </div>
    </div>
  );
});
