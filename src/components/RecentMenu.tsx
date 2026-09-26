/**
 * Rocktier Write — "Open Recent" popover.
 * Reads the RECENT_KEY localStorage list; no new state source — App already
 * writes it in rememberPath. Clicking an item calls onOpen(path).
 */
import { memo } from "react";
import { t } from "../i18n";

interface Props {
  items: string[];
  onOpen: (path: string) => void;
  onClear: () => void;
}

function shortName(p: string): string {
  const base = p.split(/[/\\]/).pop() || p;
  return base.length > 36 ? base.slice(0, 16) + "…" + base.slice(-16) : base;
}

export const RecentMenu = memo(function RecentMenu({ items, onOpen, onClear }: Props) {
  if (items.length === 0) {
    return (
      <div className="recent-menu">
        <div className="recent-empty">{t("recent.empty")}</div>
      </div>
    );
  }
  return (
    <div className="recent-menu">
      <div className="recent-header">
        <span>{t("recent.title")}</span>
        <button className="recent-clear" onClick={onClear} title={t("recent.clear")} aria-label={t("recent.clear")}>
          {t("recent.clear")}
        </button>
      </div>
      <ul className="recent-list">
        {items.map((p) => (
          <li key={p}>
            <button className="recent-item" onClick={() => onOpen(p)} title={p}>
              <span className="recent-name">{shortName(p)}</span>
              <span className="recent-path">{p}</span>
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
});
