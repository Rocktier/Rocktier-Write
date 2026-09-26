/**
 * Rocktier Write — Tab bar for multi-document workspace.
 * Pure presentational + callbacks (no state).
 * Each tab shows: name, modified dot, close button.
 */
import { memo } from "react";
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

  return (
    <div className="tab-bar" role="tablist">
      {tabs.map((tab) => (
        <div
          key={tab.id}
          className={`tab ${tab.id === activeId ? "active" : ""}`}
          role="tab"
          aria-selected={tab.id === activeId}
          onClick={() => onSelect(tab.id)}
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
