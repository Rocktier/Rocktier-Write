/**
 * Edit / Preview — a choice about how to look at the draft, not a thing you
 * do to it. That is why it sits on the writing surface instead of the toolbar:
 * the toolbar holds actions on the document (import, export, goal), and a view
 * switch is not one of them. It stays in the same corner in both modes so the
 * eye never has to look for it twice.
 */
import { memo } from "react";
import { t } from "../i18n";

interface Props {
  viewMode: "edit" | "preview";
  onChange: (mode: "edit" | "preview") => void;
}

export const ViewSwitch = memo(function ViewSwitch({ viewMode, onChange }: Props) {
  return (
    <div className="view-switch" role="group">
      <button
        className={`view-switch-btn ${viewMode === "edit" ? "active" : ""}`}
        onClick={() => onChange("edit")}
        aria-pressed={viewMode === "edit"}
      >
        {t("toolbar.editView")}
      </button>
      <button
        className={`view-switch-btn ${viewMode === "preview" ? "active" : ""}`}
        onClick={() => onChange("preview")}
        aria-pressed={viewMode === "preview"}
      >
        {t("toolbar.preview")}
      </button>
    </div>
  );
});
