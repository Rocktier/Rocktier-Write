import { useCallback, useEffect, useState } from "react";

/** 三态：auto 跟随系统 → light → dark → auto（家族 §6.5 唯一状态机）。 */
export type ThemeMode = "auto" | "light" | "dark";
type Resolved = "light" | "dark";

/* 2026-10-04 键改名（"rocktier-write-theme" → "rocktier.theme"），理由同 i18n.ts。 */
const THEME_KEY = "rocktier.theme";
const THEME_KEY_LEGACY = "rocktier-write-theme";
const CYCLE: readonly ThemeMode[] = ["auto", "light", "dark"];

/** 三态引入前这个键只存 dark/light —— 原样读取，老用户偏好不丢。 */
function readMode(): ThemeMode {
  if (typeof window === "undefined") return "auto";
  try {
    const stored = (localStorage.getItem(THEME_KEY) ??
      localStorage.getItem(THEME_KEY_LEGACY)) as ThemeMode | null;
    if (stored === "auto" || stored === "light" || stored === "dark") return stored;
  } catch {
    // 隐私模式 / 存储被禁用：偏好读取失败不能把整个 App 渲染打挂
  }
  // 从没手动选过：跟随系统（家族基线）
  return "auto";
}

function systemTheme(): Resolved {
  if (typeof window === "undefined") return "dark";
  return window.matchMedia("(prefers-color-scheme: light)").matches ? "light" : "dark";
}

/** auto 落成实际生效值 —— data-theme 只接受 light/dark。 */
function resolve(mode: ThemeMode): Resolved {
  return mode === "auto" ? systemTheme() : mode;
}

function applyResolved(resolved: Resolved) {
  document.documentElement.setAttribute("data-theme", resolved);
}

function persist(mode: ThemeMode) {
  try {
    localStorage.setItem(THEME_KEY, mode);
  } catch {
    // ignore —— 主题本次会话仍然生效
  }
}

export function useTheme() {
  const [mode, setMode] = useState<ThemeMode>(readMode);

  useEffect(() => {
    applyResolved(resolve(mode));
  }, [mode]);

  // auto 态下系统外观变了要跟着变；light/dark 是明确选择，不动。
  useEffect(() => {
    if (mode !== "auto") return;
    const mq = window.matchMedia("(prefers-color-scheme: light)");
    const onChange = () => applyResolved(systemTheme());
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, [mode]);

  const cycleTheme = useCallback(() => {
    setMode((prev) => {
      const next = CYCLE[(CYCLE.indexOf(prev) + 1) % CYCLE.length];
      persist(next);
      return next;
    });
  }, []);

  return { mode, cycleTheme };
}