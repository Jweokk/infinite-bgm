import type { MusicEngine } from '../core/MusicEngine';
import { randomSeedValue } from '../core/MusicEngine';
import type { EngineErrorCode, StyleInfo } from '../core/types';
import { ParameterPanel } from './ParameterPanel';
import { Visualizer } from './Visualizer';
import { maybeMountDiagnostics, type DiagnosticsHandle } from './Diagnostics';
import { reportVisit, type VisitCounts } from './stats';
import {
  APP_NAME,
  detectLang,
  detectTheme,
  localizeStyles,
  meta,
  prefersDarkScheme,
  t,
} from '../i18n';
import type { Lang, Theme, UiKey } from '../i18n';

/**
 * Events that carry user *activation*. Chromium/Safari log "AudioContext was
 * not allowed to start" if the context is built on a plain touchstart, and for
 * touch the activation only lands on pointerup/touchend/click anyway.
 */
const WARM_EVENTS = ['pointerup', 'touchend', 'click', 'keydown'];

/** Engine error codes → UI strings (the engine itself carries no wording). */
const ERROR_KEYS: Record<string, UiKey> = {
  audioUnlockFailed: 'toast.audioUnlockFailed',
  audioInterrupted: 'toast.audioInterrupted',
  audioResumeFailed: 'toast.audioResumeFailed',
  noStyle: 'toast.noStyleRegistered',
  unknownStyle: 'toast.unknownStyle',
  styleUnavailable: 'toast.styleUnavailable',
  styleFallback: 'toast.styleFallback',
};

const TEMPLATE = `
<header>
  <div class="logo">🎧</div>
  <div class="title">
    <h1 data-i18n="app.title">无限背景音乐</h1>
    <p data-i18n="app.subtitle"></p>
  </div>
  <div class="controls">
    <button class="mini-btn" id="langBtn" type="button" aria-label=""
            data-i18n-title="lang.buttonTitle" data-i18n-aria="lang.buttonTitle"><span data-i18n="lang.buttonLabel">EN</span></button>
    <button class="mini-btn" id="themeBtn" type="button" aria-label="" data-i18n-title="theme.toDark"><span id="themeIcon">☾</span></button>
    <button class="mini-btn help-open" id="helpBtn" type="button" aria-label=""
            data-i18n-title="help.button" data-i18n-aria="help.button">？</button>
  </div>
</header>

<div class="styles" id="styleGrid" aria-label="风格选择（可左右滑动）"></div>

<div class="panel row-panel">
  <div class="field">
    <label class="field-label" for="presetSelect" data-i18n="field.preset"></label>
    <select class="ctl" id="presetSelect"></select>
  </div>
  <div class="field">
    <label class="field-label" for="purposeSelect" data-i18n="field.purpose"></label>
    <select class="ctl" id="purposeSelect"></select>
  </div>
</div>

<div class="viz-wrap" id="vizWrap">
  <canvas id="viz"></canvas>
  <div class="viz-empty" data-i18n="viz.empty"></div>
  <div class="viz-toolbar" id="vizToolbar">
    <button class="icon-btn viz-fs" id="fsBtn" type="button" title="" aria-label="" data-i18n-title="viz.fullscreen" data-i18n-aria="viz.fullscreen">⛶</button>
    <button class="icon-btn viz-fs" id="fsExitBtn" type="button" title="" aria-label="" hidden data-i18n-title="viz.exitFullscreen" data-i18n-aria="viz.exitFullscreen">✕</button>
  </div>
</div>

<div class="transport">
  <div class="side">
    <button class="icon-btn" id="seedBtn" type="button" title="" data-i18n-title="transport.newSeedTitle"><span class="ico">🎲</span><span class="txt" data-i18n="transport.newSeed"></span></button>
  </div>
  <button class="play-btn" id="playBtn" type="button" data-state="idle" aria-label="">
    <span class="label-play">▶</span><span class="label-pause">❚❚</span>
  </button>
  <div class="side right">
    <button class="icon-btn" id="nextBtn" type="button" title="" data-i18n-title="transport.nextTitle"><span class="ico">⏭</span><span class="txt" data-i18n="transport.next"></span></button>
  </div>
</div>

<div class="seed-row">
  <span class="seed-label" data-i18n="seed.label">SEED</span>
  <input class="seed-input" id="seedInput" inputmode="numeric" autocomplete="off" spellcheck="false" />
  <span class="section-chip" id="sectionChip"></span>
</div>

<div class="panel">
  <div class="panel-head">
    <h2 data-i18n="panel.params"></h2>
    <label class="switch">
      <input type="checkbox" id="advancedToggle" />
      <span class="track"></span>
      <span data-i18n="panel.advanced"></span>
    </label>
  </div>
  <div class="params" id="params"></div>
</div>

<footer>
  <div class="vol">
    <span>🔈</span>
    <input type="range" id="volume" min="0" max="1" step="0.01" value="0.8" />
  </div>
  <div class="chip" id="stateChip"><span class="dot"></span><span id="stateText" data-i18n="state.idle"></span></div>
  <span class="status-line" id="statusLine">--</span>
  <span class="stats-line" id="statsLine" hidden>👁</span>
</footer>

<div class="toasts" id="toasts"></div>

<div class="modal-backdrop" id="helpModal" hidden>
  <div class="panel modal" role="dialog" aria-modal="true" aria-labelledby="helpTitle">
    <div class="panel-head">
      <h2 id="helpTitle" data-i18n="help.title"></h2>
      <button class="icon-btn help-close" id="helpClose" type="button" aria-label="" data-i18n-aria="help.close">✕</button>
    </div>
    <div class="help-body">
      <h3 data-i18n="help.playback.h"></h3>
      <p data-i18n="help.playback.p1"></p>
      <p data-i18n="help.playback.p2"></p>
      <p data-i18n="help.playback.p3"></p>
      <h3 data-i18n="help.seed.h"></h3>
      <p data-i18n="help.seed.p"></p>
      <h3 data-i18n="help.purpose.h"></h3>
      <p data-i18n="help.purpose.p1"></p>
      <p data-i18n="help.purpose.p2"></p>
      <p data-i18n="help.purpose.p3"></p>
      <p data-i18n="help.purpose.p4"></p>
      <h3 data-i18n="help.length.h"></h3>
      <p data-i18n="help.length.p"></p>
      <h3 data-i18n="help.timing.h"></h3>
      <p data-i18n="help.timing.p1"></p>
      <p data-i18n="help.timing.p2"></p>
      <h3 data-i18n="help.visual.h"></h3>
      <p data-i18n="help.visual.p1"></p>
      <p data-i18n="help.visual.p2"></p>
      <h3 data-i18n="help.mobile.h"></h3>
      <p data-i18n="help.mobile.p"></p>
      <h3 data-i18n="help.nosound.h"></h3>
      <p data-i18n="help.nosound.p1"></p>
      <p data-i18n="help.nosound.p2"></p>
      <h3 data-i18n="help.count.h"></h3>
      <p data-i18n="help.count.p"></p>
    </div>
  </div>
</div>
`;

export class App {
  private engine: MusicEngine;
  private root: HTMLElement;
  private panel!: ParameterPanel;
  private visualizer!: Visualizer;
  /** All styles, as offered by the engine. */
  private styles: StyleInfo[] = [];
  /** The same styles with display strings in the active language. */
  private localized: StyleInfo[] = [];
  private lang: Lang;
  private theme: Theme;
  private counts: VisitCounts | null = null;
  private diag: DiagnosticsHandle | null = null;
  private fsIdleTimer: ReturnType<typeof setTimeout> | null = null;

  private els: Record<string, HTMLElement> = {};
  private wakeLock: any = null;
  private statusTimer: ReturnType<typeof setInterval> | null = null;
  private lastSection = '';
  /** Only one "queued" notice per transition, so rapid clicks stay quiet. */
  private queuedNoticeShown = false;
  private lastFocused: HTMLElement | null = null;
  /** Armed until the audio context really runs (see WARM_EVENTS). */
  private warmHandler: (() => void) | null = null;

  constructor(engine: MusicEngine, mount: HTMLElement, prefs: { lang?: Lang; theme?: Theme } = {}) {
    this.engine = engine;
    this.root = mount;
    // Style list comes from the registry; every plugin is registered before the
    // App is constructed (see main.ts), so reading it once here is enough.
    this.styles = engine.getAvailableStyles();
    const stored = this.readPrefs();
    this.lang = prefs.lang ?? detectLang({ stored: stored.lang });
    this.theme = prefs.theme ?? detectTheme({ stored: stored.theme, prefersDark: prefersDarkScheme() });
    this.localized = localizeStyles(this.styles, this.lang);
    this.applyTheme(this.theme, true);
    this.render();
    this.bindEngine();
    this.applyLanguage();
    this.diag = maybeMountDiagnostics(this.engine, document.body, this.lang);
    void this.loadStats();
  }

  private $(id: string): HTMLElement {
    return this.root.querySelector(`#${id}`) as HTMLElement;
  }

  private readPrefs(): { style?: string; seed?: string; volume?: number; lang?: string; theme?: string } {
    try {
      const raw = localStorage.getItem('pme:prefs');
      return raw ? JSON.parse(raw) : {};
    } catch {
      return {};
    }
  }

  // -------------------------------------------------------------------------
  // Language & theme
  // -------------------------------------------------------------------------

  /** Fill every `data-i18n*` node from the catalog for the active language. */
  private applyLanguage(): void {
    for (const el of Array.from(this.root.querySelectorAll<HTMLElement>('[data-i18n]'))) {
      el.textContent = t(this.lang, el.dataset.i18n as UiKey);
    }
    for (const el of Array.from(this.root.querySelectorAll<HTMLElement>('[data-i18n-title]'))) {
      el.title = t(this.lang, el.dataset.i18nTitle as UiKey);
    }
    for (const el of Array.from(this.root.querySelectorAll<HTMLElement>('[data-i18n-aria]'))) {
      el.setAttribute('aria-label', t(this.lang, el.dataset.i18nAria as UiKey));
    }
    this.els.styleGrid.setAttribute('aria-label', t(this.lang, 'styles.aria'));
    document.documentElement.lang = this.lang === 'zh' ? 'zh-CN' : 'en';
    document.title = t(this.lang, 'app.docTitle');

    // Everything derived from plugin metadata has to be re-rendered.
    this.localized = localizeStyles(this.styles, this.lang);
    this.panel.setScopeTitles(t(this.lang, 'scope.instant'), t(this.lang, 'scope.gradual'));
    this.diag?.setLang(this.lang);
    this.buildStyleCards();
    this.onStyleChanged();
    this.onState(this.engine.getState().status);
    this.renderStats();
    this.applyTheme(this.theme, true);
  }

  private applyTheme(theme: Theme, quiet = false): void {
    this.theme = theme;
    document.documentElement.dataset.theme = theme;
    document
      .querySelector('meta[name="theme-color"]')
      ?.setAttribute('content', theme === 'dark' ? '#0b0e14' : '#f4f1ea');
    const icon = this.$('themeIcon');
    if (icon) icon.textContent = theme === 'dark' ? '☀' : '☾';
    const btn = this.$('themeBtn');
    if (btn) {
      const key: UiKey = theme === 'dark' ? 'theme.toLight' : 'theme.toDark';
      btn.title = t(this.lang, key);
      btn.setAttribute('aria-label', t(this.lang, key));
    }
    this.visualizer?.refreshPalette();
    if (!quiet) this.persist();
  }

  /** Follow the OS only while the visitor has not chosen explicitly. */
  private watchSystemTheme(): void {
    try {
      if (typeof matchMedia !== 'function') return;
      const mq = matchMedia('(prefers-color-scheme: dark)');
      mq.addEventListener?.('change', (e) => {
        if (this.readPrefs().theme) return; // explicit choice wins
        this.applyTheme(e.matches ? 'dark' : 'light', true);
      });
    } catch {
      /* not supported */
    }
  }

  private toggleLang(): void {
    this.lang = this.lang === 'zh' ? 'en' : 'zh';
    this.applyLanguage();
    this.persist();
  }

  private toggleTheme(): void {
    this.applyTheme(this.theme === 'dark' ? 'light' : 'dark');
  }

  // -------------------------------------------------------------------------
  // Visit counter (optional backend; degrades to hidden)
  // -------------------------------------------------------------------------

  private async loadStats(): Promise<void> {
    this.counts = await reportVisit({ lang: this.lang, theme: this.theme });
    this.renderStats();
  }

  private renderStats(): void {
    const el = this.$('statsLine');
    if (!el) return;
    if (!this.counts) {
      el.hidden = true;
      return;
    }
    el.hidden = false;
    el.textContent = `👁 ${t(this.lang, 'stats.views', {
      views: this.counts.views.toLocaleString(),
      visitors: this.counts.visitors.toLocaleString(),
    })}`;
    el.title = t(this.lang, 'stats.today', { today: this.counts.today.toLocaleString() });
  }

  private render(): void {
    this.root.innerHTML = TEMPLATE;
    this.els = {
      stateChip: this.$('stateChip'),
      stateText: this.$('stateText'),
      styleGrid: this.$('styleGrid'),
      vizWrap: this.$('vizWrap'),
      playBtn: this.$('playBtn'),
      seedBtn: this.$('seedBtn'),
      nextBtn: this.$('nextBtn'),
      seedInput: this.$('seedInput') as HTMLInputElement,
      sectionChip: this.$('sectionChip'),
      presetSelect: this.$('presetSelect'),
      purposeSelect: this.$('purposeSelect'),
      advancedToggle: this.$('advancedToggle'),
      params: this.$('params'),
      volume: this.$('volume') as HTMLInputElement,
      statusLine: this.$('statusLine'),
      statsLine: this.$('statsLine'),
      toasts: this.$('toasts'),
      helpModal: this.$('helpModal'),
      themeBtn: this.$('themeBtn'),
      langBtn: this.$('langBtn'),
    };

    this.panel = new ParameterPanel(this.els.params, this.engine);
    this.visualizer = new Visualizer(this.$('viz') as HTMLCanvasElement, this.engine);
    this.visualizer.refreshPalette();
    this.wireFullscreen();

    // Transport
    (this.els.playBtn as HTMLButtonElement).addEventListener('click', () => void this.togglePlay());
    this.els.seedBtn.addEventListener('click', () => this.engine.setSeed(randomSeedValue()));
    this.els.nextBtn.addEventListener('click', () => this.engine.next());
    (this.els.seedInput as HTMLInputElement).addEventListener('change', (e) => {
      const v = (e.target as HTMLInputElement).value.trim();
      if (v) this.engine.setSeed(v);
    });
    this.els.volume.addEventListener('input', (e) => {
      this.engine.setMasterVolume(Number((e.target as HTMLInputElement).value));
    });
    (this.els.presetSelect as HTMLSelectElement).addEventListener('change', (e) => {
      const id = (e.target as HTMLSelectElement).value;
      if (id) this.engine.applyPreset(id);
    });
    (this.els.purposeSelect as HTMLSelectElement).addEventListener('change', (e) => {
      const v = (e.target as HTMLSelectElement).value;
      if (v) this.engine.setParameter('sessionPurpose', v);
    });
    (this.els.advancedToggle as HTMLInputElement).addEventListener('change', (e) => {
      this.panel.setShowAdvanced((e.target as HTMLInputElement).checked);
    });

    // Language & theme
    this.els.langBtn.addEventListener('click', () => this.toggleLang());
    this.els.themeBtn.addEventListener('click', () => this.toggleTheme());
    this.watchSystemTheme();

    // Keyboard (desktop nicety)
    window.addEventListener('keydown', (e) => {
      const inModal = !this.els.helpModal.hidden;
      if (e.code === 'Space' && !inModal && !(e.target as HTMLElement)?.matches?.('input, select, textarea')) {
        e.preventDefault();
        void this.togglePlay();
      }
      if (e.code === 'Escape') {
        if (inModal) this.closeHelp();
        if (this.isFullscreenActive()) void this.toggleFullscreen(false);
      }
      if (e.code === 'KeyF' && !inModal && !(e.target as HTMLElement)?.matches?.('input, select, textarea')) {
        void this.toggleFullscreen();
      }
    });

    // Help modal (focus is trapped inside while it is open)
    this.$('helpBtn').addEventListener('click', () => this.openHelp());
    this.$('helpClose').addEventListener('click', () => this.closeHelp());
    this.$('helpModal').addEventListener('click', (e) => {
      if (e.target === this.els.helpModal) this.closeHelp();
    });
    this.els.helpModal.addEventListener('keydown', (e) => this.trapModalFocus(e as KeyboardEvent));

    // Mobile browsers suspend the AudioContext in the background. Re-arm the
    // wake lock too — the browser drops it whenever the page is hidden.
    document.addEventListener('visibilitychange', () => {
      void this.engine.handleVisibility(!document.hidden);
      if (!document.hidden) void this.updateWakeLock(this.engine.getState().status);
    });

    // Unlock the audio context on the very first interaction anywhere (not just
    // on ▶): iOS binds the unlock to that activation, and this way a later ▶ tap
    // can never be the one the browser refuses. Stays armed until the context is
    // genuinely running — a touchstart alone is not enough on iOS.
    const warm = (): void => {
      this.engine.warmAudio();
      if (this.engine.isAudioRunning()) this.unbindWarm(warm);
    };
    this.warmHandler = warm;
    for (const kind of WARM_EVENTS) document.addEventListener(kind, warm, { passive: true });

    this.buildStyleCards();
    this.syncUI();
    this.visualizer.start();

    this.statusTimer = setInterval(() => this.updateStatus(), 400);
  }

  private async togglePlay(): Promise<void> {
    const status = this.engine.getState().status;
    try {
      if (status === 'playing') this.engine.pause();
      else if (status === 'paused') await this.engine.resume();
      else await this.engine.start();
    } catch (err) {
      this.toastError(err);
    }
  }

  /** Localize an engine error: prefer its machine code, fall back to text. */
  private toastError(err: unknown): void {
    const e = err as { code?: EngineErrorCode; params?: Record<string, string>; message?: string };
    const key = e.code ? ERROR_KEYS[e.code] : undefined;
    if (key) this.toast(t(this.lang, key, e.params));
    else this.toast(String(e.message ?? err));
  }

  private buildStyleCards(): void {
    const grid = this.els.styleGrid;
    if (!grid) return;
    grid.innerHTML = '';
    for (const info of this.localized) {
      const btn = document.createElement('button');
      btn.className = 'style-card';
      btn.dataset.styleId = info.id;
      btn.innerHTML = `
        <div class="name">${info.name}<span class="mode">${info.timeMode}</span></div>
        <p class="desc">${info.description}</p>`;
      btn.addEventListener('click', () => {
        try {
          this.engine.useStyle(info.id);
        } catch (err) {
          this.toastError(err);
        }
      });
      grid.appendChild(btn);
    }
  }

  private bindEngine(): void {
    const bus = this.engine.eventBus;
    bus.on('state', ({ status }) => this.onState(status));
    bus.on('style', () => this.onStyleChanged());
    bus.on('seed', ({ seed, pending }) => {
      (this.els.seedInput as HTMLInputElement).value = seed;
      if (pending) this.noticeQueued(t(this.lang, 'toast.seedQueued', { seed }));
      else this.persist();
    });
    bus.on('style-pending', ({ styleId }) => {
      const name = this.localized.find((s) => s.id === styleId)?.name ?? styleId;
      this.noticeQueued(t(this.lang, 'toast.styleQueued', { name }));
    });
    bus.on('preset', () => {
      this.panel.refreshValues();
      const purposeSel = this.els.purposeSelect as HTMLSelectElement;
      const v = this.engine.getParameters().sessionPurpose;
      if (v !== undefined && purposeSel.value !== String(v)) purposeSel.value = String(v);
    });
    bus.on('parameter', () => this.persist());
    bus.on('error', ({ scope, message, code, params }) => {
      const key = code ? ERROR_KEYS[code] : undefined;
      if (!key) {
        this.toast(`${scope}: ${message}`);
        return;
      }
      const localizedParams = params
        ? { ...params, ...(params.name ? { name: meta(params.name, this.lang) } : {}) }
        : undefined;
      this.toast(t(this.lang, key, localizedParams));
    });
    bus.on('note', ({ event }) => {
      const section = event.metadata?.section;
      if (section && section !== this.lastSection) {
        this.lastSection = section;
        this.els.sectionChip.textContent = section;
      }
    });
    bus.on('transition', ({ phase }) => {
      (this.els.playBtn as HTMLButtonElement).disabled = phase === 'begin';
      if (phase === 'begin' || phase === 'end') this.queuedNoticeShown = false;
    });
  }

  /** One "queued" toast per transition, so a burst of clicks stays quiet. */
  private noticeQueued(message: string): void {
    if (this.queuedNoticeShown) return;
    this.queuedNoticeShown = true;
    this.toast(message);
  }

  private onState(status: string): void {
    if (!this.els.stateChip) return;
    const chip = this.els.stateChip;
    chip.classList.toggle('playing', status === 'playing');
    chip.classList.toggle('paused', status === 'paused');
    this.els.stateText.textContent =
      status === 'playing'
        ? t(this.lang, 'state.playing')
        : status === 'paused'
          ? t(this.lang, 'state.paused')
          : t(this.lang, 'state.idle');
    const playBtn = this.els.playBtn as HTMLButtonElement;
    playBtn.dataset.state = status;
    const label = status === 'playing' ? t(this.lang, 'aria.pause') : t(this.lang, 'aria.play');
    playBtn.setAttribute('aria-label', label);
    playBtn.title = label;
    this.els.vizWrap.classList.toggle('live', status === 'playing');
    this.updateMediaSession(status);
    void this.updateWakeLock(status);
    this.updateStatus();
  }

  private onStyleChanged(): void {
    const state = this.engine.getState();
    // Accent color follows the style plugin's metadata.
    const info = this.localized.find((s) => s.id === state.styleId);
    if (info) {
      document.documentElement.style.setProperty('--accent', info.color);
      const m = info.color.replace('#', '');
      if (m.length === 6) {
        const r = parseInt(m.slice(0, 2), 16);
        const g = parseInt(m.slice(2, 4), 16);
        const b = parseInt(m.slice(4, 6), 16);
        document.documentElement.style.setProperty('--accent-soft', `rgba(${r},${g},${b},0.16)`);
      }
      this.visualizer.setAccent(info.color);
    }
    // Rebuild preset/purpose selects + parameter panel from plugin metadata.
    const select = this.els.presetSelect as HTMLSelectElement;
    select.innerHTML = '';
    const purposeSel = this.els.purposeSelect as HTMLSelectElement;
    purposeSel.innerHTML = '';
    if (info) {
      for (const preset of info.presets) {
        const o = document.createElement('option');
        o.value = preset.id;
        o.textContent = preset.name;
        select.appendChild(o);
      }
      const purposeDef = info.parameters.find((d) => d.id === 'sessionPurpose');
      if (purposeDef?.options) {
        for (const opt of purposeDef.options) {
          const o = document.createElement('option');
          o.value = opt.value;
          o.textContent = opt.label;
          purposeSel.appendChild(o);
        }
        purposeSel.value = String(this.engine.getParameters().sessionPurpose ?? purposeDef.default);
      }
      this.panel.setDefinitions(info.parameters);
    }
    this.lastSection = '';
    this.els.sectionChip.textContent = '';
    for (const card of Array.from(this.els.styleGrid.children) as HTMLElement[]) {
      card.classList.toggle('active', card.dataset.styleId === state.styleId);
    }
    (this.els.seedInput as HTMLInputElement).value = state.seed;
    this.persist();
  }

  private syncUI(): void {
    const state = this.engine.getState();
    (this.els.seedInput as HTMLInputElement).value = state.seed;
    (this.els.volume as HTMLInputElement).value = String(state.masterVolume);
    this.onState(state.status);
    if (state.styleId) this.onStyleChanged();
  }

  private updateStatus(): void {
    const s = this.engine.getState();
    const mm = Math.floor(s.position / 60)
      .toString()
      .padStart(2, '0');
    const ss = Math.floor(s.position % 60)
      .toString()
      .padStart(2, '0');
    const styleName = this.localized.find((x) => x.id === s.styleId)?.name ?? '--';
    this.els.statusLine.textContent = `${styleName} · ${mm}:${ss}`;
  }

  private updateMediaSession(status: string): void {
    if (!('mediaSession' in navigator)) return;
    const state = this.engine.getState();
    const info = this.localized.find((s) => s.id === state.styleId);
    try {
      navigator.mediaSession.metadata = new MediaMetadata({
        title: info ? `${info.name} · seed ${state.seed}` : APP_NAME[this.lang],
        artist: APP_NAME[this.lang],
        album: 'Generative',
      });
      navigator.mediaSession.playbackState = status === 'playing' ? 'playing' : 'paused';
      navigator.mediaSession.setActionHandler('play', () => {
        void (async () => {
          const st = this.engine.getState().status;
          if (st === 'paused') await this.engine.resume();
          else if (st === 'idle') await this.engine.start();
        })();
      });
      navigator.mediaSession.setActionHandler('pause', () => this.engine.pause());
      navigator.mediaSession.setActionHandler('nexttrack', () => this.engine.next());
    } catch {
      /* not supported */
    }
  }

  private async updateWakeLock(status: string): Promise<void> {
    try {
      if (status === 'playing' && 'wakeLock' in navigator && !this.wakeLock) {
        this.wakeLock = await (navigator as any).wakeLock.request('screen');
        this.wakeLock.addEventListener?.('release', () => (this.wakeLock = null));
      } else if (status !== 'playing' && this.wakeLock) {
        await this.wakeLock.release();
        this.wakeLock = null;
      }
    } catch {
      this.wakeLock = null;
    }
  }

  // -- visual scenes & fullscreen ------------------------------------------

  private isFullscreenActive(): boolean {
    const wrap = this.els.vizWrap;
    return Boolean(
      document.fullscreenElement ||
        (document as any).webkitFullscreenElement ||
        wrap.classList.contains('pseudo-fullscreen'),
    );
  }

  private async toggleFullscreen(on?: boolean): Promise<void> {
    const wrap = this.els.vizWrap as any;
    const target = on ?? !this.isFullscreenActive();
    if (target) {
      try {
        if (wrap.requestFullscreen) await wrap.requestFullscreen();
        else if (wrap.webkitRequestFullscreen) wrap.webkitRequestFullscreen();
        else throw new Error('fullscreen unsupported');
      } catch {
        // iOS Safari & co: fixed overlay pseudo-fullscreen.
        wrap.classList.add('pseudo-fullscreen');
      }
    } else {
      try {
        if (document.fullscreenElement) await document.exitFullscreen();
        else if ((document as any).webkitFullscreenElement) (document as any).webkitExitFullscreen();
      } catch {
        /* ignore */
      }
      wrap.classList.remove('pseudo-fullscreen');
    }
    this.syncFullscreenUi();
    this.visualizer.resize();
  }

  private syncFullscreenUi(): void {
    const active = this.isFullscreenActive();
    (this.$('fsExitBtn') as HTMLButtonElement).hidden = !active;
    (this.$('fsBtn') as HTMLButtonElement).hidden = active;
    if (active) this.armIdleHide();
    else {
      this.els.vizWrap.classList.remove('viz-idle');
      if (this.fsIdleTimer) clearTimeout(this.fsIdleTimer);
    }
  }

  /** Hide the cursor + toolbar after 3s of stillness in fullscreen. */
  private armIdleHide(): void {
    if (this.fsIdleTimer) clearTimeout(this.fsIdleTimer);
    this.els.vizWrap.classList.remove('viz-idle');
    this.fsIdleTimer = setTimeout(() => {
      if (this.isFullscreenActive()) this.els.vizWrap.classList.add('viz-idle');
    }, 3000);
  }

  private wireFullscreen(): void {
    const wrap = this.els.vizWrap;
    this.$('fsBtn').addEventListener('click', () => void this.toggleFullscreen(true));
    this.$('fsExitBtn').addEventListener('click', () => void this.toggleFullscreen(false));
    wrap.addEventListener('dblclick', () => void this.toggleFullscreen());
    for (const kind of ['fullscreenchange', 'webkitfullscreenchange']) {
      document.addEventListener(kind, () => {
        this.syncFullscreenUi();
        this.visualizer.resize();
      });
    }
    for (const kind of ['mousemove', 'touchstart', 'keydown']) {
      wrap.addEventListener(kind, () => {
        if (this.isFullscreenActive()) this.armIdleHide();
      });
    }
  }

  private unbindWarm(handler: () => void): void {
    for (const kind of WARM_EVENTS) document.removeEventListener(kind, handler);
    if (this.warmHandler === handler) this.warmHandler = null;
  }

  private toast(message: string): void {
    const el = document.createElement('div');
    el.className = 'toast';
    el.textContent = message;
    this.els.toasts.appendChild(el);
    setTimeout(() => el.remove(), 4200);
  }

  private openHelp(): void {
    if (!this.els.helpModal.hidden) return;
    this.lastFocused = (document.activeElement as HTMLElement | null) ?? null;
    this.els.helpModal.hidden = false;
    this.$('helpClose').focus();
  }

  private closeHelp(): void {
    if (this.els.helpModal.hidden) return;
    this.els.helpModal.hidden = true;
    const back = this.lastFocused;
    this.lastFocused = null;
    if (back && document.contains(back)) back.focus();
    else this.$('helpBtn').focus();
  }

  /** Keep Tab (and shift-Tab) inside the help dialog while it is open. */
  private trapModalFocus(e: KeyboardEvent): void {
    if (e.key !== 'Tab') return;
    const modal = this.els.helpModal;
    const focusables = Array.from(
      modal.querySelectorAll<HTMLElement>(
        'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
      ),
    ).filter((el) => el.offsetParent !== null);
    if (!focusables.length) return;
    const first = focusables[0];
    const last = focusables[focusables.length - 1];
    const active = document.activeElement as HTMLElement | null;
    if (e.shiftKey && (active === first || !modal.contains(active))) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && active === last) {
      e.preventDefault();
      first.focus();
    }
  }

  /** Persist a small preference set (PRD §72: LocalStorage optional). */
  private persist(): void {
    try {
      const s = this.engine.getState();
      localStorage.setItem(
        'pme:prefs',
        JSON.stringify({
          style: s.styleId,
          seed: s.seed,
          volume: s.masterVolume,
          lang: this.lang,
          theme: this.theme,
        }),
      );
    } catch {
      /* private mode */
    }
  }

  dispose(): void {
    if (this.statusTimer) clearInterval(this.statusTimer);
    this.visualizer.stop();
    if (this.warmHandler) this.unbindWarm(this.warmHandler);
  }
}
