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
import { RichTextEditor } from "./components/RichTextEditor";
import type { ViewMode } from "./components/ViewSwitch";
import { FrontmatterPanel } from "./components/FrontmatterPanel";
import { LicenseDialog } from "./components/LicenseDialog";
import { licenseStatus, onLicenseExpired, isLicenseExpiredError, type LicenseInfo } from "./services/license";
import { useTheme } from "./hooks/useTheme";
import { useKeyboardShortcuts } from "./hooks/useKeyboardShortcuts";
import {
  openFile, saveFile, saveFileAs, confirmDialog, normalizeEol, applyEol, type Eol,
} from "./services/file";
import { exists, readTextFile, stat } from "@tauri-apps/plugin-fs";
import { WELCOME_DOCUMENT, type MarkdownDocument } from "./types/index";
import { t, useUiLang } from "./i18n";
import { extractFrontmatter } from "./services/markdown";

/* 2026-10-04 键改名：家族命名空间统一用「.」，此前 Write 用的是 "rocktier-write-…"（连字符）。
 * 改名只为跨产品一致，不该顺手清掉用户已选的偏好 —— 所以读取处仍回落旧键。旧键不删。 */
// 只写键（仅 setItem/removeItem，无读取点）—— 改名无需迁移数据，故不留 legacy 常量。
const LAST_PATH_KEY = "rocktier.last-path";
const RECENT_KEY = "rocktier.write.recent";
const RECENT_KEY_LEGACY = "rocktier-write-recent";
const VIEW_MODE_KEY = "rocktier.write.view-mode";
const VIEW_MODE_KEY_LEGACY = "rocktier-write-view-mode";
const TYPEWRITER_KEY = "rocktier.write.typewriter";
const TYPEWRITER_KEY_LEGACY = "rocktier-write-typewriter";
const RECENT_MAX = 5;
// Untitled documents have no path; recovery entries are keyed per-tab id so
// three unsaved drafts no longer overwrite each other into a single slot.
const UNTITLED_PREFIX = "__untitled__:";
const untitledKey = (id: string) => `${UNTITLED_PREFIX}${id}`;

const isTauri = typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
const MARKDOWN_EXTS = ["md", "markdown", "mdown", "mkd", "txt", "text"];
const DOCX_EXTS = ["docx"];

function baseName(path: string): string {
  return path.split(/[/\\]/).pop() || "Untitled";
}

/** Unique identity for a document. See MarkdownDocument.id — the path used to
 *  double as the tab id, which broke as soon as two untitled docs were open. */
const newDocId = (): string =>
  typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `d-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;

// Generated once per app load so the boot document and initial activeId agree.
const BOOT_DOC_ID = newDocId();

export default function App() {
  const { mode: themeMode, cycleTheme } = useTheme();
  const lang = useUiLang();

  // ── Multi-doc state ──────────────────────────────────────────────
  const [docs, setDocs] = useState<MarkdownDocument[]>([
    { id: BOOT_DOC_ID, path: null, content: WELCOME_DOCUMENT, modified: false },
  ]);
  const [activeId, setActiveId] = useState<string>(BOOT_DOC_ID);

  const [sidebar, setSidebar] = useState(true);
  const [toast, setToast] = useState("");
  const [findReplaceOpen, setFindReplaceOpen] = useState(false);
  const [cursorLine, setCursorLine] = useState(1);
  const [focusMode, setFocusMode] = useState<"off" | "paragraph" | "sentence">("off");
  const [wordGoal, setWordGoal] = useState(0);
  const [sessionStart] = useState(() => Date.now());
  const [cmReady, setCmReady] = useState(false);
  /* 视图三态：rich（Tiptap 富文本）/ source（CodeMirror 源码）/ preview（预览）。
   *
   * 默认 **rich**（所见即所得）：这是富文本改造的目的，也是绝大多数新用户唯一会用
   * 的视图 —— 把不熟 markdown 的人挡在语法外面，比让他们先学语法再写更合算。
   * 源码与预览都在，熟手随时可切，所以默认给谁都不封死路。
   * ⚠️ 这一行改回 "source" 只需改这里，但请连带改台账里的默认视图结论。
   *
   * 兼容老用户：旧键只存过 "edit"（源码）/ "preview"，映射到新枚举即可 ——
   * 不因为新增一个视图就把老用户的源码视图偏好重置掉。 */
  const [viewMode, setViewMode] = useState<ViewMode>(() => {
    const saved = localStorage.getItem(VIEW_MODE_KEY) ?? localStorage.getItem(VIEW_MODE_KEY_LEGACY);
    if (saved === "preview") return "preview";
    if (saved === "source" || saved === "edit") return "source";
    if (saved === "rich") return "rich";
    return "rich"; // 从未选过 → 富文本
  });
  // Persist view mode preference across sessions
  useEffect(() => { localStorage.setItem(VIEW_MODE_KEY, viewMode); }, [viewMode]);
  const [fmOpen, setFmOpen] = useState(false);
  const [recentItems, setRecentItems] = useState<string[]>([]);
  const refreshRecent = useCallback(() => {
    try {
      setRecentItems(JSON.parse((localStorage.getItem(RECENT_KEY) ?? localStorage.getItem(RECENT_KEY_LEGACY)) || "[]"));
    } catch { /* */ }
  }, []);
  useEffect(() => { refreshRecent(); }, [refreshRecent]);

  // Typewriter scrolling（光标锁视口 40%）：独立于 Focus Mode 的开关（W-P1-02）
  const [typewriter, setTypewriter] = useState(() => (localStorage.getItem(TYPEWRITER_KEY) ?? localStorage.getItem(TYPEWRITER_KEY_LEGACY)) === "1");
  // Persist typewriter preference across sessions
  useEffect(() => { localStorage.setItem(TYPEWRITER_KEY, typewriter ? "1" : "0"); }, [typewriter]);

  // 保存状态可见化（W-P1-09）：最近一次手动保存时间（按标签）+ 当前标签草稿自动保存时间
  const [savedAtMap, setSavedAtMap] = useState<Record<string, number>>({});
  const [draftAt, setDraftAt] = useState<number | null>(null);
  useEffect(() => { setDraftAt(null); }, [activeId]);

  const toastRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const checkingRef = useRef(false);
  const autoSaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastSavedRef = useRef<Map<string, string>>(new Map());
  const lastPathRef = useRef<string | null>(null);
  const lastTypeRef = useRef(0); // 最近一次击 tick（供外改轮询避让打字间隙，W-P1-04）
  const [chapterGoals, setChapterGoals] = useState<Map<string, Record<number, number>>>(new Map());
  const eolRef = useRef<Map<string, Eol>>(new Map());

  // 授权（家族 L6）：状态轮询 + 对话框开关。null = 尚未取到（或浏览器 dev）。
  const [license, setLicense] = useState<LicenseInfo | null>(null);
  const [licenseOpen, setLicenseOpen] = useState(false);

  // Derive active doc for convenience
  const activeDoc = useMemo(
    () => docs.find((d) => d.id === activeId) ?? docs[0],
    [docs, activeId],
  );

  const setActiveDoc = useCallback((updater: (d: MarkdownDocument) => MarkdownDocument) => {
    setDocs((prev) => {
      const id = activeId;
      return prev.map((d) => (d.id === id ? updater(d) : d));
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

  // ── License（家族 L6）：读一次试用状态；写操作被拦时由 Rust 发 license-expired
  //    事件（命令层统一发，界面不用在每个 catch 里各判一次），这里弹激活对话框并
  //    刷新状态。前端另有兜底：invoke 错误串含 LICENSE_EXPIRED 也开对话框。──
  const refreshLicense = useCallback(() => {
    if (!isTauri) return;
    licenseStatus()
      .then(setLicense)
      .catch(() => setLicense(null));
  }, []);

  const openLicense = useCallback(() => {
    setLicenseOpen(true);
    refreshLicense();
  }, [refreshLicense]);

  useEffect(() => {
    refreshLicense();
    let disposed = false;
    let unlisten: (() => void) | undefined;
    void onLicenseExpired(() => {
      setLicenseOpen(true);
      refreshLicense();
    }).then((fn) => {
      if (disposed) fn();
      else unlisten = fn;
    });
    return () => {
      disposed = true;
      unlisten?.();
    };
  }, [refreshLicense]);

  const rememberPath = useCallback((path: string | null) => {
    try {
      if (path) {
        localStorage.setItem(LAST_PATH_KEY, path);
        const list: string[] = JSON.parse(
            (localStorage.getItem(RECENT_KEY) ?? localStorage.getItem(RECENT_KEY_LEGACY)) || "[]",
          );
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
            if (!cancelled) { restored = { id: newDocId(), path: raw, content, modified: false }; eolRef.current.set(restored.id, eol); }
            break;
          }
        } catch { /* try next */ }
      }

      try {
        const entries = await invoke<Array<{ path: string; content: string; modified_ms: number }>>("list_recovery");
        const namedDrafts = entries.filter((e) => !e.path.startsWith(UNTITLED_PREFIX));
        const untitledDrafts = entries
          .filter((e) => e.path.startsWith(UNTITLED_PREFIX))
          .sort((a, b) => b.modified_ms - a.modified_ms);
        const draft = restored
          ? entries.find((e) => e.path === restored!.path)
          : untitledDrafts[0] ?? namedDrafts[0];
        if (draft && !cancelled) {
          const untitled = draft.path.startsWith(UNTITLED_PREFIX);
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
              if (!cancelled) restored = { id: newDocId(), path: untitled ? null : draft.path, content: draft.content, modified: true };
            } else {
              await invoke("clear_recovery", { path: draft.path }).catch(() => {});
            }
          }
        }
      } catch { /* best-effort */ }

      if (!cancelled && restored) {
        setDocs([restored]);
        setActiveId(restored.id);
        lastPathRef.current = restored.path;
        if (restored.path) rememberPath(restored.path);
      }
    })();
    return () => { cancelled = true; };
  }, [rememberPath]);

  const openContent = useCallback((content: string, path: string | null, eol: Eol, modified?: boolean) => {
    lastPathRef.current = path;
    setDocs((prev) => {
      // A named file reuses its tab if one is already open; untitled content
      // (imports, drops) always lands in a fresh document.
      const existing = path ? prev.find((d) => d.path === path) : undefined;
      if (existing) {
        eolRef.current.set(existing.id, eol);
        lastSavedRef.current.set(existing.id, content);
        setActiveId(existing.id);
        return prev.map((d) => (d.id === existing.id ? { ...d, content, modified: modified ?? false } : d));
      }
      const doc: MarkdownDocument = { id: newDocId(), path, content, modified: modified ?? false };
      eolRef.current.set(doc.id, eol);
      lastSavedRef.current.set(doc.id, content);
      setActiveId(doc.id);
      return [...prev, doc];
    });
    if (path) rememberPath(path);
  }, [rememberPath]);

  // ── Importer / Open a document ───────────────────────────────────
  // 打开文件与拖入/导入同语义：进标签页，同名文件聚焦既有标签，
  // 绝不整组替换、更不会连带丢掉别的未保存标签（W-P1-01）。
  const doOpen = useCallback(async () => {
    const r = await openFile();
    if (!r) return;
    if (r.path.toLowerCase().endsWith(".docx")) {
      try {
        const md = await invoke<string>("import_docx", { path: r.path });
        openContent(md, null, "\n", true);
        showToast(t("toast.docxImported"));
      } catch { showToast(t("toast.cannotOpenFile")); }
      return;
    }
    openContent(r.content, r.path, r.eol);
    showToast(t("toast.fileOpened"));
  }, [openContent, showToast]);

  // ── Save ─────────────────────────────────────────────────────────
  const doSave = useCallback(async () => {
    const { path, content } = activeDoc;
    const id = activeDoc.id;
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
        // P0-4：首次另存为后清掉未命名草稿恢复项，否则第二天会“复活”
        invoke("clear_recovery", { path: untitledKey(id) }).catch(() => {});
      } else {
        await saveFile(path, payload);
        setActiveDoc((d) => (d.content === content ? { ...d, modified: false } : d));
      }
      lastSavedRef.current.set(id, content);
      setSavedAtMap((m) => ({ ...m, [id]: Date.now() }));
      invoke("clear_recovery", { path: finalPath ?? untitledKey(id) }).catch(() => {});
      showToast(t("toast.saved"));
    } catch (e) {
      // 事件链已弹对话框（license-expired）；这里兜错误串，防事件丢失时只剩裸失败。
      if (isLicenseExpiredError(e)) openLicense();
      else showToast(t("toast.saveFailed"));
    }
  }, [activeDoc, showToast, rememberPath, openLicense]);

  const doSaveAs = useCallback(async () => {
    const { content, path } = activeDoc;
    const id = activeDoc.id;
    const eol = eolRef.current.get(id) ?? "\n";
    try {
      const p = await saveFileAs(applyEol(content, eol), path ? baseName(path) : undefined);
      if (p) {
        setActiveDoc((d) => ({ ...d, path: p, modified: false }));
        lastSavedRef.current.set(id, content);
        setSavedAtMap((m) => ({ ...m, [id]: Date.now() }));
        rememberPath(p);
        invoke("clear_recovery", { path: untitledKey(id) }).catch(() => {});
        showToast(t("toast.savedAs"));
      }
    } catch (e) {
      if (isLicenseExpiredError(e)) openLicense();
      else showToast(t("toast.saveFailed"));
    }
  }, [activeDoc, showToast, rememberPath, openLicense]);

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
    } catch (e) {
      // 导出被授权闸门拦下 → 弹激活对话框；其余失败维持原 toast。
      if (isLicenseExpiredError(e)) openLicense();
      else showToast(t("toast.saveFailed"));
    }
  }, [activeDoc, showToast, openLicense]);

  // Export PDF: switch to preview (browser print) and invoke native print.
  // The "Save as PDF" target is chosen by the user inside the print dialog.
  const doExportPdf = useCallback(async () => {
    if (viewMode !== "preview") setViewMode("preview");
    // give React a tick to paint preview, then open print dialog
    requestAnimationFrame(() => {
      // 打印失败（print_doc 起不来/被系统拒绝）至少要给个提示，不再静默吞错；
      // 复用导出家族已有的 saveFailed 键（doExportDocx 同款），不新增硬编码英文。
      // 被授权闸门拦下则弹激活对话框，不算打印失败。
      invoke("print_doc").catch((e) => {
        if (isLicenseExpiredError(e)) openLicense();
        else showToast(t("toast.saveFailed"));
      });
    });
  }, [viewMode, showToast, openLicense]);

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
      } catch (e) {
        // 图片落盘被闸门拦下：弹激活对话框；返回 null 交回编辑器走内联 base64 兜底
        // （不写盘的内容允许留在文档里，但保存会被拦）。
        if (isLicenseExpiredError(e)) openLicense();
        else showToast(t("toast.imageFailed"));
      }
    },
    [activeDoc.path, showToast, openLicense],
  );

  // New doc
  const doNew = useCallback(() => {
    const newDoc: MarkdownDocument = { id: newDocId(), path: null, content: "", modified: false };
    setDocs((prev) => [...prev, newDoc]);
    setActiveId(newDoc.id);
    showToast(t("toast.newDoc"));
  }, [showToast]);

  // ── Close a doc ──────────────────────────────────────────────────
  const closeDoc = useCallback(async (id: string) => {
    const doc = docs.find((d) => d.id === id);
    if (!doc) return;
    if (doc.modified) {
      if (!(await confirmDialog(t("confirm.discard")))) return;
    }
    setDocs((prev) => {
      const remaining = prev.filter((d) => d.id !== id);
      if (remaining.length === 0) {
        // Never leave zero documents — replace with a fresh untitled one.
        const untitled: MarkdownDocument = { id: newDocId(), path: null, content: "", modified: false };
        setActiveId(untitled.id);
        return [untitled];
      }
      return remaining;
    });
    // If closing the active doc, switch to the first remaining one.
    if (activeId === id) {
      const next = docs.find((d) => d.id !== id);
      if (next) setActiveId(next.id);
    }
  }, [docs, activeId]);

  const switchDoc = useCallback((id: string) => { setActiveId(id); }, []);

  /* 查找替换依赖 CodeMirror 面板；不在源码视图时先切回去，否则 ⌘F / 菜单 / 工具栏
     三条入口都会被渲染门（cmReady && findReplaceOpen && viewMode === "source"）
     静默吞掉。三条路径共用这一个回调，行为保持一致（对齐原工具栏按钮写法）。 */
  const toggleFindReplace = useCallback(() => {
    setViewMode("source");
    setFindReplaceOpen((v) => !v);
  }, []);

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
          case "find": toggleFindReplace(); break;
          case "toggle-sidebar": setSidebar((v) => !v); break;
          case "toggle-theme": cycleTheme(); break;
          case "license": openLicense(); break;
          /* 菜单「切换预览」在三态下：不在预览就去预览，在预览就回**富文本**。
           * 原来二态时是 edit↔preview 互换；现在「另一个编辑视图」是 rich ——
           * 从预览回源码视图不符合直觉（用户按的是「预览」，不是「源码」）。 */
          case "toggle-preview": setViewMode((m) => (m === "preview" ? "rich" : "preview")); break;
          case "toggle-frontmatter": setFmOpen((v) => !v); break;
          case "website":
            void invoke("open_url", { url: "https://rocktier.com/" }).catch(() => {});
            break;
          case "feedback":
            // 此前菜单项被创建但前端无分支 → 点了完全无反应（家族审查发现）。
            void invoke("open_url", { url: "mailto:hello@rocktier.com?subject=Rocktier%20Write%20Feedback" }).catch(() => {});
            break;
        }
      })
      .then((fn) => { if (disposed) fn(); else unlisten = fn; });
    return () => { disposed = true; unlisten?.(); };
  }, [doNew, doOpen, doSave, doSaveAs, doExportDocx, toggleFindReplace, openLicense]);

  const shortcuts = useMemo(() => ({
    onSave: doSave, onSaveAs: doSaveAs, onNew: doNew, onOpen: doOpen,
    onToggleSidebar: () => setSidebar((v) => !v),
    onFindReplace: toggleFindReplace,
    onExportPdf: doExportPdf,
  }), [doSave, doSaveAs, doNew, doOpen, doExportPdf, toggleFindReplace]);
  useKeyboardShortcuts(shortcuts);

  // ── Open file externally (drop / drag / argv) ────────────────────
    // Save As, with the format chosen in the same dialog. Markdown and Word are
    // both written to the chosen path. PDF is deliberately not an option here:
    // it comes out of the system print pipeline, so asking for a path first
    // would only make the user choose a destination twice.
    const doSaveAsWithFormat = useCallback(async () => {
      const { content, path } = activeDoc;
      const id = activeDoc.id;
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
        // P0-4 收尾：与 doSave 对齐——对话框停留期间内容可能又变了，modified 只在
        // content 仍与落盘一致时才清（照抄 doSave 命名分支的写法）；路径始终要跟上
        // 新落盘位置。未命名草稿的恢复项也一并清掉，否则次日会“复活”。
        setActiveDoc((d) => ({ ...d, path: p, modified: d.content === content ? false : d.modified }));
        lastSavedRef.current.set(id, content);
        setSavedAtMap((m) => ({ ...m, [id]: Date.now() }));
        rememberPath(p);
        invoke("clear_recovery", { path: untitledKey(id) }).catch(() => {});
        showToast(t("toast.savedAs"));
      } catch (e) {
        if (isLicenseExpiredError(e)) openLicense();
        else showToast(t("toast.saveFailed"));
      }
    }, [activeDoc, showToast, rememberPath, openLicense]);

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
      if (DOCX_EXTS.includes(ext)) {
        // 拖放拿到的 File 没有磁盘路径（与 openPath 的路径入参不同），把字节交给
        // 与导入按钮/openPath 同一个 docx→markdown 导入器（lib.rs import_docx_data）；
        // 成功/失败提示与其保持一致（docxImported / cannotReadFile）。
        const data = Array.from(new Uint8Array(await file.arrayBuffer()));
        const md = await invoke<string>("import_docx_data", { data });
        openContent(md, null, "\n", true);
        showToast(t("toast.docxImported"));
        return;
      }
      const { content, eol } = normalizeEol(await file.text());
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
      const path = activePathRef.current ?? untitledKey(activeIdRef.current);
      invoke("save_recovery", { path, content: activeContentRef.current })
        .then(() => setDraftAt(Date.now()))
        .catch(() => {});
    }, 5000);
    return () => { if (autoSaveTimerRef.current) clearTimeout(autoSaveTimerRef.current); };
  }, [activeDoc.content, activeDoc.path, activeDoc.modified]);

  // ── Flush draft on tab switch (P0-2) ──────────────────────────────
  // 切走标签时立即把上一个文档的草稿落盘，避免 5s 防抖窗口内的输入在崩溃时丢失
  const docsRef = useRef(docs);
  useEffect(() => { docsRef.current = docs; }, [docs]);
  const prevActiveIdRef = useRef(activeId);
  useEffect(() => {
    const prev = prevActiveIdRef.current;
    if (prev !== activeId) {
      const doc = docsRef.current.find((d) => d.id === prev);
      if (doc && doc.modified) {
        invoke("save_recovery", { path: doc.path ?? untitledKey(doc.id), content: doc.content }).catch(() => {});
      }
      prevActiveIdRef.current = activeId;
    }
  }, [activeId]);

  // ── External change detection ────────────────────────────────────
  const checkExternalChange = useCallback(async () => {
    // 打字间隙避让：最近 4 秒还在击键就不比对/不弹框（W-P1-04，每 3 秒整文件
    // 重读并可能弹模态曾把用户从输入中拽走）。
    if (Date.now() - lastTypeRef.current < 4000) return;
    if (checkingRef.current) return;
    const path = activeDoc.path;
    if (!path || !isTauri) return;
    checkingRef.current = true;
    try {
      if (!(await exists(path))) return;
      const { content: diskContent } = normalizeEol(await readTextFile(path));
      const id = activeDoc.id;
      if (lastPathRef.current !== path) { lastPathRef.current = path; lastSavedRef.current.set(id, diskContent); return; }
      if (diskContent === (lastSavedRef.current.get(id) ?? "")) return;
      if (diskContent === activeDoc.content) { lastSavedRef.current.set(id, diskContent); return; }
      const choice = await confirmDialog(t("confirm.externalChange"));
      if (choice) {
        const { eol } = normalizeEol(await readTextFile(path));
        eolRef.current.set(id, eol);
        setActiveDoc((d) => ({ ...d, path, content: diskContent, modified: false }));
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
    id: d.id,
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
        themeMode={themeMode}
        onToggleTheme={cycleTheme}
        onFindReplace={toggleFindReplace}
        focusMode={focusMode}
        onCycleFocus={cycleFocus}
        typewriter={typewriter}
        onToggleTypewriter={() => setTypewriter((v) => !v)}
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
            const jump = () => {
              const cm = (window as unknown as { __cmView?: unknown }).__cmView as
                | { state: { doc: { line: (n: number) => { from: number } } }; dispatch: (spec: unknown) => void }
                | undefined;
              if (!cm) return;
              // Use CM to position cursor
              const pos = cm.state.doc.line(line).from;
              cm.dispatch({ selection: { anchor: pos }, scrollIntoView: true });
            };
            // 必须切到源码视图：跳转依赖 CodeMirror 的 dispatch 与真实行号，
            // 富文本视图（Tiptap）没有这套 API，强行跳会静默无反应。
            if (viewMode !== "source") {
              // The editor surface is display:none while previewing; CM can't
              // scroll it. Switch back first, then jump after layout settles.
              // rAF alone is not enough: it is suspended for occluded/minimized
              // windows, which would silently drop the jump. Timer fallback,
              // first one to run wins via `done`.
              setViewMode("source");
              let done = false;
              const run = () => {
                if (done) return;
                done = true;
                jump();
              };
              requestAnimationFrame(() => requestAnimationFrame(run));
              setTimeout(run, 60);
              return;
            }
            jump();
          }}
        />
        </aside>
        <main className="editor-container">
          <ViewSwitch viewMode={viewMode} onChange={setViewMode} />
          {/* 查找替换只在源码视图可用：CodeMirror 侧才有真实的选区与搜索状态，
              富文本视图里再挂一份 FindReplace 会与 Tiptap 的快捷键抢 Ctrl+F。 */}
          {cmReady && findReplaceOpen && viewMode === "source" && (
            <FindReplace onClose={() => setFindReplaceOpen(false)} />
          )}

          {/* 三个视图都挂载、用 CSS 显隐而不是条件渲染：切换时不重新挂载编辑器，
              撤销栈与滚动位置得以保留 —— 条件渲染每次切换都会把编辑器重建，
              用户切回来发现 Ctrl+Z 没了。（预览没有这个问题，条件渲染即可。） */}
          <div className={`editor-pane-wrap ${viewMode !== "source" ? "hidden" : ""}`}>
            <Editor
              content={activeDoc.content}
              onChange={(content) => {
                lastTypeRef.current = Date.now(); // 击节拍：外改轮询据此避让（W-P1-04）
                setActiveDoc((d) => ({ ...d, content, modified: true }));
              }}
              onEditorReady={() => setCmReady(true)}
              onCursorMove={onCursorMove}
              onPasteImage={onPasteImage}
              focusMode={focusMode}
              typewriter={typewriter}
              cursorLine={cursorLine}
              placeholder={t("editor.placeholder")}
            />
          </div>

          <div className={`rich-pane-wrap ${viewMode !== "rich" ? "hidden" : ""}`}>
            <RichTextEditor
              content={activeDoc.content}
              onChange={(content) => {
                lastTypeRef.current = Date.now();
                setActiveDoc((d) => ({ ...d, content, modified: true }));
              }}
              onPasteImage={onPasteImage}
              onCursorMove={onCursorMove}
              placeholder={t("editor.placeholder")}
            />
          </div>

          {viewMode === "preview" && (
            <div className="preview-pane-wrap">
              <Preview content={activeDoc.content} filePath={activeDoc.path ?? undefined} />
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
        savedAt={savedAtMap[activeDoc.id] ?? null}
        draftAt={draftAt}
        modified={activeDoc.modified}
        license={license}
        onLicenseClick={openLicense}
      />
      {licenseOpen && (
        <LicenseDialog info={license} onRefresh={refreshLicense} onClose={() => setLicenseOpen(false)} />
      )}
      {toast && <div className="toast" role="status">{toast}</div>}
    </div>
  );
}
