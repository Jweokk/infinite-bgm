import { AudioEngine } from './AudioEngine';
import { EventBus } from './EventBus';
import { ParameterManager } from './ParameterManager';
import { PluginRegistry } from './PluginRegistry';
import { Scheduler } from './Scheduler';
import { SeededRandom } from './SeededRandom';
import { StateManager } from './StateManager';
import { Transport } from './Transport';
import { EngineError } from './types';
import { declarePlaybackAudioSession, unlockIosAudioOutput } from './audioSession';
import type {
  EngineConfig,
  EngineState,
  FXPlugin,
  GenerationContext,
  InstrumentPlugin,
  MusicalEvent,
  StyleContext,
  StyleInfo,
  StyleInstance,
  StylePlugin,
} from './types';
import { InstrumentRegistry } from '../instruments/InstrumentRegistry';
import { FXRegistry } from '../fx/FXRegistry';
import { SpatialControllerImpl } from '../spatial/SpatialEngine';

export function randomSeedValue(): number {
  return 100000 + Math.floor(Math.random() * 900000);
}

/**
 * Core facade (PRD §45). Knows about plugins only through their interfaces —
 * no style-specific branches anywhere in this file.
 */
export class MusicEngine {
  readonly eventBus = new EventBus();
  private styles = new PluginRegistry();
  private instruments = new InstrumentRegistry();
  private fx = new FXRegistry();
  private spatial = new SpatialControllerImpl();
  private params = new ParameterManager();
  private transport = new Transport();
  private state: StateManager;
  private scheduler: Scheduler | null = null;
  private audio: AudioEngine | null = null;

  private stylePlugin: StylePlugin | null = null;
  private firstStyle: StylePlugin | null = null;
  private instance: StyleInstance | null = null;
  private styleRandom: SeededRandom | null = null;
  private seed: string;
  private generatedUntil = 0;
  private transitioning = false;
  /** Latest style/seed request made while a transition was already in flight. */
  private pendingTarget: { styleId?: string; seed?: string } | null = null;
  /** Target of the transition currently in flight (kept for cancel/merge). */
  private transitionTarget: { styleId?: string; seed?: string } | null = null;
  private transitionTimer: ReturnType<typeof setTimeout> | null = null;
  private stopTimer: ReturnType<typeof setTimeout> | null = null;
  private watchdog: ReturnType<typeof setInterval> | null = null;
  private watchdogMisses = 0;
  private warnedInstruments = new Set<string>();

  private cfg: EngineConfig & {
    lookAhead: number;
    scheduleInterval: number;
    generationHorizon: number;
    generationChunk: number;
  };

  constructor(config: EngineConfig = {}) {
    this.cfg = {
      // Must cover a whole throttled wake-up (≈1 s when the tab is hidden),
      // not just the 25 ms interval we ask for — see Scheduler.DEFAULT_LOOKAHEAD.
      lookAhead: 1.5,
      scheduleInterval: 25,
      // Short horizon keeps parameter tweaks audible within ~10–25s while
      // still generating comfortably ahead of the transport (PRD §40 intent).
      generationHorizon: 18,
      generationChunk: 9,
      ...config,
    };
    this.seed = String(config.seed ?? randomSeedValue());
    this.state = new StateManager((status) => this.eventBus.emit('state', { status }));
  }

  // -------------------------------------------------------------------------
  // Registration
  // -------------------------------------------------------------------------

  registerStyle(plugin: StylePlugin): void {
    this.styles.register(plugin);
    if (!this.firstStyle) this.firstStyle = plugin;
    if (!this.stylePlugin && this.cfg.style === plugin.id) {
      try {
        this.useStyle(plugin.id);
      } catch (err) {
        // A style whose dependencies are missing must not break module boot —
        // ensureStyleSelected() will pick a playable one.
        this.eventBus.emit('error', { scope: 'style', message: String(err) });
      }
    }
  }

  /**
   * Guarantees that a style is active, falling back to the first playable
   * style when the persisted id no longer exists (a style renamed/removed by a
   * later version must never leave the player with a dead ▶ button — the user
   * would otherwise have to clear site data to recover).
   */
  ensureStyleSelected(): string | null {
    if (this.stylePlugin) return this.stylePlugin.id;
    const candidates: StylePlugin[] = [];
    const preferred = this.cfg.style ? this.styles.get(this.cfg.style) : undefined;
    if (preferred) candidates.push(preferred);
    if (this.firstStyle) candidates.push(this.firstStyle);
    for (const plugin of this.styles.list()) {
      if (!candidates.includes(plugin)) candidates.push(plugin);
    }
    let chosen: StylePlugin | null = null;
    for (const candidate of candidates) {
      try {
        this.validateStyle(candidate.id);
        chosen = candidate;
        break;
      } catch {
        // Missing instruments/FX — try the next candidate.
      }
    }
    if (!chosen) return null;
    this.stylePlugin = chosen;
    this.params.init(chosen.id, chosen.parameters);
    this.eventBus.emit('style', { styleId: chosen.id });
    if (this.cfg.style && this.cfg.style !== chosen.id) {
      this.eventBus.emit('error', {
        scope: 'style',
        code: 'styleFallback',
        params: { saved: this.cfg.style, name: chosen.name },
        message: `保存的风格「${this.cfg.style}」不可用，已切换到 ${chosen.name}`,
      });
    }
    return chosen.id;
  }

  registerInstrument(plugin: InstrumentPlugin): void {
    this.instruments.register(plugin);
  }

  registerFX(plugin: FXPlugin): void {
    this.fx.register(plugin);
  }

  getAvailableStyles(): StyleInfo[] {
    return this.styles.infos();
  }

  // -------------------------------------------------------------------------
  // Transport / lifecycle
  // -------------------------------------------------------------------------

  async start(): Promise<void> {
    // A stop() may still be winding down; cancel it so ▶ always responds.
    // (Previously a press within the 200 ms wind-down was swallowed and the
    // player stayed idle until the button was pressed a second time.)
    if (this.stopTimer) {
      clearTimeout(this.stopTimer);
      this.stopTimer = null;
    }
    this.ensureAudio();
    if (!this.stylePlugin) this.ensureStyleSelected();
    if (!this.stylePlugin) throw new EngineError('No style registered', 'noStyle');
    // Still inside the user gesture: re-assert the audible output route every
    // time the user presses play (iOS may have left the session on the earpiece
    // after another app/tab, which shows up as "headphones work, speaker is
    // silent").
    unlockIosAudioOutput(this.audio!.ctx);
    // Never claim to be playing on a context the browser refused to unlock —
    // that is the "UI says playing but nothing is audible" trap on iOS.
    const running = await this.audio!.resume();
    if (!running) {
      this.state.set('idle');
      throw new EngineError(
        '浏览器未解锁音频输出，请再点一次 ▶（iPhone 请检查侧边静音开关）',
        'audioUnlockFailed',
      );
    }
    this.applyPendingTarget();

    if (!this.instance) this.instantiateStyle();
    const now = this.audio!.ctx.currentTime;
    if (!this.transport.isActive) this.transport.start(0, now + 0.02);
    // Undo a fade-out left behind by stop() (no-op on a fresh start).
    this.audio!.setFade(1, now + 0.02, 0.15);
    this.scheduler!.start();
    this.state.set('playing');
    this.startWatchdog();
  }

  pause(): void {
    if (this.state.status !== 'playing') return;
    this.cancelTransition(false);
    this.scheduler?.stop();
    this.stopWatchdog();
    const audio = this.audio;
    if (audio) {
      const now = audio.ctx.currentTime;
      audio.setFade(0, now + 0.01, 0.06);
      setTimeout(() => {
        // If the user hit resume in the meantime, keep running.
        if (this.state.status === 'paused' && this.audio) void this.audio.suspend();
      }, 140);
    }
    this.state.set('paused');
  }

  async resume(): Promise<void> {
    if (this.state.status !== 'paused') return;
    this.ensureAudio();
    unlockIosAudioOutput(this.audio!.ctx);
    const running = await this.audio!.resume();
    if (!running) {
      // Stay paused and say why instead of pretending to play.
      throw new EngineError(
        '浏览器未解锁音频输出，请再点一次 ▶（iPhone 请检查侧边静音开关）',
        'audioUnlockFailed',
      );
    }
    const now = this.audio!.ctx.currentTime;
    this.applyPendingTarget();
    this.audio!.setFade(1, now + 0.02, 0.15);
    this.scheduler?.start();
    this.state.set('playing');
    this.startWatchdog();
  }

  stop(): void {
    this.cancelTransition(true);
    this.scheduler?.stop();
    this.stopWatchdog();
    if (this.stopTimer) clearTimeout(this.stopTimer);
    const audio = this.audio;
    if (!audio) {
      this.teardownInstance();
      this.transport.reset();
      this.state.set('idle');
      return;
    }
    const now = audio.ctx.currentTime;
    audio.setFade(0, now + 0.01, 0.09);
    this.state.set('idle');
    this.stopTimer = setTimeout(() => {
      this.stopTimer = null;
      const a = this.audio;
      if (!a) return;
      const t = a.ctx.currentTime;
      this.instruments.stopAll(t + 0.01, 0.04);
      this.scheduler?.queue.clear();
      this.transport.reset();
      this.generatedUntil = 0;
      this.teardownInstance();
      a.setFade(1, t, 0.02);
      void a.suspend();
    }, 200);
  }

  /** Next track: fresh seed with a musical, click-free transition. */
  next(): void {
    this.setSeed(randomSeedValue());
  }

  setSeed(seed: number | string): void {
    const s = String(seed).trim();
    if (!s) return;
    if (this.state.status === 'playing') {
      if (this.transitioning) {
        // Don't drop the request — land on it when the running transition
        // reaches its boundary (latest request wins).
        this.queueTarget({ seed: s });
        this.eventBus.emit('seed', { seed: s, pending: true });
        return;
      }
      this.beginTransition({ seed: s });
      return;
    }
    this.seed = s;
    this.teardownInstance(); // fresh deterministic replay from t=0
    if (this.state.status === 'paused') this.generatedUntil = this.pausedPosition();
    this.eventBus.emit('seed', { seed: s });
  }

  useStyle(styleId: string): void {
    const plugin = this.validateStyle(styleId);
    if (this.state.status === 'playing') {
      if (this.transitioning) {
        this.queueTarget({ styleId });
        this.eventBus.emit('style-pending', { styleId });
        return;
      }
      this.beginTransition({ styleId });
      return;
    }
    this.stylePlugin = plugin;
    this.params.init(plugin.id, plugin.parameters);
    this.teardownInstance();
    if (this.state.status === 'paused') this.generatedUntil = this.pausedPosition();
    this.eventBus.emit('style', { styleId: plugin.id });
  }

  setParameter(name: string, value: number | string | boolean): void {
    if (!this.stylePlugin) return;
    this.params.set(this.stylePlugin.id, name, value);
    try {
      this.instance?.setParameter(name, value);
    } catch (err) {
      this.eventBus.emit('error', { scope: 'parameter', message: String(err) });
    }
    this.eventBus.emit('parameter', { styleId: this.stylePlugin.id, name, value });
  }

  getParameters(): Record<string, number | string | boolean> {
    if (!this.stylePlugin) return {};
    this.params.init(this.stylePlugin.id, this.stylePlugin.parameters);
    return this.params.getAll(this.stylePlugin.id);
  }

  applyPreset(presetId: string): void {
    if (!this.stylePlugin) return;
    const preset = this.stylePlugin.presets.find((p) => p.id === presetId);
    if (!preset) return;
    for (const [k, v] of Object.entries(preset.parameters)) this.setParameter(k, v);
    this.eventBus.emit('preset', { styleId: this.stylePlugin.id, presetId });
  }

  setMasterVolume(v: number): void {
    this.audio?.setMasterVolume(v);
  }

  getMasterVolume(): number {
    return this.audio?.getMasterVolume() ?? this.cfg.masterVolume ?? 0.8;
  }

  getState(): EngineState {
    const pos = this.audio && this.transport.isActive ? this.transport.positionAt(this.audio.ctx.currentTime) : 0;
    return {
      status: this.state.status,
      styleId: this.stylePlugin?.id ?? null,
      seed: this.seed,
      position: Math.max(0, pos),
      masterVolume: this.getMasterVolume(),
    };
  }

  getAnalyser(): AnalyserNode | null {
    return this.audio?.analyser ?? null;
  }

  /** Plain facts for the on-device ?diag panel (never used by the normal UI). */
  audioDiagnostics(): Record<string, number | string | boolean> {
    const audio = this.audio;
    let peak = 0;
    if (audio) {
      const data = new Uint8Array(audio.analyser.frequencyBinCount);
      audio.analyser.getByteFrequencyData(data);
      for (let i = 0; i < data.length; i++) if (data[i] > peak) peak = data[i];
    }
    return {
      contextCreated: Boolean(audio),
      ctxState: audio ? audio.ctx.state : 'none',
      sampleRate: audio ? audio.ctx.sampleRate : 0,
      clock: audio ? Number(audio.ctx.currentTime.toFixed(2)) : 0,
      analyserPeak: peak,
      masterVolume: Number(this.getMasterVolume().toFixed(3)),
      status: this.state.status,
      styleId: this.stylePlugin?.id ?? 'none',
      seed: this.seed,
    };
  }

  /**
   * Plays a short 440 Hz tone through the normal master chain and reports the
   * analyser peak measured while it sounds. Used by the ?diag self-test:
   * a non-zero peak with nothing audible means the graph is fine and the muting
   * happens further out — iOS ring/silent switch, Bluetooth route, system volume.
   */
  async testTone(seconds = 1.2): Promise<{ ran: boolean; graphPeak: number }> {
    this.ensureAudio();
    const audio = this.audio;
    if (!audio) return { ran: false, graphPeak: 0 };
    const ran = await audio.resume();
    if (!ran) return { ran: false, graphPeak: 0 };

    const ctx = audio.ctx;
    const t0 = ctx.currentTime + 0.03;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.value = 440;
    gain.gain.setValueAtTime(0.0001, t0);
    gain.gain.linearRampToValueAtTime(0.25, t0 + 0.03);
    gain.gain.setValueAtTime(0.25, t0 + Math.max(0.05, seconds - 0.15));
    gain.gain.linearRampToValueAtTime(0.0001, t0 + seconds);
    osc.connect(gain);
    gain.connect(audio.bus);
    osc.start(t0);
    osc.stop(t0 + seconds + 0.05);

    const analyser = audio.analyser;
    const data = new Uint8Array(analyser.frequencyBinCount);
    let peak = 0;
    const until = Date.now() + seconds * 1000;
    while (Date.now() < until) {
      analyser.getByteFrequencyData(data);
      for (let i = 0; i < data.length; i++) if (data[i] > peak) peak = data[i];
      await new Promise((resolve) => setTimeout(resolve, 60));
    }
    try {
      osc.disconnect();
      gain.disconnect();
    } catch {
      /* already detached */
    }
    return { ran: true, graphPeak: peak };
  }

  /** True when the audio clock is actually advancing (used by the warm-up). */
  isAudioRunning(): boolean {
    return this.audio?.isRunning() ?? false;
  }

  /**
   * The app calls this on the *first* user interaction anywhere (pointerdown /
   * touch / key), not just on ▶: iOS ties audio unlocking to the activation that
   * created the context, and warming up early removes any chance of the ▶ tap
   * being the one that gets swallowed. Never starts playback, never throws.
   */
  warmAudio(): void {
    try {
      this.ensureAudio();
      // Gesture-driven: kick iOS onto the audible media route (silent Web Audio
      // source + silent HTML5 element) while user activation is still fresh.
      unlockIosAudioOutput(this.audio?.ctx ?? null);
      void this.audio?.resume(600);
    } catch {
      /* the ▶ path reports real failures */
    }
  }

  /** Re-run the iOS route unlock on demand (used by the ?diag panel). */
  retryAudioRoute(): boolean {
    try {
      this.ensureAudio();
      const did = unlockIosAudioOutput(this.audio?.ctx ?? null);
      void this.audio?.resume(600);
      return did;
    } catch {
      return false;
    }
  }

  /**
   * Called by the app when the tab becomes visible again (mobile browsers).
   * iOS suspends the AudioContext in the background; a resume() outside a
   * gesture may be refused, and the honest answer then is "paused, tap ▶".
   */
  async handleVisibility(visible: boolean): Promise<void> {
    if (!visible || !this.audio || this.state.status !== 'playing') return;
    if (this.audio.isRunning()) {
      this.startWatchdog();
      return;
    }
    const ok = await this.audio.resume();
    if (ok) {
      this.scheduler?.start();
      this.startWatchdog();
      return;
    }
    this.state.set('paused');
    this.eventBus.emit('error', {
      scope: 'audio',
      code: 'audioResumeFailed',
      message: '回到前台后音频未恢复，点 ▶ 继续（iPhone 请检查侧边静音开关）',
    });
  }

  async dispose(): Promise<void> {
    this.cancelTransition(true);
    this.stop();
    if (this.transitionTimer) clearTimeout(this.transitionTimer);
    if (this.stopTimer) clearTimeout(this.stopTimer);
    this.teardownInstance();
    this.instruments.disposeAll();
    this.fx.disposeAll();
    await this.audio?.close();
    this.audio = null;
  }

  // -------------------------------------------------------------------------
  // Internals
  // -------------------------------------------------------------------------

  private pausedPosition(): number {
    if (this.audio && this.transport.isActive) return this.transport.positionAt(this.audio.ctx.currentTime);
    return 0;
  }

  /**
   * Watchdog: while the transport says "playing", the audio clock must actually
   * be running. iOS suspends the context on interruptions (phone call, Siri,
   * another app taking the audio route, lock screen) without telling the page,
   * which shows up as "the UI says 播放中 but there is no sound". Try to recover;
   * if that keeps failing, fall back to an honest paused state.
   */
  private startWatchdog(): void {
    if (this.watchdog !== null) return;
    this.watchdogMisses = 0;
    this.watchdog = setInterval(() => void this.watchdogTick(), 2000);
  }

  private stopWatchdog(): void {
    if (this.watchdog !== null) {
      clearInterval(this.watchdog);
      this.watchdog = null;
    }
    this.watchdogMisses = 0;
  }

  private async watchdogTick(): Promise<void> {
    if (this.state.status !== 'playing' || !this.audio) {
      this.stopWatchdog();
      return;
    }
    if (this.audio.isRunning()) {
      this.watchdogMisses = 0;
      return;
    }
    const recovered = await this.audio.resume(600);
    if (recovered) {
      this.watchdogMisses = 0;
      this.scheduler?.start();
      return;
    }
    this.watchdogMisses += 1;
    if (this.watchdogMisses >= 2) {
      this.stopWatchdog();
      this.scheduler?.stop();
      this.state.set('paused');
      this.eventBus.emit('error', {
        scope: 'audio',
        code: 'audioInterrupted',
        message: '音频被系统中断（来电 / 其他应用占用），点 ▶ 继续',
      });
    }
  }

  private ensureAudio(): void {
    if (this.audio) return;
    // iOS: Web Audio is muted by the ring/silent switch unless we declare a
    // playback session (Safari 16.4+). Do it before the graph exists.
    declarePlaybackAudioSession();
    const Ctor = (typeof window !== 'undefined'
      ? window.AudioContext || (window as any).webkitAudioContext
      : undefined) as typeof AudioContext | undefined;
    const ctx = this.cfg.audioContextFactory
      ? this.cfg.audioContextFactory()
      : new Ctor!(this.cfg.sampleRate ? { sampleRate: this.cfg.sampleRate } : undefined);
    this.audio = new AudioEngine(ctx, { masterVolume: this.cfg.masterVolume });
    this.audio.buildGraph(this.fx, this.instruments);
    this.spatial.bindFX(this.fx);
    this.scheduler = new Scheduler(
      {
        now: () => this.audio!.ctx.currentTime,
        audioTimeFor: (t) => this.transport.audioTimeFor(t),
        dispatch: (ev, at) => this.dispatch(ev, at),
        generate: () => this.generate(),
      },
      { lookahead: this.cfg.lookAhead, intervalMs: this.cfg.scheduleInterval },
    );
  }

  private validateStyle(styleId: string): StylePlugin {
    const plugin = this.styles.get(styleId);
    if (!plugin) throw new EngineError(`Unknown style "${styleId}"`, 'unknownStyle', { id: styleId });
    for (const id of plugin.requiredInstruments ?? []) {
      if (!this.instruments.has(id)) {
        throw new EngineError(
          `风格 ${plugin.name} 需要乐器 "${id}"，但它未被注册`,
          'styleUnavailable',
          { style: plugin.name, missing: id },
        );
      }
    }
    for (const id of plugin.requiredFX ?? []) {
      if (!this.fx.has(id)) {
        throw new EngineError(
          `风格 ${plugin.name} 需要效果器 "${id}"，但它未被注册`,
          'styleUnavailable',
          { style: plugin.name, missing: id },
        );
      }
    }
    return plugin;
  }

  private instantiateStyle(): void {
    if (!this.stylePlugin || !this.audio) return;
    const plugin = this.stylePlugin;
    this.params.init(plugin.id, plugin.parameters);
    const params = this.params.getAll(plugin.id);
    // Seed isolation per style + version (PRD §13/§60): adding a new style
    // plugin can never perturb another style's random streams.
    const seedStr = `${this.seed}|${plugin.id}|v${plugin.version}`;
    this.styleRandom = new SeededRandom(seedStr);
    try {
      this.instance = plugin.create({ seed: seedStr, parameters: params });
    } catch (err) {
      this.eventBus.emit('error', { scope: 'style-create', message: String(err) });
      this.instance = null;
      return;
    }
    const ctx: StyleContext = {
      audioContext: this.audio.ctx,
      random: this.styleRandom,
      instruments: { get: (id: string) => this.instruments.get(id) },
      fx: { get: (id: string) => this.fx.getHandle(id), has: (id: string) => this.fx.has(id) },
      spatial: this.spatial,
      eventBus: { emit: (kind, payload) => (this.eventBus as any).emit(kind, payload) },
    };
    try {
      this.instance.start(ctx);
    } catch (err) {
      this.eventBus.emit('error', { scope: 'style-start', message: String(err) });
      this.instance = null;
    }
  }

  private teardownInstance(): void {
    if (this.instance) {
      try {
        this.instance.stop();
      } catch (err) {
        this.eventBus.emit('error', { scope: 'style-stop', message: String(err) });
      }
    }
    this.instance = null;
    this.styleRandom = null;
    this.fx.resetAll();
    if (this.audio) this.instruments.stopAll(this.audio.ctx.currentTime + 0.01, 0.05);
    this.scheduler?.queue.clear();
  }

  private dispatch(ev: MusicalEvent, at: number): void {
    this.eventBus.emit('note', { event: ev });
    if (!ev.instrument) return;
    const audio = this.audio;
    if (!audio) return;
    let inst = this.instruments.get(ev.instrument);
    if (!inst && !this.warnedInstruments.has(ev.instrument)) {
      this.warnedInstruments.add(ev.instrument);
      // Fallback chain per PRD §58.
      inst = this.instruments.get('pluck') ?? this.instruments.get('electric-piano') ?? undefined;
    }
    if (!inst) return;
    // Data-driven sidechain duck + sympathetic excitation (PRD v1.1 §76.2/§76.7).
    const duckAmt = ev.parameters?.duck;
    if (typeof duckAmt === 'number' && duckAmt > 0) {
      audio.duck(at, Math.min(1, duckAmt));
    }
    const exciteBus = ev.parameters?.exciteBus;
    if (typeof exciteBus === 'string' && exciteBus) {
      audio.excite(exciteBus, at, Number(ev.parameters?.excite ?? 0.5));
    }
    try {
      inst.trigger(ev, at);
    } catch (err) {
      this.eventBus.emit('error', { scope: 'instrument', message: `${ev.instrument}: ${String(err)}` });
    }
  }

  private generate(): void {
    if (!this.audio || this.transitioning) return;
    if (this.state.status !== 'playing') return;
    if (!this.instance) this.instantiateStyle();
    if (!this.instance || !this.styleRandom) return;
    const pos = this.transport.isActive ? this.transport.positionAt(this.audio.ctx.currentTime) : 0;
    if (this.generatedUntil >= pos + this.cfg.generationHorizon) return;
    const from = this.generatedUntil;
    const to = Math.max(
      from + 0.001,
      Math.min(from + this.cfg.generationChunk, pos + this.cfg.generationHorizon + this.cfg.generationChunk),
    );
    let events: MusicalEvent[] = [];
    try {
      const ctx: GenerationContext = { random: this.styleRandom, from, to };
      events = this.instance.generateEvents(ctx) ?? [];
    } catch (err) {
      // Plugin errors must never take down the audio engine (PRD §58).
      this.eventBus.emit('error', { scope: 'generation', message: String(err) });
    }
    if (events.length > 5000) events = events.slice(0, 5000);
    this.scheduler?.queue.push(
      events.filter((e) => e && Number.isFinite(e.startTime) && e.startTime >= from - 1e-6),
    );
    this.generatedUntil = to;
  }

  // -------------------------------------------------------------------------
  // Graceful transitions (style switch / new seed while playing)
  // -------------------------------------------------------------------------

  private beginTransition(target: { styleId?: string; seed?: string }): void {
    if (!this.audio || !this.transport.isActive) return;
    if (target.styleId) this.validateStyle(target.styleId);

    const now = this.audio.ctx.currentTime;
    const pos = this.transport.positionAt(now);
    const boundaryRaw = this.instance?.nextBoundary?.(pos) ?? null;
    const boundary = Math.min(Math.max(boundaryRaw ?? pos + 1.0, pos + 0.6), pos + 4.0);
    const audioBoundary = this.transport.audioTimeFor(boundary);

    this.transitioning = true;
    this.transitionTarget = target;
    this.eventBus.emit('transition', { phase: 'begin' });
    // Ring out what is already sounding, dropping not-yet-dispatched events.
    this.scheduler?.queue.clearFrom(boundary - 0.3);
    this.audio.setFade(0, Math.max(now + 0.03, audioBoundary - 0.9), 0.8);

    const waitMs = Math.max(0, (audioBoundary - now) * 1000 - 25);
    this.transitionTimer = setTimeout(() => {
      this.transitionTimer = null;
      const a = this.audio;
      if (!a) {
        this.transitioning = false;
        this.transitionTarget = null;
        return;
      }
      const n2 = a.ctx.currentTime;
      // Anything requested while this transition was in flight lands here too,
      // so a rapid style/seed change is never silently discarded.
      const effective: { styleId?: string; seed?: string } = {
        ...target,
        ...(this.pendingTarget ?? {}),
      };
      this.pendingTarget = null;
      this.transitionTarget = null;
      this.instruments.stopAll(n2 + 0.02, 0.05);
      this.scheduler?.queue.clear();
      this.teardownInstance();
      if (effective.styleId) {
        this.stylePlugin = this.validateStyle(effective.styleId);
        this.params.init(this.stylePlugin.id, this.stylePlugin.parameters);
        this.eventBus.emit('style', { styleId: this.stylePlugin.id });
      }
      if (effective.seed !== undefined) {
        this.seed = effective.seed;
        this.eventBus.emit('seed', { seed: this.seed });
      }
      this.generatedUntil = this.transport.isActive ? this.transport.positionAt(n2) : 0;
      this.instantiateStyle();
      a.setFade(1, n2 + 0.06, 1.1);
      this.transitioning = false;
      this.eventBus.emit('transition', { phase: 'end' });
      this.scheduler?.start();
      this.state.set('playing');
    }, waitMs);
  }

  /** Remember a request made mid-transition (latest value per field wins). */
  private queueTarget(target: { styleId?: string; seed?: string }): void {
    this.pendingTarget = { ...(this.pendingTarget ?? {}), ...target };
  }

  /**
   * Applies a request that was queued while a transition was in flight but
   * never landed (pause/stop interrupted it). Called from start()/resume() so
   * the intent survives instead of being thrown away.
   */
  private applyPendingTarget(): void {
    const target = this.pendingTarget;
    if (!target) return;
    this.pendingTarget = null;
    if (target.styleId) {
      this.stylePlugin = this.validateStyle(target.styleId);
      this.params.init(this.stylePlugin.id, this.stylePlugin.parameters);
      this.eventBus.emit('style', { styleId: this.stylePlugin.id });
    }
    if (target.seed !== undefined) {
      this.seed = target.seed;
      this.eventBus.emit('seed', { seed: this.seed });
    }
    this.teardownInstance();
    if (this.state.status === 'paused') this.generatedUntil = this.pausedPosition();
  }

  private cancelTransition(immediate: boolean): void {
    if (!this.transitioning) return;
    if (this.transitionTimer) clearTimeout(this.transitionTimer);
    this.transitionTimer = null;
    this.transitioning = false;
    // Don't lose what the interrupted transition was heading towards.
    if (this.transitionTarget) {
      this.pendingTarget = { ...this.transitionTarget, ...(this.pendingTarget ?? {}) };
      this.transitionTarget = null;
    }
    if (immediate && this.audio) {
      const now = this.audio.ctx.currentTime;
      this.instruments.stopAll(now + 0.01, 0.05);
      this.teardownInstance();
      this.eventBus.emit('transition', { phase: 'end' });
    }
  }
}
