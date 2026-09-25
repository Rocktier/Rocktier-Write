import { useState, useCallback, useEffect, useMemo, useRef } from "react";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { invoke } from "@tauri-apps/api/core";
import { Toolbar } from "./components/Toolbar";
import { Editor } from "./components/Editor";
import { ChapterTree } from "./components/ChapterTree";
import { FindReplace } from "./components/FindReplace";
import { StatusBar } from "./components/StatusBar";
import { useTheme, toggleTheme } from "./hooks/useTheme";
import { useKeyboardShortcuts } from "./hooks/useKeyboardShortcuts";
import {
  openFile, saveFile, saveFileAs, confirmDialog, normalizeEol, applyEol, type Eol,
} from "./services/file";
import { exists, readTextFile, stat } from "@tauri-apps/plugin-fs";
import { WELCOME_DOCUMENT, type MarkdownDocument } from "./types/index";
import { t, useUiLang } from "./i18n";

const LAST_PATH_KEY = "rocktier-write-last-path";
const RECENT_KEY = "rocktier-write-recent";
const RECENT_MAX = 5;

const isTauri = typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;

const MARKDOWN_EXTS = ["md", "markdown", "mdown", "mkd", "txt", "text"];
const DOCX_EXTS = ["docx"];

type FocusMode = "off" | "paragraph" | "sentence";

function baseName(path: string): string {
  return path.split(/[/\\]/).pop() || "Untitled";
}

export default function App() {
  useTheme();
  const lang = useUiLang();

  const [doc, setDoc] = useState<MarkdownDocument>({
    path: null,
    content: WELCOME_DOCUMENT,
    modified: false,
  });

  const [sidebar, setSidebar] = useState(true);
  const [toast, setToast] = useState("");
  const [findReplaceOpen, setFindReplaceOpen] = useState(false);
  const [cursorLine, setCursorLine] = useState(1);
  const [focusMode, setFocusMode] = useState<FocusMode>("off");
  const [wordGoal, setWordGoal] = useState(0);
  const [sessionStart] = useState(() => Date.now());

  const toastRef = useRef(0);
  const checkingRef = useRef(false);
  const editorRef = useRef<HTMLTextAreaElement>(null);
  const docRef = useRef(doc);
  const lastSavedContentRef = useRef(doc.content);
  const UNTITLED_KEY = "__untitled__";
  const lastPathRef = useRef<string | null>(null);
  const autoSaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const eolRef = useRef<Eol>("\n");

  const stats = useMemo(() => {
    const text = doc.content.trim();
    if (!text) return { words: 0, minutes: 0, chars: 0 };
    const cn = (text.match(/[\u3400-\u9fff\uf900-\ufaff]/g) || []).length;
    const en = (text.match(/[a-zA-Z0-9_]+/g) || []).length;
    const words = cn + en;
    const ratio = words > 0 ? cn / words : 0;
    const wpm = 350 + ratio * 150;
    const minutes = words === 0 ? 0 : Math.max(1, Math.ceil(words / wpm));
    const chars = text.length;
    return { words, minutes, chars };
  }, [doc.content]);

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

  const headings = useMemo(() => extractHeadings(doc.content), [doc.content, extractHeadings]);

  const currentChapter = useMemo(() => {
    if (!headings.length) return "";
    let chapter = headings[0].text;
    for (const h of headings) {
      if (h.line <= cursorLine) chapter = h.text;
      else break;
    }
    return chapter;
  }, [headings, cursorLine]);

  useEffect(() => { docRef.current = doc; }, [doc]);

  const showToast = useCallback((msg: string) => {
    setToast(msg);
    if (toastRef.current) window.clearTimeout(toastRef.current);
    toastRef.current = window.setTimeout(() => setToast(""), 2500);
  }, []);

  const clearRecovery = useCallback((key: string | null | undefined) => {
    if (!key || !isTauri) return;
    invoke("clear_recovery", { path: key }).catch(() => {});
  }, []);

  const clearPreviousDrafts = useCallback(() => {
    clearRecovery(docRef.current.path);
    if (docRef.current.modified || !docRef.current.path) clearRecovery(UNTITLED_KEY);
  }, [clearRecovery]);

  // Close-guard with Rust
  useEffect(() => {
    if (!isTauri) return;
    let disposed = false;
    let unlisten: (() => void) | undefined;
    (async () => {
      const fn = await getCurrentWindow().listen<null>("app-close-requested", async () => {
        invoke("close_ack").catch(() => {});
        if (docRef.current.modified) {
          if (!(await confirmDialog(t("confirm.discard")))) return;
        }
        try { await invoke("force_close"); } catch { /* window gone */ }
      });
      if (disposed) { fn(); return; }
      unlisten = fn;
      await invoke("mark_ready").catch(() => {});
    })();
    return () => { disposed = true; unlisten?.(); };
  }, []);

  const rememberPath = useCallback((path: string | null) => {
    try {
      if (path) {
        localStorage.setItem(LAST_PATH_KEY, path);
        const list: string[] = JSON.parse(localStorage.getItem(RECENT_KEY) || "[]");
        const next = [path, ...list.filter((p) => p !== path)].slice(0, RECENT_MAX);
        localStorage.setItem(RECENT_KEY, JSON.stringify(next));
      } else {
        localStorage.removeItem(LAST_PATH_KEY);
      }
    } catch { /* non-fatal */ }
  }, []);

  // Recovery restore on launch
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
            if (!cancelled) { eolRef.current = eol; restored = { path: raw, content, modified: false }; }
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
              try {
                const info = await stat(draft.path);
                stale = (info.mtime ? info.mtime.getTime() : 0) > draft.modified_ms;
              } catch { /* not found = fresh */ }
              message = t(stale ? "confirm.recoverNamedOlder" : "confirm.recoverNamedNewer", { name });
            }
            if (await confirmDialog(message)) {
              if (!cancelled) {
                restored = { path: untitled ? null : draft.path, content: draft.content, modified: true };
              }
            } else {
              await invoke("clear_recovery", { path: draft.path }).catch(() => {});
            }
          }
        }
      } catch { /* best-effort */ }

      if (!cancelled && restored) {
        setDoc(restored);
        if (restored.path) rememberPath(restored.path);
      }
    })();
    return () => { cancelled = true; };
  }, [rememberPath]);

  const onChange = useCallback((content: string) => {
    setDoc((d) => ({ ...d, content, modified: true }));
  }, []);

  const confirmDiscard = useCallback(async (): Promise<boolean> => {
    if (!docRef.current.modified) return true;
    return confirmDialog(t("confirm.discard"));
  }, []);

  const openMarkdownContent = useCallback(async (content: string, path: string | null, eol: Eol, opts?: { modified?: boolean }) => {
    clearPreviousDrafts();
    eolRef.current = eol;
    lastSavedContentRef.current = content;
    lastPathRef.current = path;
    setDoc({ path, content, modified: opts?.modified ?? false });
    if (path) rememberPath(path);
  }, [clearPreviousDrafts, rememberPath]);

  const doOpen = useCallback(async () => {
    if (!(await confirmDiscard())) return;
    const r = await openFile();
    if (r) {
      if (r.path.toLowerCase().endsWith(".docx")) {
        try {
          const md = await invoke<string>("import_docx", { path: r.path });
          await openMarkdownContent(md, null, r.eol, { modified: true });
          showToast(t("toast.docxImported"));
        } catch {
          showToast(t("toast.cannotOpenFile"));
        }
        return;
      }
      await openMarkdownContent(r.content, r.path, r.eol);
      showToast(t("toast.fileOpened"));
    }
  }, [confirmDiscard, showToast, openMarkdownContent]);

  const doSave = useCallback(async () => {
    const { path, content } = docRef.current;
    const payload = applyEol(content, eolRef.current);
    try {
      if (!path) {
        const p = await saveFileAs(payload);
        if (!p) return;
        lastSavedContentRef.current = content;
        lastPathRef.current = p;
        clearRecovery(UNTITLED_KEY);
        setDoc((d) => (d.content === content ? { ...d, path: p, modified: false } : { ...d, path: p }));
        rememberPath(p);
      } else {
        await saveFile(path, payload);
        lastSavedContentRef.current = content;
        clearRecovery(path);
        setDoc((d) => (d.content === content ? { ...d, modified: false } : d));
      }
      showToast(t("toast.saved"));
    } catch {
      showToast(t("toast.saveFailed"));
    }
  }, [showToast, rememberPath, clearRecovery]);

  const doSaveAs = useCallback(async () => {
    const content = docRef.current.content;
    try {
      const name = docRef.current.path ? baseName(docRef.current.path) : undefined;
      const p = await saveFileAs(applyEol(content, eolRef.current), name);
      if (p) {
        lastSavedContentRef.current = content;
        lastPathRef.current = p;
        clearRecovery(UNTITLED_KEY);
        clearRecovery(docRef.current.path);
        setDoc((d) => (d.content === content ? { ...d, path: p, modified: false } : { ...d, path: p }));
        rememberPath(p);
        showToast(t("toast.savedAs"));
      }
    } catch {
      showToast(t("toast.saveFailed"));
    }
  }, [showToast, rememberPath, clearRecovery]);

  const doExportDocx = useCallback(async () => {
    try {
      const content = docRef.current.content;
      const path = docRef.current.path;
      let targetPath = path ? path.replace(/\.[^.]+$/, ".docx") : null;
      if (!targetPath) {
        // Use Tauri dialog to pick save location
        const { save: dialogSave } = await import("@tauri-apps/plugin-dialog");
        const p = await dialogSave({
          filters: [{ name: "DOCX Document", extensions: ["docx"] }],
          defaultPath: path ? baseName(path).replace(/\.[^.]+$/, "") : "untitled",
        });
        if (!p) return;
        targetPath = p;
      }
      await invoke("export_docx", { markdown: content, outputPath: targetPath });
      showToast(t("toast.docxExported"));
    } catch {
      showToast(t("toast.saveFailed"));
    }
  }, [showToast]);

  const doNew = useCallback(async () => {
    if (!(await confirmDiscard())) return;
    clearPreviousDrafts();
    eolRef.current = "\n";
    setDoc({ path: null, content: "", modified: false });
    showToast(t("toast.newDoc"));
  }, [confirmDiscard, showToast, clearPreviousDrafts]);

  // Rebuild native menu on language change
  useEffect(() => {
    if (!isTauri) return;
    invoke("build_menu", { lang }).catch(() => {});
  }, [lang]);

  // Menu events
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
          case "find": setFindReplaceOpen((v) => !v); break;
          case "toggle-sidebar": setSidebar((v) => !v); break;
          case "toggle-theme": toggleTheme(); break;
        }
      })
      .then((fn) => { if (disposed) fn(); else unlisten = fn; });
    return () => { disposed = true; unlisten?.(); };
  }, [doNew, doOpen, doSave, doSaveAs, doExportDocx]);

  const shortcuts = useMemo(() => ({
    onSave: doSave, onSaveAs: doSaveAs, onNew: doNew, onOpen: doOpen,
    onToggleSidebar: () => setSidebar((v) => !v),
    onFindReplace: () => setFindReplaceOpen((v) => !v),
  }), [doSave, doSaveAs, doNew, doOpen]);
  useKeyboardShortcuts(shortcuts);

  const displayName = doc.path ? baseName(doc.path) : t("doc.untitled");

  const openPath = useCallback(async (filePath: string): Promise<boolean> => {
    const ext = filePath.split(".").pop()?.toLowerCase();
    if (!ext || (!MARKDOWN_EXTS.includes(ext) && !DOCX_EXTS.includes(ext))) {
      showToast(t("toast.unsupportedType"));
      return false;
    }
    if (!(await confirmDiscard())) return false;
    try {
      if (DOCX_EXTS.includes(ext)) {
        const md = await invoke<string>("import_docx", { path: filePath });
        await openMarkdownContent(md, null, "\n", { modified: true });
        showToast(t("toast.docxImported"));
        return true;
      }
      if (!(await exists(filePath))) { showToast(t("toast.cannotOpenFile")); return false; }
      const { content, eol } = normalizeEol(await readTextFile(filePath));
      await openMarkdownContent(content, filePath, eol);
      showToast(t("toast.fileOpened"));
      return true;
    } catch {
      showToast(t("toast.cannotReadFile"));
      return false;
    }
  }, [confirmDiscard, showToast, openMarkdownContent]);

  // File drag & drop (browser dev mode: DOCX can't be read locally)
  const onDrop = useCallback(async (e: React.DragEvent) => {
    e.preventDefault();
    const file = e.dataTransfer.files[0];
    if (!file) return;
    const ext = file.name.split(".").pop()?.toLowerCase();
    if (!ext || (!MARKDOWN_EXTS.includes(ext) && !DOCX_EXTS.includes(ext))) {
      showToast(t("toast.unsupportedType")); return;
    }
    if (!(await confirmDiscard())) return;
    try {
      if (DOCX_EXTS.includes(ext)) {
        showToast(t("toast.unsupportedType"));
        return;
      }
      const text = await file.text();
      const { content, eol } = normalizeEol(text);
      eolRef.current = eol;
      setDoc({ path: null, content, modified: false });
      showToast(t("toast.fileOpened"));
    } catch { showToast(t("toast.cannotReadFile")); }
  }, [confirmDiscard, showToast]);

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
      if (!path || path === docRef.current.path) return;
      await openPath(path);
    }).then((fn) => { if (disposed) fn(); else unlisten = fn; });
    return () => { disposed = true; unlisten?.(); };
  }, [openPath]);

  // Auto-save draft
  const autoSave = useCallback(async (path: string | null, content: string) => {
    if (!path) path = UNTITLED_KEY;
    if (!isTauri) return;
    try { await invoke("save_recovery", { path, content }); } catch { /* best-effort */ }
  }, []);

  useEffect(() => {
    if (autoSaveTimerRef.current) clearTimeout(autoSaveTimerRef.current);
    if (!doc.modified) return;
    autoSaveTimerRef.current = setTimeout(() => { autoSave(doc.path, doc.content); }, 5000);
    return () => { if (autoSaveTimerRef.current) clearTimeout(autoSaveTimerRef.current); };
  }, [doc.content, doc.path, doc.modified, autoSave]);

  // External change detection
  const externalCheckRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const checkExternalChange = useCallback(async () => {
    if (checkingRef.current) return;
    const { path } = docRef.current;
    if (!path || !isTauri) return;
    checkingRef.current = true;
    try {
      if (!(await exists(path))) return;
      const { content: diskContent } = normalizeEol(await readTextFile(path));
      if (lastPathRef.current !== path) {
        lastPathRef.current = path;
        lastSavedContentRef.current = diskContent;
        return;
      }
      if (diskContent === lastSavedContentRef.current) return;
      if (diskContent === docRef.current.content) {
        lastSavedContentRef.current = diskContent;
        return;
      }
      const choice = await confirmDialog(t("confirm.externalChange"));
      if (choice) {
        const { eol } = normalizeEol(await readTextFile(path));
        eolRef.current = eol;
        setDoc({ path, content: diskContent, modified: false });
        lastSavedContentRef.current = diskContent;
        showToast(t("toast.reloaded"));
      } else {
        lastSavedContentRef.current = diskContent;
      }
    } catch { /* ignore */ } finally {
      checkingRef.current = false;
    }
  }, [showToast]);

  useEffect(() => {
    if (!isTauri) return;
    externalCheckRef.current = setInterval(checkExternalChange, 3000);
    return () => { if (externalCheckRef.current) clearInterval(externalCheckRef.current); };
  }, [checkExternalChange]);

  const onCursorMove = useCallback(() => {
    const el = editorRef.current;
    if (!el) return;
    const pos = el.selectionStart;
    const textBefore = el.value.substring(0, pos);
    const lines = textBefore.split("\n");
    setCursorLine(lines.length);
  }, []);

  useEffect(() => {
    document.title = doc.path ? `${baseName(doc.path)} — Rocktier Write` : "Rocktier Write";
  }, [doc.path]);

  const cycleFocus = useCallback(() => {
    setFocusMode((m) => m === "off" ? "paragraph" : m === "paragraph" ? "sentence" : "off");
  }, []);

  const sessionMinutes = Math.max(1, Math.round((Date.now() - sessionStart) / 60000));

  return (
    <div className="app-shell">
      <Toolbar
        onToggleSidebar={() => setSidebar((v) => !v)}
        onNew={doNew}
        onOpen={doOpen}
        onSave={doSave}
        modified={doc.modified}
        displayName={displayName}
        words={stats.words}
        minutes={stats.minutes}
        onToggleTheme={toggleTheme}
        onFindReplace={() => setFindReplaceOpen((v) => !v)}
        focusMode={focusMode}
        onCycleFocus={cycleFocus}
        wordGoal={wordGoal}
        onSetWordGoal={setWordGoal}
        hasFrontmatter={false}
        frontmatterOpen={false}
        onToggleInfo={() => {}}
        onImportDocx={doOpen}
        onExportDocx={doExportDocx}
      />
      <div className="app-body" onDragOver={(e) => e.preventDefault()} onDrop={onDrop}>
        <ChapterTree
          headings={headings}
          currentLine={cursorLine}
          visible={sidebar}
          onJumpTo={(line) => {
            const el = editorRef.current;
            if (!el) return;
            const allLines = el.value.split("\n");
            let pos = 0;
            for (let i = 0; i < line - 1 && i < allLines.length; i++) {
              pos += allLines[i].length + 1;
            }
            el.focus();
            el.setSelectionRange(pos, pos);
            const lineHeight = parseFloat(getComputedStyle(el).lineHeight) || 28;
            el.scrollTop = Math.max(0, (line - 4) * lineHeight);
          }}
        />
        <main className="editor-container">
          <Editor
            content={doc.content}
            onChange={onChange}
            textareaRef={editorRef as React.RefObject<HTMLTextAreaElement>}
            onCursorMove={onCursorMove}
            focusMode={focusMode}
            cursorLine={cursorLine}
          />
          {findReplaceOpen && (
            <FindReplace
              content={doc.content}
              textareaRef={editorRef as React.RefObject<HTMLTextAreaElement>}
              onChange={onChange}
              onClose={() => setFindReplaceOpen(false)}
            />
          )}
        </main>
      </div>
      <StatusBar
        words={stats.words}
        chars={stats.chars}
        minutes={stats.minutes}
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
