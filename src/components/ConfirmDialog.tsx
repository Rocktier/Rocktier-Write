// 应用内确认框。家族规范（docs/ROCKTIER-UI规范-v2.md §7）禁止原生
// Tauri ask() / window.confirm；视觉直接复用 UpdateDialog 的
// .update-overlay / .update-dialog / .update-footer 与 tokens，不另造一套。
//
// 为什么这层必须存在（2026-11-14）：本仓此前 7 处「丢弃未保存的改动」确认走的
// 是 `@tauri-apps/plugin-dialog` 的 ask() —— 系统弹窗不跟应用主题，深色档下是
// 一块刺眼白板。同一根因在 Compressor 已经判成真实缺陷（D-80），MD / Compressor
// 都换成了应用内框，只有本仓还留着系统弹窗。
import { useEffect } from "react";
import { t } from "../i18n";

interface ConfirmDialogProps {
  message: string;
  onResolve: (ok: boolean) => void;
}

export function ConfirmDialog({ message, onResolve }: ConfirmDialogProps) {
  // Esc = 取消（与 UpdateDialog / LicenseDialog 一致）
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onResolve(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onResolve]);

  return (
    <div className="update-overlay" onMouseDown={() => onResolve(false)} role="presentation">
      <div
        className="update-dialog"
        onMouseDown={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label={t("confirm.title")}
      >
        <div className="update-header">
          <h3>{t("confirm.title")}</h3>
        </div>
        <div className="update-body">
          <p className="confirm-message">{message}</p>
        </div>
        <div className="update-footer">
          <button type="button" onClick={() => onResolve(false)}>
            {t("confirm.cancel")}
          </button>
          <span className="update-footer-spacer" />
          <button type="button" className="update-get-btn" onClick={() => onResolve(true)}>
            {t("confirm.ok")}
          </button>
        </div>
      </div>
    </div>
  );
}
