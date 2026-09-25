# Rocktier Markdown

A **fast**, elegant Markdown reader and editor. Part of the [Rocktier](https://rocktier.com) family of tools.

> Fast is a feature. Private by design. Built to last.

## Features

- **Real-time rendering** — see your Markdown come alive as you type
- **Find & replace** — in-document search with next/previous navigation
- **Export to PDF** — through the system print dialog, no bundled print engine
- **Sidebar** — files and outline, hideable when you want the page and nothing else
- **Opens from anywhere** — `.md` files are registered, so the app appears in "Open with"
- **Saves safely** — writes go to a temporary file and are renamed into place, and an
  interrupted session leaves a recovery draft rather than a truncated document
- **Bilingual** — English (default) and 简体中文, switchable at runtime
- **Lightning fast** — Tauri + micromark; typing never waits for the preview
- **Clean & elegant** — Nothing OS-inspired monochrome design, light and dark
- **By Rocktier** — member of the Rocktier family (Rocktier PDF, Rocktier CAD Viewer,
  Rocktier pic2webp, Rocktier OCR)
- **Privacy first** — 100% offline: no network access, no cloud, no tracking

## Architecture

```
Rocktier Markdown
├── Frontend: React 18 + TypeScript + Vite
├── Shell: Tauri v2 (Rust)
├── Parsing: micromark (fastest CommonMark + GFM parser)
└── Design: Nothing OS-inspired monochrome tokens
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

```bash
npm install
npm run tauri:build
```

## Keyboard Shortcuts

`⌘` on macOS, `Ctrl` on Windows.

| Key            | Action              |
|----------------|---------------------|
| `⌘ N`          | New document        |
| `⌘ O`          | Open file           |
| `⌘ S`          | Save                |
| `⌘ ⇧ S`        | Save as             |
| `⌘ F`          | Find & replace      |
| `⌘ ⇧ P`        | Export PDF          |
| `⌘ \`          | Toggle sidebar      |
| `Tab`          | Indent             |
| `Shift+Tab`    | Outdent            |

## Design System

Rocktier Markdown follows the Rocktier family design language:

- **Monochrome palette** (dark default, light available)
- **Dot grid motif** as brand identifier
- **SF Pro / Segoe UI** typography
- **Subtle transitions** (150-300ms)
- **Editorial-grade** Markdown typography

## License

MIT © 2026 Rocktier
