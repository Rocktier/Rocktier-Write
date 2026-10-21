import { t } from "../i18n";
// 检查更新对话框。入口只在帮助菜单「检查更新…」—— 点击才联网，
// 启动时、工作中、后台都不检查，见 services/updates.ts 头注。
// 结果一律在这里展示：右下角的常驻悬浮入口已移除（fixed 定位不稳定，
// 容易盖住底部内容，Compressor v0.1.10 实测复现），全部收进菜单 + 弹框。
import { useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import type { UpdateResult, UpdateState } from "../services/updates";

interface UpdateDialogProps {
  state: UpdateState;
  result: UpdateResult | null;
  /** 当前安装版本，取自 package.json（与 tag 同源）。 */
  currentVersion: string;
  onClose: () => void;
}

/** 打开发布页：桌面端走 Rust 白名单入口，浏览器 dev 直接开新窗口。 */
function open(url: string) {
  if (typeof window !== "undefined" && "__TAURI_INTERNALS__" in window) {
    invoke("open_url", { url }).catch(() => {});
  } else {
    window.open(url, "_blank", "noopener");
  }
}

export function UpdateDialog({ state, result, currentVersion, onClose }: UpdateDialogProps) {
  // Esc 关闭（与 LicenseDialog 一致）
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div className="update-overlay" onMouseDown={onClose} role="presentation">
      <div
        className="update-dialog"
        onMouseDown={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label={t("update.check")}
      >
        <div className="update-header">
          <h3>{t("update.check")}</h3>
          <button type="button" className="update-close" onClick={onClose} aria-label={t("update.close")}>
            ×
          </button>
        </div>
        <div className="update-body">
          {state === "checking" && (
            <p>
              {t("update.checking")}
              <br />
              <small>{t("update.privacyNote")}</small>
            </p>
          )}
          {state === "uptodate" && (
            <p>
              {t("update.upToDate")}
              <br />
              <small>{`v${currentVersion}`}</small>
            </p>
          )}
          {state === "failed" && (
            <p>
              {t("update.failed")}
              <br />
              <small>{t("update.openReleasesHint")}</small>
            </p>
          )}
          {state === "available" && result && (
            <p>
              {t("update.available", { v: result.latest })}
              <br />
              <small>{`v${currentVersion} → v${result.latest}`}</small>
            </p>
          )}
        </div>
        <div className="update-footer">
          <button type="button" onClick={onClose}>
            {t("update.close")}
          </button>
          <span className="update-footer-spacer" />
          {state === "failed" && (
            <button type="button" onClick={() => open("https://github.com/Rocktier/Rocktier-Write/releases/latest")}>
              {t("update.openReleases")}
            </button>
          )}
          {state === "available" && result && (
            <button type="button" className="update-get-btn" onClick={() => open(result.url)}>
              {t("update.download", { v: result.latest })}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
