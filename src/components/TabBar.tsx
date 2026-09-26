/**
 * Rocktier Write — Tab bar for multi-document workspace.
 * Pure presentational + callbacks (no state).
 * Each tab shows: name, modified dot, close button.
 */
import { memo, useRef } from "react";
import { t } from "../i18n";

export interface TabDoc {
  id: string;          // path or "__untitled__"
  path: string | null;
  name: string;
  modified: boolean;
}

interface Props {
  tabs: TabDoc[];
  activeId: string;
  onSelect: (id: string) => void;
  onClose: (id: string) => void;
  onNew: () => void;
}

function baseName(path: string): string {
  return path.split(/[/\\]/).pop() || "Untitled";
}

export const TabBar = memo(function TabBar({ tabs, activeId, onSelect, onClose, onNew }: Props) {
  if (tabs.length === 0) return null;

  // Keyboard support for the tablist: roving tabindex (only the active tab is
  // in the tab order), arrows move focus + activate, Home/End jump to ends.
  // Enter/Space activate directly — a bare <div onClick> is mouse-only.
  const barRef = useRef<HTMLDivElement>(null);
  const focusTab = (index: number) => {
    const nodes = barRef.current?.querySelectorAll<HTMLElement>('[role="tab"]');
    nodes?.[index]?.focus();
  };
  const onTabKeyDown = (e: React.KeyboardEvent, index: number) => {
    const n = tabs.length;
    let next = -1;
    if (e.key === "ArrowRight") next = (index + 1) % n;
    else if (e.key === "ArrowLeft") next = (index - 1 + n) % n;
    else if (e.key === "Home") next = 0;
    else if (e.key === "End") next = n - 1;
    else if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      onSelect(tabs[index].id);
      return;
    } else return;
    e.preventDefault();
    onSelect(tabs[next].id);
    focusTab(next);
  };

  return (
    <div className="tab-bar" role="tablist" ref={barRef}>
      {tabs.map((tab, i) => (
        <div
          key={tab.id}
          className={`tab ${tab.id === activeId ? "active" : ""}`}
          role="tab"
          aria-selected={tab.id === activeId}
          tabIndex={tab.id === activeId ? 0 : -1}
          onClick={() => onSelect(tab.id)}
          onKeyDown={(e) => onTabKeyDown(e, i)}
          title={tab.path || tab.name}
        >
          <span className="tab-name">{tab.path ? baseName(tab.path) : tab.name}</span>
          {tab.modified && <span className="tab-dot" aria-label={t("toolbar.unsaved")} />}
          <button
            className="tab-close"
            title={t("sidebar.close")} aria-label={t("sidebar.close")}
            onClick={(e) => { e.stopPropagation(); onClose(tab.id); }}
          >
            ×
          </button>
        </div>
      ))}
      <button className="tab-new" onClick={onNew} title={t("toolbar.new")} aria-label={t("toolbar.new")}>
        +
      </button>
    </div>
  );
});
