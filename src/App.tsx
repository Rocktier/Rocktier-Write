/**
 * Rocktier Write v1.1 — Multi-document workspace.
 * Refactored from single-doc: maintains docs[] + activeId.
 * Integrates: TabBar, CodeMirror (window.__cmView), FindReplace, Theme, i18n, updater.
 */
import { useState, useCallback, useEffect, useMemo, useRef } from "react";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { invoke } from "@tauri-apps/api/core";
import { ViewSwitch } from "./components/ViewSwitch";
import { Toolbar } from "./components/Toolbar";
import { Editor } from "./components/Editor";
import { ChapterTree } from "./components/ChapterTree";
import { WorkspaceStats } from "./components/WorkspaceStats";
import { FindReplace } from "./components/FindReplace";
import { StatusBar } from "./components/StatusBar";
import { TabBar, type TabDoc } from "./components/TabBar";
import { Preview } from "./components/Preview";
import { FrontmatterPanel } from "./components/FrontmatterPanel";
import { useTheme, toggleTheme } from "./hooks/useTheme";
import { useKeyboardShortcuts } from "./hooks/useKeyboardShortcuts";
import {
  openFile, saveFile, saveFileAs, confirmDialog, normalizeEol, applyEol, type Eol,
} from "./services/file";
import { exists, readTextFile, stat } from "@tauri-apps/plugin-fs";
import { WELCOME_DOCUMENT, type MarkdownDocument } from "./types/index";
import { t, useUiLang } from "./i18n";
import { extractFrontmatter } from "./services/markdown";

const LAST_PATH_KEY = "rocktier-write-last-path";
const RECENT_KEY = "rocktier-write-recent";
const VIEW_MODE_KEY = "rocktier-write-view-mode";
const RECENT_MAX = 5;
const UNTITLED_KEY = "__untitled__";

const isTauri = typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
const MARKDOWN_EXTS = ["md", "markdown", "mdown", "mkd", "txt", "text"];
const DOCX_EXTS = ["docx"];

function baseName(path: string): string {
  return path.split(/[/\\]/).pop() || "Untitled";
}

function docId(path: string | null): string {
  return path ?? UNTITLED_KEY;
}

export default function App() {
  useTheme();
  const lang = useUiLang();

  // ── Multi-doc state ──────────────────────────────────────────────
  const [docs, setDocs] = useState<MarkdownDocument[]>([
    { path: null, content: WELCOME_DOCUMENT, modified: false },
  ]);
  const [activeId, setActiveId] = useState<string>(UNTITLED_KEY);

  const [sidebar, setSidebar] = useState(true);
  const [toast, setToast] = useState("");
  const [findReplaceOpen, setFindReplaceOpen] = useState(false);
  const [cursorLine, setCursorLine] = useState(1);
  const [focusMode, setFocusMode] = useState<"off" | "paragraph" | "sentence">("off");
  const [wordGoal, setWordGoal] = useState(0);
  const [sessionStart] = useState(() => Date.now());
  const [cmReady, setCmReady] = useState(false);
  // v1.1.3: view/edit toggle, frontmatter panel, recent menu
  const [viewMode, setViewMode] = useState<"edit" | "preview">(() => {
    const saved = localStorage.getItem(VIEW_MODE_KEY);
    return saved === "preview" ? "preview" : "edit";
  });
  // Persist view mode preference across sessions
  useEffect(() => { localStorage.setItem(VIEW_MODE_KEY, viewMode); }, [viewMode]);
  const [fmOpen, setFmOpen] = useState(false);
  const [recentItems, setRecentItems] = useState<string[]>([]);
  const refreshRecent = useCallback(() => {
    try { setRecentItems(JSON.parse(localStorage.getItem(RECENT_KEY) || "[]")); } catch { /* */ }
  }, []);
  useEffect(() => { refreshRecent(); }, [refreshRecent]);

  const toastRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const checkingRef = useRef(false);
  const autoSaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastSavedRef = useRef<Map<string, string>>(new Map());
  const lastPathRef = useRef<string | null>(null);
  const [chapterGoals, setChapterGoals] = useState<Map<string, Record<number, number>>>(new Map());
  const eolRef = useRef<Map<string, Eol>>(new Map());

  // Derive active doc for convenience
  const activeDoc = useMemo(
    () => docs.find((d) => docId(d.path) === activeId) ?? docs[0],
    [docs, activeId],
  );

  const setActiveDoc = useCallback((updater: (d: MarkdownDocument) => MarkdownDocument) => {
    setDocs((prev) => {
      const id = activeId;
      return prev.map((d) => (docId(d.path) === id ? updater(d) : d));
    });
  }, [activeId]);

  // Count words in a string (CJK + alphanumeric) — shared helper
  const countWords = useCallback((text: string): number => {
    const t = text.trim();
    if (!t) return 0;
    const cn = (t.match(/[\u3400-\u9fff\uf900-\ufaff]/g) || []).length;
    const en = (t.match(/[a-zA-Z0-9_]+/g) || []).length;
    return cn + en;
  }, []);

  const stats = useMemo(() => {
    const text = activeDoc.content.trim();
    if (!text) return { words: 0, minutes: 0, chars: 0 };
    const words = countWords(text);
    const cn = (text.match(/[\u3400-\u9fff\uf900-\ufaff]/g) || []).length;
    const ratio = words > 0 ? cn / words : 0;
    const wpm = 350 + ratio * 150;
    const minutes = words === 0 ? 0 : Math.max(1, Math.ceil(words / wpm));
    return { words, minutes, chars: text.length };
  }, [activeDoc.content, countWords]);

  // Workspace-wide aggregations (v1.1.x)
  const { totalWords, completedDocs } = useMemo(() => {
    let tw = 0;
    let cd = 0;
    for (const d of docs) {
      const w = countWords(d.content);
      tw += w;
      if (wordGoal > 0 && w >= wordGoal) cd++;
    }
    return { totalWords: tw, completedDocs: cd };
  }, [docs, countWords, wordGoal]);

  const extractHeadings = useCallback((content: string) => {
    const lines = content.split("\n");
    const headings: Array<{ level: number; text: string; line: number }> = [];
    let inCode = false;
    for (let i = 0; i < lines.length; i++) {
      if (/^\s*(```|~~~)/.test(lines[i])) { inCode = !inCode; continue; }
      if (inCode) continue;
      const m = lines[i].match(/^(#{1,3})\s+(.+)$/);
      if (m) headings.push({ level: m[1].length, text: m[2].replace(/\s+#+$/, "").trim(), line: i + 1 });
    }
    return headings;
  }, []);

  const headings = useMemo(() => extractHeadings(activeDoc.content), [activeDoc.content, extractHeadings]);

  const currentChapter = useMemo(() => {
    if (!headings.length) return "";
    let ch = headings[0].text;
    for (const h of headings) { if (h.line <= cursorLine) ch = h.text; else break; }
    return ch;
  }, [headings, cursorLine]);

  const showToast = useCallback((msg: string) => {
    setToast(msg);
    if (toastRef.current) clearTimeout(toastRef.current);
    toastRef.current = setTimeout(() => setToast(""), 2500);
  }, []);

  const rememberPath = useCallback((path: string | null) => {
    try {
      if (path) {
        localStorage.setItem(LAST_PATH_KEY, path);
        const list: string[] = JSON.parse(localStorage.getItem(RECENT_KEY) || "[]");
        const next = [path, ...list.filter((p) => p !== path)].slice(0, RECENT_MAX);
        localStorage.setItem(RECENT_KEY, JSON.stringify(next));
      } else localStorage.removeItem(LAST_PATH_KEY);
    } catch { /* non-fatal */ }
  }, []);

  // ── Close-guard with Rust ────────────────────────────────────────
  useEffect(() => {
    if (!isTauri) return;
    let disposed = false;
    let unlisten: (() => void) | undefined;
    (async () => {
      const fn = await getCurrentWindow().listen<null>("app-close-requested", async () => {
        invoke("close_ack").catch(() => {});
        const hasUnsaved = docs.some((d) => d.modified);
        if (hasUnsaved) {
          if (!(await confirmDialog(t("confirm.discard")))) return;
        }
        try { await invoke("force_close"); } catch { /* window gone */ }
      });
      if (disposed) { fn(); return; }
      unlisten = fn;
      await invoke("mark_ready").catch(() => {});
    })();
    return () => { disposed = true; unlisten?.(); };
  }, [docs]);

  // ── Recovery on launch ───────────────────────────────────────────
  useEffect(() => {
    if (!isTauri) return;
    let cancelled = false;
    (async () => {
      let launchedWith = "";
      try { launchedWith = (await invoke<string | null>("initial_file")) || ""; } catch { /* none */ }

      let restored: MarkdownDocument | null = null;
      for (const raw of launchedWith ? [launchedWith] : []) {
        if (!raw) continue;
        try {
          if (await exists(raw)) {
            const { content, eol } = normalizeEol(await readTextFile(raw));
            if (!cancelled) { eolRef.current.set(docId(raw), eol); restored = { path: raw, content, modified: false }; }
            break;
          }
        } catch { /* try next */ }
      }

      try {
        const entries = await invoke<Array<{ path: string; content: string; modified_ms: number }>>("list_recovery");
        const namedDrafts = entries.filter((e) => e.path !== UNTITLED_KEY);
        const draft = restored
          ? entries.find((e) => e.path === restored!.path)
          : entries.find((e) => e.path === UNTITLED_KEY) ?? namedDrafts[0];
        if (draft && !cancelled) {
          const untitled = draft.path === UNTITLED_KEY;
          if (!untitled && restored && restored.path === draft.path && restored.content === draft.content) {
            await invoke("clear_recovery", { path: draft.path }).catch(() => {});
          } else {
            let message = t(untitled ? "confirm.recoverUntitled" : "confirm.recover");
            if (!untitled && !restored) {
              const name = draft.path.replace(/^.*[\\/]/, "");
              let stale = false;
              try { const info = await stat(draft.path); stale = (info.mtime ? info.mtime.getTime() : 0) > draft.modified_ms; } catch { /* not found */ }
              message = t(stale ? "confirm.recoverNamedOlder" : "confirm.recoverNamedNewer", { name });
            }
            if (await confirmDialog(message)) {
              if (!cancelled) restored = { path: untitled ? null : draft.path, content: draft.content, modified: true };
            } else {
              await invoke("clear_recovery", { path: draft.path }).catch(() => {});
            }
          }
        }
      } catch { /* best-effort */ }

      if (!cancelled && restored) {
        setDocs([restored]);
        setActiveId(docId(restored.path));
        lastPathRef.current = restored.path;
        if (restored.path) rememberPath(restored.path);
      }
    })();
    return () => { cancelled = true; };
  }, [rememberPath]);

  // ── Importer / Open a document ───────────────────────────────────
  const doOpen = useCallback(async () => {
    const hasUnsaved = docs.some((d) => d.modified);
    if (hasUnsaved) { if (!(await confirmDialog(t("confirm.discard")))) return; }

    const r = await openFile();
    if (r) {
      if (r.path.toLowerCase().endsWith(".docx")) {
        try {
          const md = await invoke<string>("import_docx", { path: r.path });
          const newDoc: MarkdownDocument = { path: null, content: md, modified: true };
          setDocs([newDoc]);
          setActiveId(docId(newDoc.path));
          showToast(t("toast.docxImported"));
        } catch { showToast(t("toast.cannotOpenFile")); }
        return;
      }
      const newDoc: MarkdownDocument = { path: r.path, content: r.content, modified: false };
      eolRef.current.set(docId(r.path), r.eol);
      lastSavedRef.current.set(docId(r.path), r.content);
      lastPathRef.current = r.path;
      setDocs([newDoc]);
      setActiveId(docId(r.path));
      rememberPath(r.path);
      showToast(t("toast.fileOpened"));
    }
  }, [docs, showToast, rememberPath]);

  const openContent = useCallback((content: string, path: string | null, eol: Eol, modified?: boolean) => {
    const id = docId(path);
    eolRef.current.set(id, eol);
    lastSavedRef.current.set(id, content);
    lastPathRef.current = path;
    const newDoc: MarkdownDocument = { path, content, modified: modified ?? false };
    setDocs((prev) => {
      const exists = prev.some((d) => docId(d.path) === id);
      if (exists) return prev.map((d) => docId(d.path) === id ? newDoc : d);
      return [...prev, newDoc];
    });
    setActiveId(id);
    if (path) rememberPath(path);
  }, [rememberPath]);

  // ── Save ─────────────────────────────────────────────────────────
  const doSave = useCallback(async () => {
    const { path, content } = activeDoc;
    const id = docId(path);
    const eol = eolRef.current.get(id) ?? "\n";
    const payload = applyEol(content, eol);
    try {
      let finalPath = path;
      if (!path) {
        const p = await saveFileAs(payload);
        if (!p) return;
        finalPath = p;
        setActiveDoc((d) => ({ ...d, path: p, modified: false }));
        rememberPath(p);
      } else {
        await saveFile(path, payload);
        setActiveDoc((d) => (d.content === content ? { ...d, modified: false } : d));
      }
      lastSavedRef.current.set(docId(finalPath), content);
      invoke("clear_recovery", { path: docId(finalPath) }).catch(() => {});
      showToast(t("toast.saved"));
    } catch { showToast(t("toast.saveFailed")); }
  }, [activeDoc, showToast, rememberPath]);

  const doSaveAs = useCallback(async () => {
    const { content, path } = activeDoc;
    const id = docId(path);
    const eol = eolRef.current.get(id) ?? "\n";
    try {
      const p = await saveFileAs(applyEol(content, eol), path ? baseName(path) : undefined);
      if (p) {
        setActiveDoc((d) => ({ ...d, path: p, modified: false }));
        lastSavedRef.current.set(docId(p), content);
        rememberPath(p);
        showToast(t("toast.savedAs"));
      }
    } catch { showToast(t("toast.saveFailed")); }
  }, [activeDoc, showToast, rememberPath]);

  // ── Export ───────────────────────────────────────────────────────
  const doExportDocx = useCallback(async () => {
    try {
      const { content, path } = activeDoc;
      let targetPath = path ? path.replace(/\.[^.]+$/, ".docx") : null;
      if (!targetPath) {
        const { save: dialogSave } = await import("@tauri-apps/plugin-dialog");
        const p = await dialogSave({ filters: [{ name: "DOCX Document", extensions: ["docx"] }], defaultPath: path ? baseName(path).replace(/\.[^.]+$/, "") : "untitled" });
        if (!p) return;
        targetPath = p;
      }
      await invoke("export_docx", { markdown: content, outputPath: targetPath });
      showToast(t("toast.docxExported"));
    } catch { showToast(t("toast.saveFailed")); }
  }, [activeDoc, showToast]);

  // Export PDF: switch to preview (browser print) and invoke native print.
  // The "Save as PDF" target is chosen by the user inside the print dialog.
  const doExportPdf = useCallback(async () => {
    if (viewMode !== "preview") setViewMode("preview");
    // give React a tick to paint preview, then open print dialog
    requestAnimationFrame(() => {
      invoke("print_doc").catch(() => {});
    });
  }, [viewMode]);

  // ── Paste image ─────────────────────────────────────────────────
  // Editor reports paste event up; App owns the doc path + Rust invoke.
  // Writes <ts>.<ext> into <docname>-assets/ next to the .md, then inserts
  // ![<name>](<relPath>) at the current cursor via shared __cmView.
  const onPasteImage = useCallback(
    async (mime: string, b64: string) => {
      const path = activeDoc.path;
      if (!path) {
        showToast(t("toast.saveFirstForImage"));
        return;
      }
      const ext = mime.includes("png")
        ? "png"
        : mime.includes("gif")
          ? "gif"
          : mime.includes("webp")
            ? "webp"
            : "jpg";
      const base = path.replace(/\.[^.]+$/, "");
      const parentPath = base + "-assets";
      const name = `img-${Date.now()}.${ext}`;
      const absPath = `${parentPath}/${name}`;
      try {
        await invoke("save_paste_image", { path: absPath, data: b64 });
        const stem = base.split(/[\\]/).pop() ?? "assets";
        const relPath = `${stem}-assets/${name}`;
        const md = `![${name}](${relPath})`;
        const cm = (window as unknown as {
          __cmView?: {
            state: { selection: { main: { head: number } } };
            dispatch: (t: unknown) => void;
          };
        }).__cmView;
        if (cm) cm.dispatch({ changes: { from: cm.state.selection.main.head, insert: md } });
        showToast(t("toast.pastedImage"));
      } catch { showToast(t("toast.imageFailed")); }
    },
    [activeDoc.path, showToast],
  );

  // New doc
  const doNew = useCallback(() => {
    const newDoc: MarkdownDocument = { path: null, content: "", modified: false };
    setDocs((prev) => [...prev, newDoc]);
    setActiveId(docId(newDoc.path));
    showToast(t("toast.newDoc"));
  }, [showToast]);

  // ── Close a doc ──────────────────────────────────────────────────
  const closeDoc = useCallback(async (id: string) => {
    const doc = docs.find((d) => docId(d.path) === id);
    if (!doc) return;
    if (doc.modified) {
      if (!(await confirmDialog(t("confirm.discard")))) return;
    }
    setDocs((prev) => {
      const remaining = prev.filter((d) => docId(d.path) !== id);
      if (remaining.length === 0) {
        const untitled: MarkdownDocument = { path: null, content: "", modified: false };
        setActiveId(docId(untitled.path));
        return [untitled];
      }
      return remaining;
    });
    // If closing active doc, switch to first remaining
    if (activeId === id) {
      setDocs((prev) => { setActiveId(docId(prev.find((d) => docId(d.path) !== id)?.path ?? null)); return prev; });
    }
  }, [docs, activeId]);

  const switchDoc = useCallback((id: string) => { setActiveId(id); }, []);

  // ── Menu ─────────────────────────────────────────────────────────
  useEffect(() => {
    if (!isTauri) return;
    invoke("build_menu", { lang }).catch(() => {});
  }, [lang]);

  useEffect(() => {
    if (!isTauri) return;
    let disposed = false;
    let unlisten: (() => void) | undefined;
    getCurrentWindow()
      .listen<string>("menu-action", (e) => {
        switch (e.payload) {
          case "new": doNew(); break;
          case "open": doOpen(); break;
          case "save": doSave(); break;
          case "save-as": doSaveAs(); break;
          case "export-docx": doExportDocx(); break;
          case "export-pdf": doExportPdf(); break;
          case "find": setFindReplaceOpen((v) => !v); break;
          case "toggle-sidebar": setSidebar((v) => !v); break;
          case "toggle-theme": toggleTheme(); break;
          case "toggle-preview": setViewMode((m) => (m === "edit" ? "preview" : "edit")); break;
          case "toggle-frontmatter": setFmOpen((v) => !v); break;
        }
      })
      .then((fn) => { if (disposed) fn(); else unlisten = fn; });
    return () => { disposed = true; unlisten?.(); };
  }, [doNew, doOpen, doSave, doSaveAs, doExportDocx]);

  const shortcuts = useMemo(() => ({
    onSave: doSave, onSaveAs: doSaveAs, onNew: doNew, onOpen: doOpen,
    onToggleSidebar: () => setSidebar((v) => !v),
    onFindReplace: () => setFindReplaceOpen((v) => !v),
    onExportPdf: doExportPdf,
  }), [doSave, doSaveAs, doNew, doOpen, doExportPdf]);
  useKeyboardShortcuts(shortcuts);

  // ── Open file externally (drop / drag / argv) ────────────────────
    // Save As, with the format chosen in the same dialog. Markdown and Word are
    // both written to the chosen path. PDF is deliberately not an option here:
    // it comes out of the system print pipeline, so asking for a path first
    // would only make the user choose a destination twice.
    const doSaveAsWithFormat = useCallback(async () => {
      const { content, path } = activeDoc;
      const id = docId(path);
      const eol = eolRef.current.get(id) ?? "\n";
      try {
        const { save: dialogSave } = await import("@tauri-apps/plugin-dialog");
        const p = await dialogSave({
          filters: [
            { name: "Markdown", extensions: ["md"] },
            { name: "Word document", extensions: ["docx"] },
          ],
          defaultPath: path ? path : `${t("doc.untitled")}.md`,
        });
        if (!p) return;
        if (p.toLowerCase().endsWith(".docx")) {
          await invoke("export_docx", { markdown: content, outputPath: p });
          showToast(t("toast.docxExported"));
          return;
        }
        await saveFileAs(applyEol(content, eol), p);
        setActiveDoc((d) => ({ ...d, path: p, modified: false }));
        lastSavedRef.current.set(docId(p), content);
        rememberPath(p);
        showToast(t("toast.savedAs"));
      } catch {
        showToast(t("toast.saveFailed"));
      }
    }, [activeDoc, showToast, rememberPath]);

  const openPath = useCallback(async (filePath: string): Promise<boolean> => {
    const ext = filePath.split(".").pop()?.toLowerCase();
    if (!ext || (!MARKDOWN_EXTS.includes(ext) && !DOCX_EXTS.includes(ext))) {
      showToast(t("toast.unsupportedType")); return false;
    }
    const hasUnsaved = docs.some((d) => d.modified);
    if (hasUnsaved) { if (!(await confirmDialog(t("confirm.discard")))) return false; }
    try {
      if (DOCX_EXTS.includes(ext)) {
        const md = await invoke<string>("import_docx", { path: filePath });
        openContent(md, null, "\n", true);
        showToast(t("toast.docxImported")); return true;
      }
      if (!(await exists(filePath))) { showToast(t("toast.cannotOpenFile")); return false; }
      const { content, eol } = normalizeEol(await readTextFile(filePath));
      openContent(content, filePath, eol);
      showToast(t("toast.fileOpened")); return true;
    } catch { showToast(t("toast.cannotReadFile")); return false; }
  }, [docs, showToast, openContent]);

  const onDrop = useCallback(async (e: React.DragEvent) => {
    e.preventDefault();
    const file = e.dataTransfer.files[0];
    if (!file) return;
    const ext = file.name.split(".").pop()?.toLowerCase();
    if (!ext || (!MARKDOWN_EXTS.includes(ext) && !DOCX_EXTS.includes(ext))) { showToast(t("toast.unsupportedType")); return; }
    const hasUnsaved = docs.some((d) => d.modified);
    if (hasUnsaved) if (!(await confirmDialog(t("confirm.discard")))) return;
    try {
      if (DOCX_EXTS.includes(ext)) { showToast(t("toast.unsupportedType")); return; }
      const { content, eol } = normalizeEol(await file.text());
      eolRef.current.set(docId(null), eol);
      openContent(content, null, eol);
      showToast(t("toast.fileOpened"));
    } catch { showToast(t("toast.cannotReadFile")); }
  }, [docs, showToast, openContent]);

  useEffect(() => {
    if (!isTauri) return;
    let disposed = false;
    let unlisten: (() => void) | undefined;
    getCurrentWindow().onDragDropEvent(async (event) => {
      const payload = (event as { payload?: { type?: string; paths?: string[] } }).payload;
      if (payload?.type !== "drop") return;
      const path = payload.paths?.[0];
      if (!path || disposed) return;
      await openPath(path);
    }).then((fn) => { if (disposed) fn(); else unlisten = fn; });
    return () => { disposed = true; unlisten?.(); };
  }, [openPath]);

  useEffect(() => {
    if (!isTauri) return;
    let disposed = false;
    let unlisten: (() => void) | undefined;
    getCurrentWindow().listen<string>("open-file", async (event) => {
      const path = event.payload;
      if (!path || path === activeDoc.path) return;
      await openPath(path);
    }).then((fn) => { if (disposed) fn(); else unlisten = fn; });
    return () => { disposed = true; unlisten?.(); };
  }, [openPath, activeDoc.path]);

  // ── Auto-save draft (active doc only) ────────────────────────────
  const activeIdRef = useRef(activeId);
  const activeContentRef = useRef(activeDoc.content);
  const activePathRef = useRef(activeDoc.path);
  useEffect(() => { activeIdRef.current = activeId; }, [activeId]);
  useEffect(() => { activeContentRef.current = activeDoc.content; }, [activeDoc.content]);
  useEffect(() => { activePathRef.current = activeDoc.path; }, [activeDoc.path]);

  useEffect(() => {
    if (!isTauri) return;
    if (autoSaveTimerRef.current) clearTimeout(autoSaveTimerRef.current);
    if (!activeDoc.modified) return;
    autoSaveTimerRef.current = setTimeout(() => {
      const path = activePathRef.current ?? UNTITLED_KEY;
      invoke("save_recovery", { path, content: activeContentRef.current }).catch(() => {});
    }, 5000);
    return () => { if (autoSaveTimerRef.current) clearTimeout(autoSaveTimerRef.current); };
  }, [activeDoc.content, activeDoc.path, activeDoc.modified]);

  // ── External change detection ────────────────────────────────────
  const checkExternalChange = useCallback(async () => {
    if (checkingRef.current) return;
    const path = activeDoc.path;
    if (!path || !isTauri) return;
    checkingRef.current = true;
    try {
      if (!(await exists(path))) return;
      const { content: diskContent } = normalizeEol(await readTextFile(path));
      const id = docId(path);
      if (lastPathRef.current !== path) { lastPathRef.current = path; lastSavedRef.current.set(id, diskContent); return; }
      if (diskContent === (lastSavedRef.current.get(id) ?? "")) return;
      if (diskContent === activeDoc.content) { lastSavedRef.current.set(id, diskContent); return; }
      const choice = await confirmDialog(t("confirm.externalChange"));
      if (choice) {
        const { eol } = normalizeEol(await readTextFile(path));
        eolRef.current.set(id, eol);
        setActiveDoc(() => ({ path, content: diskContent, modified: false }));
        lastSavedRef.current.set(id, diskContent);
        lastPathRef.current = path;
        showToast(t("toast.reloaded"));
      } else { lastSavedRef.current.set(id, diskContent); }
    } catch { /* ignore */ } finally { checkingRef.current = false; }
  }, [activeDoc, showToast]);

  useEffect(() => {
    if (!isTauri) return;
    const id = setInterval(checkExternalChange, 3000);
    return () => clearInterval(id);
  }, [checkExternalChange]);

  // ── CM cursor tracking ───────────────────────────────────────────
  const onCursorMove = useCallback((line: number) => setCursorLine(line), []);

  // ── Render ───────────────────────────────────────────────────────
  const tabDocs: TabDoc[] = docs.map((d) => ({
    id: docId(d.path),
    path: d.path,
    name: d.path ? baseName(d.path) : t("doc.untitled"),
    modified: d.modified,
  }));

  const cycleFocus = useCallback(() => {
    setFocusMode((m) => m === "off" ? "paragraph" : m === "paragraph" ? "sentence" : "off");
  }, []);

  const sessionMinutes = Math.max(1, Math.round((Date.now() - sessionStart) / 60000));

  useEffect(() => {
    document.title = activeDoc.path ? `${baseName(activeDoc.path)} — Rocktier Write` : "Rocktier Write";
  }, [activeDoc.path]);

  const hasFrontmatter = useMemo(
    () => extractFrontmatter(activeDoc.content).frontmatter !== null,
    [activeDoc.content],
  );

  const onOpenRecent = useCallback((filePath: string) => {
    void openPath(filePath);
    refreshRecent();
  }, [openPath, refreshRecent]);

  const onClearRecent = useCallback(() => {
    try { localStorage.removeItem(RECENT_KEY); } catch { /* */ }
    setRecentItems([]);
  }, []);

  return (
    <div className="app-shell">
      <Toolbar
        words={stats.words}
        onToggleSidebar={() => setSidebar((v) => !v)}
        onNew={doNew}
        onOpen={doOpen}
        onSave={doSave}
        onSaveAsWithFormat={doSaveAsWithFormat}
        modified={activeDoc.modified}
        onToggleTheme={toggleTheme}
        onFindReplace={() => {
          // Find needs the editor surface; if currently previewing, switch back first.
          if (viewMode !== "edit") setViewMode("edit");
          setFindReplaceOpen((v) => !v);
        }}
        focusMode={focusMode}
        onCycleFocus={cycleFocus}
        wordGoal={wordGoal}
        onSetWordGoal={setWordGoal}
        hasFrontmatter={hasFrontmatter}
        frontmatterOpen={fmOpen}
        onToggleInfo={() => setFmOpen((v) => !v)}
        onImportDocx={doOpen}
        onExportPdf={doExportPdf}
        recentItems={recentItems}
        onOpenRecent={onOpenRecent}
        onClearRecent={onClearRecent}
      />
      <TabBar
        tabs={tabDocs}
        activeId={activeId}
        onSelect={switchDoc}
        onClose={closeDoc}
        onNew={doNew}
      />
      <div className="app-body" onDragOver={(e) => e.preventDefault()} onDrop={onDrop}>
        <aside className={`sidebar ${sidebar ? "open" : "closed"}`}>
          <WorkspaceStats
            docCount={docs.length}
            totalWords={totalWords}
            totalGoal={wordGoal}
            completedDocs={completedDocs}
            goalDocs={wordGoal > 0 ? docs.length : 0}
          />
        {fmOpen && (
          <FrontmatterPanel
            content={activeDoc.content}
            onContentChange={(c) => {
              setActiveDoc((d) => ({ ...d, content: c, modified: true }));
            }}
          />
        )}
        <ChapterTree
          headings={headings}
          currentLine={cursorLine}
          visible={sidebar}
          content={activeDoc.content}
          chapterGoals={chapterGoals.get(activeId) ?? {}}
          onSetChapterGoal={(line, goal) => {
            setChapterGoals((prev) => {
              const m = new Map(prev);
              const cur = { ...(m.get(activeId) ?? {}) };
              cur[line] = goal;
              m.set(activeId, cur);
              return m;
            });
          }}
          onJumpTo={(line) => {
            const cm = (window as unknown as { __cmView?: { state: unknown; dispatch: unknown } }).__cmView;
            if (!cm) return;
            // Use CM to position cursor
            const view = cm as unknown as { state: { doc: { line: (n: number) => { from: number } }; selection: unknown }; dispatch: (t: unknown) => void };
            const pos = view.state.doc.line(line).from;
            view.dispatch({ selection: { anchor: pos }, scrollIntoView: true });
          }}
        />
        </aside>
        <main className="editor-container">
          <ViewSwitch viewMode={viewMode} onChange={setViewMode} />
          {cmReady && findReplaceOpen && viewMode === "edit" && (
            <FindReplace onClose={() => setFindReplaceOpen(false)} />
          )}
          <div className={`editor-pane-wrap ${viewMode === "preview" ? "hidden" : ""}`}>
            <Editor
              content={activeDoc.content}
              onChange={(content) => setActiveDoc((d) => ({ ...d, content, modified: true }))}
              onEditorReady={() => setCmReady(true)}
              onCursorMove={onCursorMove}
              onPasteImage={onPasteImage}
              focusMode={focusMode}
              cursorLine={cursorLine}
              placeholder={t("editor.placeholder")}
            />
          </div>
          {viewMode === "preview" && (
            <div className="preview-pane-wrap">
              <Preview content={activeDoc.content} />
            </div>
          )}
        </main>
      </div>
      <StatusBar
        words={stats.words}
        chars={stats.chars}
        sessionMinutes={sessionMinutes}
        currentChapter={currentChapter}
        focusMode={focusMode}
        onCycleFocus={cycleFocus}
        wordGoal={wordGoal}
      />
      {toast && <div className="toast" role="status">{toast}</div>}
    </div>
  );
}
