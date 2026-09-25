// File I/O service — Tauri-backed

import { invoke } from "@tauri-apps/api/core";
import { open as dialogOpen, save as dialogSave, ask } from "@tauri-apps/plugin-dialog";
import { readTextFile, writeTextFile, exists } from "@tauri-apps/plugin-fs";

const isTauri = typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;

/**
 * Atomic write (temp file + rename, see `save_document` in lib.rs).
 * The plugin's writeTextFile truncates the target first, so a failure halfway
 * leaves the user's document destroyed; this never touches the original until
 * the new content is safely on disk.
 */
async function writeAtomic(path: string, content: string): Promise<void> {
  if (isTauri) {
    await invoke("save_document", { path, content });
    return;
  }
  await writeTextFile(path, content);
}

const MD_EXTENSIONS = [
  { name: "Markdown", extensions: ["md", "markdown", "mdown", "mkd", "mkdn", "mdwn", "mdtxt", "mdtext", "text", "txt"] },
  { name: "All Files", extensions: ["*"] },
];

/** Native warning dialog in Tauri, window.confirm in browser-only dev mode. */
export async function confirmDialog(message: string): Promise<boolean> {
  if (isTauri) {
    try {
      return await ask(message, { title: "Rocktier Markdown", kind: "warning" });
    } catch {
      return window.confirm(message);
    }
  }
  return window.confirm(message);
}

/**
 * Splits raw file text into LF-normalised content plus the line ending it used.
 *
 * A textarea's value normalises \r\n and \r to \n, so a CRLF file (the norm on
 * Windows) came back as LF on the first keystroke and was written back that way —
 * silently rewriting every line of the user's file.
 */
export function normalizeEol(raw: string): { content: string; eol: Eol } {
  const eol: Eol = raw.includes("\r\n") ? "\r\n" : "\n";
  return { content: raw.replace(/\r\n?/g, "\n"), eol };
}

/** Restores the document's original line ending on its way back to disk. */
export function applyEol(content: string, eol: Eol): string {
  return eol === "\r\n" ? content.replace(/\n/g, "\r\n") : content;
}

export type Eol = "\n" | "\r\n";

export async function openFile(): Promise<{ path: string; content: string; eol: Eol } | null> {
  try {
    const path = await dialogOpen({
      multiple: false,
      filters: MD_EXTENSIONS,
    });

    if (!path || Array.isArray(path)) return null;

    const fileExists = await exists(path);
    if (!fileExists) return null;

    const { content, eol } = normalizeEol(await readTextFile(path));
    return { path, content, eol };
  } catch (err) {
    console.error("Failed to open file:", err);
    return null;
  }
}

export async function saveFile(path: string, content: string): Promise<void> {
  await writeAtomic(path, content);
}

export async function saveFileAs(content: string, defaultName?: string): Promise<string | null> {
  const path = await dialogSave({
    filters: MD_EXTENSIONS,
    defaultPath: defaultName || "Untitled.md",
  });

  if (!path) return null;

  await writeAtomic(path, content);
  return path;
}
