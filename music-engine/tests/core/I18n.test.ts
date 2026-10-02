import { describe, expect, it } from 'vitest';
import type { StyleInfo, StylePlugin } from '../../src/core/types';
import { EN, ZH } from '../../src/i18n/ui';
import { META_EN, STYLE_DESC_EN } from '../../src/i18n/meta';
import { detectLang, detectTheme, localizeStyles, meta, t } from '../../src/i18n';
import { lofiPlugin } from '../../src/styles/lofi';
import { zenPlugin } from '../../src/styles/zen';
import { jazzhopPlugin } from '../../src/styles/jazzhop';
import { meditationPlugin } from '../../src/styles/meditation';
import { ambientPlugin } from '../../src/styles/ambient';
import { japanesePlugin } from '../../src/styles/japanese';
import { naturePlugin } from '../../src/styles/nature';
import { sleepPlugin } from '../../src/styles/sleep';
import { cinematicPlugin } from '../../src/styles/cinematic';
import { minimalPlugin } from '../../src/styles/minimal';
import { dreamPlugin } from '../../src/styles/dream';
import { synthwavePlugin } from '../../src/styles/synthwave';
import { deepHousePlugin } from '../../src/styles/deephouse';
import { neoClassicalPlugin } from '../../src/styles/neoclassical';
import { chiptunePlugin } from '../../src/styles/chiptune';
import { darkAmbientPlugin } from '../../src/styles/darkambient';

/** Mirrors how the registry normalizes a plugin into StyleInfo. */
const asInfo = (p: StylePlugin): StyleInfo => ({
  id: p.id,
  name: p.name,
  version: p.version,
  description: p.description,
  timeMode: p.timeMode,
  tags: p.tags,
  parameters: p.parameters,
  presets: p.presets,
  requiredInstruments: p.requiredInstruments ?? [],
  optionalInstruments: p.optionalInstruments ?? [],
  requiredFX: p.requiredFX ?? [],
  optionalFX: p.optionalFX ?? [],
  color: p.color,
});

const PLUGINS: StyleInfo[] = [
  lofiPlugin,
  zenPlugin,
  jazzhopPlugin,
  meditationPlugin,
  ambientPlugin,
  japanesePlugin,
  naturePlugin,
  sleepPlugin,
  cinematicPlugin,
  minimalPlugin,
  dreamPlugin,
  synthwavePlugin,
  deepHousePlugin,
  neoClassicalPlugin,
  chiptunePlugin,
  darkAmbientPlugin,
].map(asInfo);

const CJK = /[\u4e00-\u9fff]/;

describe('i18n — UI catalog', () => {
  it('zh and en carry exactly the same keys', () => {
    expect(Object.keys(EN).sort()).toEqual(Object.keys(ZH).sort());
  });

  it('has no empty strings and no untranslated leftovers in en', () => {
    // The language button deliberately shows the *other* language's name.
    const CJK_ALLOWED = new Set(['lang.buttonLabel']);
    for (const [key, value] of Object.entries(EN)) {
      expect(value.trim(), `en[${key}] is empty`).not.toBe('');
      if (CJK_ALLOWED.has(key)) continue;
      // Chinese UI text meant for zh must not leak into the en catalog.
      expect(CJK.test(value), `en[${key}] still contains Chinese: ${value}`).toBe(false);
    }
    for (const [key, value] of Object.entries(ZH)) {
      expect(value.trim(), `zh[${key}] is empty`).not.toBe('');
    }
  });

  it('interpolates named params and leaves unknown ones visible', () => {
    expect(t('en', 'toast.seedQueued', { seed: '123' })).toContain('123');
    expect(t('zh', 'toast.seedQueued', { seed: '123' })).toContain('123');
    // A missing param must not print "undefined".
    const out = t('en', 'toast.styleQueued', {});
    expect(out).not.toContain('undefined');
    expect(out).toContain('{name}');
  });
});

describe('i18n — style metadata coverage', () => {
  /**
   * Every Chinese string the plugins can show in the UI, except style
   * descriptions — those are keyed by style id and covered separately.
   */
  const chineseStrings = (): string[] => {
    const out: string[] = [];
    for (const p of PLUGINS) {
      if (CJK.test(p.name)) out.push(p.name);
      for (const def of p.parameters ?? []) {
        if (CJK.test(def.name)) out.push(def.name);
        for (const opt of def.options ?? []) if (CJK.test(opt.label)) out.push(opt.label);
      }
      for (const preset of p.presets ?? []) if (CJK.test(preset.name)) out.push(preset.name);
    }
    return out;
  };

  it('translates every Chinese style description', () => {
    const missing = PLUGINS.filter((p) => CJK.test(p.description) && !STYLE_DESC_EN[p.id]).map((p) => p.id);
    expect(missing, `styles without an English description: ${missing.join(', ')}`).toEqual([]);
  });

  it('translates every Chinese parameter name and option label', () => {
    const missing = chineseStrings().filter((s) => !META_EN[s]);
    expect(missing, `untranslated strings: ${[...new Set(missing)].join(' | ')}`).toEqual([]);
  });

  it('leaves no Chinese anywhere in the English view of the metadata', () => {
    const english = localizeStyles(PLUGINS, 'en');
    const leftovers: string[] = [];
    for (const s of english) {
      if (CJK.test(s.name)) leftovers.push(`name:${s.name}`);
      if (CJK.test(s.description)) leftovers.push(`description:${s.id}`);
      for (const def of s.parameters) {
        if (CJK.test(def.name)) leftovers.push(`param:${def.name}`);
        for (const opt of def.options ?? []) if (CJK.test(opt.label)) leftovers.push(`option:${opt.label}`);
      }
      for (const preset of s.presets) if (CJK.test(preset.name)) leftovers.push(`preset:${preset.name}`);
    }
    expect(leftovers).toEqual([]);
  });

  it('keeps ids, values and the Chinese originals intact', () => {
    const zh = localizeStyles(PLUGINS, 'zh');
    const en = localizeStyles(PLUGINS, 'en');
    expect(zh.map((s) => s.id)).toEqual(en.map((s) => s.id));
    expect(zh[0].description).toBe(PLUGINS[0].description); // zh = plugin original
    for (let i = 0; i < zh.length; i++) {
      expect(en[i].parameters.map((d) => d.id)).toEqual(zh[i].parameters.map((d) => d.id));
      expect(en[i].presets.map((p) => p.id)).toEqual(zh[i].presets.map((p) => p.id));
      expect(en[i].timeMode).toBe(zh[i].timeMode);
      // select options keep their values (logic) and only swap the label
      for (let j = 0; j < zh[i].parameters.length; j++) {
        const a = zh[i].parameters[j];
        const b = en[i].parameters[j];
        expect((b.options ?? []).map((o) => o.value)).toEqual((a.options ?? []).map((o) => o.value));
      }
    }
  });

  it('meta() passes unknown strings through unchanged', () => {
    expect(meta('Lofi', 'en')).toBe('Lofi');
    expect(meta('空间', 'en')).toBe('Space');
    expect(meta('空间', 'zh')).toBe('空间');
  });
});

describe('i18n — language detection', () => {
  it('prefers ?lang= over stored prefs and the browser language', () => {
    expect(detectLang({ search: '?lang=en', stored: 'zh', nav: 'zh-CN' })).toBe('en');
    expect(detectLang({ search: '?lang=zh', stored: 'en', nav: 'en-US' })).toBe('zh');
  });

  it('falls back to stored, then browser language', () => {
    expect(detectLang({ search: '', stored: 'en', nav: 'zh-CN' })).toBe('en');
    expect(detectLang({ search: '', stored: null, nav: 'zh-Hans-CN' })).toBe('zh');
    expect(detectLang({ search: '', stored: null, nav: 'en-GB' })).toBe('en');
  });

  it('defaults to en for languages we do not translate, and ignores junk', () => {
    expect(detectLang({ search: '', stored: null, nav: 'de-DE' })).toBe('en');
    expect(detectLang({ search: '?lang=klingon', stored: 'nope', nav: 'fr' })).toBe('en');
    expect(detectLang({ search: '?lang=', stored: '   ', nav: '' })).toBe('en');
  });
});

describe('theme detection', () => {
  it('prefers ?theme= over stored prefs and the OS', () => {
    expect(detectTheme({ search: '?theme=light', stored: 'dark', prefersDark: true })).toBe('light');
    expect(detectTheme({ search: '?theme=dark', stored: 'light', prefersDark: false })).toBe('dark');
  });

  it('falls back to stored, then the OS preference', () => {
    expect(detectTheme({ search: '', stored: 'light', prefersDark: true })).toBe('light');
    expect(detectTheme({ search: '', stored: null, prefersDark: true })).toBe('dark');
    expect(detectTheme({ search: '', stored: null, prefersDark: false })).toBe('light');
  });

  it('ignores invalid values', () => {
    expect(detectTheme({ search: '?theme=neon', stored: 'sepia', prefersDark: true })).toBe('dark');
  });
});
