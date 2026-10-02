/**
 * Rocktier Write — rendered Markdown preview.
 * Reuses services/markdown.ts (micromark + KaTeX + highlight.js + DOMPurify)
 * and the .md-viewer typography from styles/markdown.css.
 * This component was always bundled (deps already in tree) but never mounted —
 * wiring it up closes the write → review loop with zero new bytes.
 * Switching back to editing is the ViewSwitch's job, so there is no toolbar here.
 */
import { memo, useEffect, useMemo, useRef } from "react";
import { convertFileSrc } from "@tauri-apps/api/core";
import { parseMarkdown } from "../services/markdown";
import { resolvePath, baseDirOf } from "../services/path";

interface Props {
  content: string;
  filePath?: string | null;
}

// Relative image sources ("![x](./assets/a.png)") point at the document's own
// directory. Inside the webview they must become serveable asset:// URLs —
// convertFileSrc is the only sanctioned way (direct file:// is blocked).
function rewriteImageSources(root: HTMLElement, filePath?: string | null) {
  if (!filePath) return;
  const base = baseDirOf(filePath);
  if (!base) return;
  const imgs = root.querySelectorAll<HTMLImageElement>(".md-viewer img[src]");
  imgs.forEach((img) => {
    const src = img.getAttribute("src") || "";
    if (!src) return;
    if (/^(https?:|data:|blob:|asset:|file:|mailto:)/i.test(src)) return;
    const match = /^([^?#]*)([?#].*)?$/.exec(src);
    if (!match) return;
    let decoded = match[1];
    try { decoded = decodeURIComponent(decoded); } catch { /* keep as is */ }
    img.setAttribute("src", convertFileSrc(resolvePath(base, decoded)) + (match[2] ?? ""));
  });
}

export const Preview = memo(function Preview({ content, filePath }: Props) {
  const html = useMemo(() => parseMarkdown(content), [content]);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const root = ref.current;
    if (!root) return;
    rewriteImageSources(root, filePath);
  }, [html, filePath]);

  return (
    <div className="preview-pane">
      <div className="preview-scroll">
        <article ref={ref} className="md-viewer" dangerouslySetInnerHTML={{ __html: html }} />
      </div>
    </div>
  );
});
