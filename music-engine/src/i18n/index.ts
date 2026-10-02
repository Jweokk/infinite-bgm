import { EN, ZH } from './ui';
import { META_EN, STYLE_DESC_EN } from './meta';
import type { StyleInfo } from '../core/types';

export type Lang = 'zh' | 'en';
export type Theme = 'dark' | 'light';
export type UiKey = keyof typeof ZH;
export type UiParams = Record<string, string | number>;

const CATALOGS: Record<Lang, Record<UiKey, string>> = { zh: ZH, en: EN };

/** Product name, per language (repo / package name: infinite-bgm). */
export const APP_NAME: Record<Lang, string> = { zh: '无限背景音乐', en: 'Infinite BGM' };

/** Look up a UI string, filling `{placeholders}`. */
export function t(lang: Lang, key: UiKey, params?: UiParams): string {
  const raw = CATALOGS[lang]?.[key] ?? ZH[key] ?? String(key);
  if (!params) return raw;
  return raw.replace(/\{(\w+)\}/g, (_m, k: string) => (params[k] !== undefined ? String(params[k]) : `{${k}}`));
}

/** Translate a plugin-supplied display string (style/parameter/option/preset). */
export function meta(value: string, lang: Lang): string {
  return lang === 'zh' ? value : (META_EN[value] ?? value);
}

/**
 * StyleInfo as the UI should display it: ids and parameter ids stay untouched
 * (they drive the engine), only human-facing strings are swapped.
 */
export function localizeStyles(styles: StyleInfo[], lang: Lang): StyleInfo[] {
  if (lang === 'zh') return styles;
  return styles.map((style) => ({
    ...style,
    description: STYLE_DESC_EN[style.id] ?? style.description,
    parameters: style.parameters.map((def) => ({
      ...def,
      name: meta(def.name, lang),
      options: def.options?.map((option) => ({ ...option, label: meta(option.label, lang) })),
    })),
    presets: style.presets.map((preset) => ({ ...preset, name: meta(preset.name, lang) })),
  }));
}

export function normalizeLang(value: string | null | undefined): Lang | null {
  if (!value) return null;
  const v = value.toLowerCase();
  if (v.startsWith('zh')) return 'zh';
  if (v.startsWith('en')) return 'en';
  return null;
}

/**
 * Resolution order: `?lang=` → saved preference → browser language → English
 * (a Chinese browser gets Chinese, everyone else gets English).
 */
export function detectLang(opts: {
  search?: string;
  stored?: string | null;
  nav?: string | null;
} = {}): Lang {
  const search = opts.search ?? (typeof location !== 'undefined' ? location.search : '');
  const stored = opts.stored ?? null;
  const navLang = opts.nav ?? (typeof navigator !== 'undefined' ? navigator.language : null);
  let fromUrl: string | null = null;
  try {
    fromUrl = new URLSearchParams(search).get('lang');
  } catch {
    fromUrl = null;
  }
  return normalizeLang(fromUrl) ?? normalizeLang(stored) ?? normalizeLang(navLang) ?? 'en';
}

/** Resolution order: `?theme=` → saved preference → the OS colour scheme. */
export function detectTheme(opts: {
  search?: string;
  stored?: string | null;
  prefersDark?: boolean;
} = {}): Theme {
  const search = opts.search ?? (typeof location !== 'undefined' ? location.search : '');
  const stored = opts.stored ?? null;
  const prefersDark = opts.prefersDark ?? false;
  let fromUrl: string | null = null;
  try {
    fromUrl = new URLSearchParams(search).get('theme');
  } catch {
    fromUrl = null;
  }
  if (fromUrl === 'light' || fromUrl === 'dark') return fromUrl;
  if (stored === 'light' || stored === 'dark') return stored;
  return prefersDark ? 'dark' : 'light';
}

/** True when the visitor asked the OS for a dark scheme. */
export function prefersDarkScheme(): boolean {
  try {
    return typeof matchMedia === 'function' && matchMedia('(prefers-color-scheme: dark)').matches;
  } catch {
    return true;
  }
}

export { ZH, EN, META_EN, STYLE_DESC_EN };
