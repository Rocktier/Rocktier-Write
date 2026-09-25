import { useEffect } from "react";

interface ShortcutActions {
  onSave: () => void;
  onSaveAs?: () => void;
  onNew: () => void;
  onOpen: () => void;
  onToggleSidebar: () => void;
  onFindReplace: () => void;
  onExportPdf?: () => void;
  onExportDocx?: () => void;
}

/**
 * Global keyboard shortcuts for the editor.
 * ⌘S = Save · ⌘⇧S = Save As · ⌘N = New · ⌘O = Open · ⌘\ = Toggle sidebar
 * ⌘F = Find · ⌘⇧P = Export PDF
 */
export function useKeyboardShortcuts(actions: ShortcutActions) {
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const cmd = e.metaKey || e.ctrlKey;
      if (!cmd) return;

      // Shift produces uppercase e.key ("S" for ⌘⇧S) — normalize so the
      // shift-combo shortcuts actually match.
      switch (e.key.toLowerCase()) {
        case "s":
          e.preventDefault();
          e.shiftKey ? actions.onSaveAs?.() : actions.onSave();
          break;
        case "n":
          e.preventDefault();
          actions.onNew();
          break;
        case "o":
          e.preventDefault();
          actions.onOpen();
          break;
        case "\\":
          e.preventDefault();
          actions.onToggleSidebar();
          break;
        case "f":
          e.preventDefault();
          actions.onFindReplace();
          break;
        case "p":
          e.preventDefault();
          if (e.shiftKey) {
            if (actions.onExportPdf) actions.onExportPdf();
            else if (actions.onExportDocx) actions.onExportDocx();
          }
          break;
      }
    };

    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [actions]);
}
