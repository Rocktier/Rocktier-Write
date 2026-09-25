# Rocktier Write

**Distraction-free writing for long, focused work.** Part of the
[Rocktier](https://rocktier.com) family of tools.

> Fast is a feature. Private by design. Built to last.

Write in plain Markdown on the left; your `#` headings become chapters,
navigable from the sidebar. When the draft is ready, export a
manuscript-formatted **DOCX** (Times New Roman 12pt, double-spaced, A4,
page numbers bottom-right) or print to PDF through the system dialog.

## Features

- **Chapters from headings** — long documents stay navigable; the sidebar
  tracks your structure as you type
- **Focus mode** — Off / Paragraph / Sentence, dimming everything but what
  you are working on
- **Word goals** — per-session and per-document targets in the status bar
- **Multi-document workspace** — tabs, with unsaved changes guarded by a
  confirmation
- **Find & replace** — in-document, with next/previous navigation
- **DOCX export** — academic manuscript formatting, built in
- **Saves safely** — writes go to a temporary file and are renamed into
  place; an interrupted session leaves a recovery draft rather than a
  truncated document
- **Opens from anywhere** — `.md` files are registered, so the app appears
  in "Open with"
- **8 languages** — English, 简体中文, 日本語, 한국어, Français, Deutsch,
  Español, Português; switchable at runtime
- **Bundled everything** — models-free, fonts-free, fully offline. No
  account, no telemetry
- **By Rocktier** — member of the family (Rocktier PDF, CAD Viewer, OCR,
  Pic2Webp, Markdown)

## Architecture

```
Rocktier Write
├── Frontend: React 18 + TypeScript + Vite + CodeMirror 6
├── Shell: Tauri v2 (Rust)
├── Export: DOCX (academic manuscript template) + system print
└── Licensing: Paddle activation with a free tier fallback
```

## Getting Started

### Prerequisites

- [Node.js](https://nodejs.org/) 20+
- [Rust](https://rustup.rs/) (latest stable)
- [Tauri CLI](https://v2.tauri.app/start/prerequisites/) system deps

### Development

```bash
npm install
npm run tauri:dev
```

### Build

Builds run on GitHub Actions (`.github/workflows/build.yml`) — macOS (Apple
Silicon) and Windows (MSI), releasing on version tags. Do not build release
artifacts locally.

```bash
npm install
npm test        # vitest
npm run build   # type-check + frontend build
```

## Keyboard Shortcuts

`⌘` on macOS, `Ctrl` on Windows.

| Key     | Action           |
|---------|------------------|
| `⌘ N`   | New document     |
| `⌘ O`   | Open file        |
| `⌘ S`   | Save             |
| `⌘ ⇧ S` | Save as          |
| `⌘ F`   | Find & replace   |
| `⌘ ⇧ P` | Export PDF       |
| `⌘ \`   | Toggle sidebar   |
| `Tab`   | Indent           |
| `⇧ Tab` | Outdent          |

## Design System

Rocktier Write follows the Rocktier family design language:

- **Monochrome palette** (light default, dark available)
- **Dot grid motif** as brand identifier
- **SF Pro / Segoe UI** typography
- **Subtle transitions** (150–300 ms)
- **Editorial-grade** typography for long-form work

## License

MIT © 2026 Rocktier
