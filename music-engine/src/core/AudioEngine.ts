// eslint-disable-next-line @typescript-eslint/no-unused-vars
import type { InstrumentPlugin } from './types';
import type { InstrumentRegistry } from '../instruments/InstrumentRegistry';
import type { FXRegistry } from '../fx/FXRegistry';

/**
 * Owns the AudioContext, the shared noise buffer and the master FX chain
 * (PRD §56): instruments → EQ → saturation → tape → delay → stereo → reverb
 * (+ shimmer parallel) → compressor → limiter → fade → volume → analyser.
 *
 * The chain is assembled from whatever FX plugins are registered; missing ids
 * are bypassed, so Core still knows nothing about concrete styles.
 */
export class AudioEngine {
  readonly ctx: AudioContext;
  readonly bus: GainNode;
  private fadeGain: GainNode;
  private volumeGain: GainNode;
  readonly analyser: AnalyserNode;
  readonly noiseBuffer: AudioBuffer;
  private fxChainHead: AudioNode | null = null;
  private masterVolume: number;
  /** Sidechain duck bus (v1.1 §76.2): duckable instruments route through here. */
  readonly duckGain: GainNode;
  /** Per-instrument bus gains, addressable for sympathetic excitation (§76.7). */
  private instrumentBuses = new Map<string, GainNode>();

  constructor(ctx: AudioContext, opts: { masterVolume?: number } = {}) {
    this.ctx = ctx;
    this.masterVolume = opts.masterVolume ?? 0.8;

    this.bus = ctx.createGain();
    this.fadeGain = ctx.createGain();
    this.duckGain = ctx.createGain();
    this.volumeGain = ctx.createGain();
    this.volumeGain.gain.value = this.masterVolume;
    this.analyser = ctx.createAnalyser();
    this.analyser.fftSize = 2048;
    this.analyser.smoothingTimeConstant = 0.82;

    // Fallback wiring in case no FX plugins are registered at all.
    this.bus.connect(this.fadeGain);
    this.fadeGain.connect(this.volumeGain);
    this.volumeGain.connect(this.analyser);
    this.analyser.connect(ctx.destination);
    this.fxChainHead = this.fadeGain;

    this.noiseBuffer = this.createNoiseBuffer(2);
  }

  private createNoiseBuffer(seconds: number): AudioBuffer {
    const len = Math.floor(this.ctx.sampleRate * seconds);
    const buf = this.ctx.createBuffer(2, len, this.ctx.sampleRate);
    for (let ch = 0; ch < 2; ch++) {
      const data = buf.getChannelData(ch);
      for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
    }
    return buf;
  }

  /**
   * Build the master chain + instantiate instruments/FX from the registries.
   * Must be called once all plugins are registered.
   */
  buildGraph(fx: FXRegistry, instruments: InstrumentRegistry): void {
    const ctx = this.ctx;

    // Disconnect the fallback wiring so the real chain can take over.
    try {
      this.bus.disconnect();
    } catch {
      /* ignore */
    }

    fx.instantiateAll(() => ({ audioContext: ctx, noiseBuffer: this.noiseBuffer }));

    const serialOrder = ['eq', 'saturation', 'tape', 'delay', 'stereo', 'reverb', 'compressor', 'limiter'];
    const present = serialOrder.filter((id) => fx.get(id));

    let head: AudioNode = this.bus;
    let inputOfCompressor: AudioNode | null = null;
    this.fxChainHead = null;

    for (const id of present) {
      const node = fx.get(id)!;
      if (!this.fxChainHead) this.fxChainHead = node.input;
      head.connect(node.input);
      if (id === 'compressor') inputOfCompressor = node.input;
      head = node.output;
    }

    // Shimmer runs parallel: reverb output → shimmer → compressor input.
    const shimmer = fx.get('shimmer');
    const reverb = fx.get('reverb');
    if (shimmer && reverb) {
      const target = inputOfCompressor ?? head;
      reverb.output.connect(shimmer.input);
      shimmer.output.connect(target);
    }

    // Vinyl injects its noise directly into the chain head.
    const vinyl = fx.get('vinyl');
    if (vinyl && this.fxChainHead) vinyl.output.connect(this.fxChainHead);

    head.connect(this.fadeGain);

    // Instruments: one gain bus each, feeding the chain head; instruments
    // flagged `duck` route through the sidechain duck bus instead (§76.2).
    const dest = this.fxChainHead ?? this.fadeGain;
    this.duckGain.connect(dest);
    instruments.instantiateAll((id) => {
      const gain = ctx.createGain();
      const duckable = instruments.pluginsMap.get(id)?.duck === true;
      gain.connect(duckable ? this.duckGain : dest);
      this.instrumentBuses.set(id, gain);
      return { audioContext: ctx, output: gain, noiseBuffer: this.noiseBuffer };
    });
  }

  /**
   * Sidechain dip on the duck bus, scheduled at an exact audio time (§76.2).
   * `depth` 0..1, quick attack, musical release.
   */
  duck(at: number, depth: number, release = 0.1): void {
    const g = this.duckGain.gain;
    const d = Math.min(0.85, Math.max(0, depth));
    g.cancelScheduledValues(at);
    g.setValueAtTime(Math.max(0.0001, g.value), at);
    g.linearRampToValueAtTime(1 - d, at + 0.012);
    g.setTargetAtTime(1, at + 0.02, Math.max(0.02, release / 3));
  }

  /**
   * Sympathetic excitation (§76.7): breathe an instrument bus briefly —
   * e.g. a bell strike lighting up the drone.
   */
  excite(instrumentId: string, at: number, amount: number): void {
    const bus = this.instrumentBuses.get(instrumentId);
    if (!bus) return;
    const g = bus.gain;
    const a = Math.min(1, Math.max(0, amount));
    g.cancelScheduledValues(at);
    g.setValueAtTime(Math.max(0.0001, g.value), at);
    g.linearRampToValueAtTime(1 + a * 0.4, at + 0.18);
    g.setTargetAtTime(1, at + 0.25, 1.4);
  }

  setMasterVolume(v: number): void {
    this.masterVolume = v;
    const t = this.ctx.currentTime;
    this.volumeGain.gain.cancelScheduledValues(t);
    this.volumeGain.gain.setTargetAtTime(Math.max(0.0001, v), t, 0.03);
  }

  getMasterVolume(): number {
    return this.masterVolume;
  }

  /**
   * Smooth fade to `target` starting at audio time `at` with time constant
   * ramp/3. Uses setTargetAtTime so it composes safely with in-flight ramps.
   */
  setFade(target: number, at: number, ramp: number): void {
    const g = this.fadeGain.gain;
    g.cancelScheduledValues(at);
    g.setTargetAtTime(Math.max(0.0001, target), at, Math.max(0.01, ramp / 3));
  }

  /** Read the live context state (kept behind a call so TS doesn't narrow it). */
  private ctxState(): AudioContextState {
    return this.ctx.state;
  }

  isRunning(): boolean {
    return this.ctxState() === 'running';
  }

  /**
   * Unlock the audio clock and report whether it actually started running.
   *
   * Browsers refuse `resume()` without a user gesture (iOS especially), and a
   * refused call can leave the returned promise pending forever. Callers must
   * therefore never assume success — a "playing" UI on a suspended context is
   * exactly the "everything looks right but there is no sound" bug.
   */
  async resume(timeoutMs = 1500): Promise<boolean> {
    if (this.ctxState() === 'running') return true;
    try {
      await Promise.race([
        this.ctx.resume().catch((err) => {
          console.warn('[AudioEngine] resume rejected (needs user gesture?)', err);
        }),
        new Promise((resolve) => setTimeout(resolve, timeoutMs)),
      ]);
    } catch (err) {
      console.warn('[AudioEngine] resume failed', err);
    }
    return this.ctxState() === 'running';
  }

  async suspend(): Promise<void> {
    if (this.ctx.state === 'running') {
      try {
        await this.ctx.suspend();
      } catch (err) {
        console.warn('[AudioEngine] suspend failed', err);
      }
    }
  }

  async close(): Promise<void> {
    try {
      await this.ctx.close();
    } catch {
      /* ignore */
    }
  }
}
