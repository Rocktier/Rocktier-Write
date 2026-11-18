/* i18n —— 2026-11-18 起与 PDF 仓同构：嵌套字典 + 点路径查找 + en 兜底 +
   {var} 插值 + 固定英文默认（不嗅探系统语言）。
   存储键按 PDF 的每应用命名空间：rocktier.write.lang；
   旧键 rocktier.lang / rocktier-write-lang 仅作读取回落，一次迁移后不再使用。
   对外 API（t / useUiLang / getUiLang / setUiLang / cycleUiLang /
   formatDate / formatRelative）保持不变，消费文件无需改动。 */

import { useReducer, useEffect } from 'react';
import { LOCALES, type LocaleCode } from './locales';
import { en } from './en';
import { zh } from './zh';

export type Lang = LocaleCode;
export type UiLang = Lang;

const DICTS = { en, zh } as const;
const STORAGE_KEY = 'rocktier.write.lang';
const STORAGE_KEY_LEGACY_1 = 'rocktier.lang';
const STORAGE_KEY_LEGACY_2 = 'rocktier-write-lang';

type Vars = Record<string, string | number>;

function lookup(dict: unknown, path: string): string | undefined {
  const value = path.split('.').reduce<unknown>((acc, k) => {
    if (acc && typeof acc === 'object' && k in (acc as object)) {
      return (acc as Record<string, unknown>)[k];
    }
    return undefined;
  }, dict);
  return typeof value === 'string' ? value : undefined;
}

function resolve(lang: Lang, path: string): string {
  const dict = (DICTS as Record<string, unknown>)[lang];
  const hit = (dict ? lookup(dict, path) : undefined) ?? lookup(DICTS.en, path);
  if (hit === undefined && (import.meta as unknown as { env?: { DEV?: boolean } }).env?.DEV) {
    console.error(`[i18n] missing key: ${path}`);
  }
  return hit ?? path;
}

function interpolate(template: string, vars?: Vars): string {
  if (!vars) return template;
  return template.replace(/\{(\w+)\}/g, (m, name: string) =>
    name in vars ? String(vars[name]) : m
  );
}

function detectLang(): Lang {
  try {
    const saved =
      localStorage.getItem(STORAGE_KEY) ??
      localStorage.getItem(STORAGE_KEY_LEGACY_1) ??
      localStorage.getItem(STORAGE_KEY_LEGACY_2);
    if (saved && (LOCALES as readonly { code: string }[]).some((l) => l.code === saved)) {
      return saved as Lang;
    }
  } catch {
    /* storage unavailable */
  }
  return 'en';
}

let currentLang: Lang = detectLang();
document.documentElement.lang = currentLang === 'zh' ? 'zh-CN' : currentLang;

const listeners = new Set<() => void>();

export function getUiLang(): Lang {
  return currentLang;
}

export function setUiLang(lang: Lang): void {
  currentLang = lang;
  try {
    localStorage.setItem(STORAGE_KEY, lang);
  } catch {
    /* storage unavailable */
  }
  listeners.forEach((fn) => fn());
  document.documentElement.lang = lang === 'zh' ? 'zh-CN' : lang;
}

export function t(path: string, params?: Vars): string {
  const text = resolve(currentLang, path);
  const interpolated = interpolate(text, params);
  // 快捷键符号集中平台化：Windows 上 ⌘ → Ctrl+
  return interpolated.replaceAll('⌘', 'Ctrl+');
}

/** 订阅语言变化：语言切换时触发组件重渲染。 */
export function useUiLang(): Lang {
  const [, force] = useReducer((n: number) => n + 1, 0);
  useEffect(() => {
    listeners.add(force);
    return () => {
      listeners.delete(force);
    };
  }, [force]);
  return currentLang;
}

/** 语言切换按钮用：en → zh → en 循环。 */
export function cycleUiLang(): Lang {
  const next: Lang = currentLang === 'en' ? 'zh' : 'en';
  setUiLang(next);
  return next;
}

// Locale tag per UI lang for Intl APIs
const LOCALE_MAP: Record<Lang, string> = {
  en: 'en-US',
  zh: 'zh-CN',
};

/** Locale-aware date string using the active UI language (fallback to en). */
export function formatDate(
  date: Date | number | string,
  lang: Lang = currentLang,
  opts: Intl.DateTimeFormatOptions = { year: 'numeric', month: 'short', day: 'numeric' },
): string {
  const d = new Date(date);
  if (isNaN(d.getTime())) return '';
  return new Intl.DateTimeFormat(LOCALE_MAP[lang], opts).format(d);
}

/** Relative-time string using Intl.RelativeTimeFormat. */
export function formatRelative(
  date: Date | number | string,
  lang: Lang = currentLang,
  opts: Intl.RelativeTimeFormatOptions = { numeric: 'auto' },
): string {
  const d = new Date(date);
  const now = Date.now();
  const diff = d.getTime() - now;
  const absSec = Math.abs(diff);
  const rtf = new Intl.RelativeTimeFormat(LOCALE_MAP[lang], opts);
  const cutoff = 7 * 24 * 3600 * 1000;
  if (absSec > cutoff) return formatDate(d, lang);

  const sec = Math.round(diff / 1000);
  const min = Math.round(sec / 60);
  const hr = Math.round(min / 60);
  const day = Math.round(hr / 24);

  if (Math.abs(sec) < 60) return rtf.format(sec, 'second');
  if (Math.abs(min) < 60) return rtf.format(min, 'minute');
  if (Math.abs(hr) < 24) return rtf.format(hr, 'hour');
  return rtf.format(day, 'day');
}

// 供构建期脚本取真实键结构（esbuild 求值，不用正则猜 TS）
export const __en = en;

export { LOCALES };
export type { LocaleCode };
