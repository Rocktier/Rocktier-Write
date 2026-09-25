export interface MarkdownDocument {
  path: string | null;
  content: string;
  modified: boolean;
}

export const WELCOME_DOCUMENT = `# The Art of Focus

## Why Write?

Every great work begins with a single sentence. Rocktier Write gives you the space to find it — no distractions, no formatting decisions, just your words.

## How to Use This Document

Write in **Markdown** on the left. Your headings become chapters — navigate them from the sidebar. Type \`# \` for a chapter, \`## \` for a section.

When your draft is ready, export to **DOCX** — a manuscript-formatted file with:

- Times New Roman, 12pt, double-spaced
- 1-inch margins, A4 page
- Page numbers bottom-right

## Focus Mode

Toggle focus from the toolbar:

- **Off** — see everything
- **Paragraph** — dim surrounding paragraphs
- **Sentence** — dim everything but the current sentence

## Word Goals

Set a daily word count goal from the toolbar. Your progress appears in the status bar.

---

*Rocktier Write — Fast. Private. Focused.*
`;
