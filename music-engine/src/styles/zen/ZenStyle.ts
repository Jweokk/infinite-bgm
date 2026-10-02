import { SeededRandom } from '../../core/SeededRandom';
import type {
  GenerationContext,
  MusicalEvent,
  ParamValue,
  StyleContext,
  StyleInstance,
} from '../../core/types';
import { clamp, lerp } from '../../core/music/Theory';
import { MacroArc, parsePurpose } from '../../time/MacroArc';
import { BreathEngine } from './BreathEngine';
import { DroneGenerator } from './DroneGenerator';
import { BellGenerator } from './BellGenerator';
import { HarmonicGenerator } from './HarmonicGenerator';
import { TextureGenerator } from './TextureGenerator';

export interface HarmonicField {
  root: number;
  /** Semitone offsets: root, fifth, octave, sus color, optional 9th. */
  tones: number[];
}

interface FieldSpan {
  start: number;
  end: number;
  field: HarmonicField;
}

/**
 * Free-time Zen generator (PRD §23–32): no BPM, long drones, sparse bells,
 * first-class silence, breath modulation and slow harmonic fields.
 * Four independent lanes advance their own cursors, so output is independent
 * of generation-window chunking (determinism).
 */
export class ZenStyle implements StyleInstance {
  private p: Record<string, ParamValue>;
  private master: SeededRandom;
  private ctx: StyleContext | null = null;

  private breath: BreathEngine;
  private drones: DroneGenerator;
  private bells: BellGenerator;
  private harmonics: HarmonicGenerator;
  private textures: TextureGenerator;

  private origin: number | null = null;
  private fieldTimeline: FieldSpan[] = [];
  private fieldEnd = 0;
  private fieldRng: SeededRandom;
  private arc: MacroArc;
  private purpose: string;

  constructor(seed: string | number, parameters: Record<string, ParamValue>) {
    this.p = { ...parameters };
    this.master = new SeededRandom(`${seed}::zen`);
    this.breath = new BreathEngine(this.master.fork('breath'), this.num('breath', 0.5));
    this.drones = new DroneGenerator(this.master);
    this.bells = new BellGenerator(this.master);
    this.harmonics = new HarmonicGenerator(this.master);
    this.textures = new TextureGenerator(this.master);
    this.fieldRng = this.master.fork('field');
    this.purpose = String(this.p.sessionPurpose ?? 'flow');
    this.arc = new MacroArc(
      parsePurpose(this.purpose),
      Number(this.p.sessionLength ?? 30) || 30,
      this.master.fork('arc').next() * Math.PI * 2,
    );
  }

  private num(name: string, fallback: number): number {
    const v = this.p[name];
    const n = typeof v === 'number' ? v : parseFloat(String(v));
    return Number.isFinite(n) ? n : fallback;
  }

  // -- harmonic field -------------------------------------------------------

  /** First field: a fresh root in D2–A2 with the classic open stack. */
  private firstField(): HarmonicField {
    const root = 36 + this.fieldRng.int(0, 7);
    const sus = this.fieldRng.pick([2, 5]);
    const tones = [0, 7, 12, sus];
    if (this.fieldRng.chance(0.65)) tones.push(14);
    return { root, tones };
  }

  /**
   * Single-note field morphing (v1.1 §76.5): instead of transposing the
   * whole field, move exactly one thing — either the root slides a step, or
   * one non-root tone changes color. The ear hears "something moved in the
   * space", not "new scene".
   */
  private morphField(prev: HarmonicField): HarmonicField {
    const rng = this.fieldRng;
    if (rng.chance(0.45)) {
      const root = clamp(prev.root + rng.pick([-2, -1, 1, 2]), 33, 48);
      return { root, tones: [...prev.tones] };
    }
    const tones = [...prev.tones];
    if (tones.length > 1) {
      const idx = 1 + Math.floor(rng.next() * (tones.length - 1));
      const alternatives = [2, 3, 4, 5, 7, 9, 10, 12, 14].filter((v) => Math.abs(v - tones[idx]) >= 1);
      tones[idx] = rng.pick(alternatives);
      tones.sort((a, b) => a - b);
    }
    return { root: prev.root, tones };
  }

  private fieldAt(localT: number): HarmonicField {
    // Extend the timeline lazily; spans are generated in strict order.
    let guard = 0;
    while (this.fieldEnd <= localT && guard++ < 64) {
      const prev = this.fieldTimeline.length ? this.fieldTimeline[this.fieldTimeline.length - 1].field : null;
      const field = prev === null ? this.firstField() : this.morphField(prev);
      const span: FieldSpan = { start: this.fieldEnd, end: this.fieldEnd + this.fieldDuration(), field };
      this.fieldTimeline.push(span);
      this.fieldEnd = span.end;
    }
    for (let i = this.fieldTimeline.length - 1; i >= 0; i--) {
      const span = this.fieldTimeline[i];
      if (localT >= span.start) return span.field;
    }
    return this.fieldTimeline[0].field;
  }

  private fieldDuration(): number {
    return lerp(32, 90, 1 - this.num('harmonicDensity', 0.35)) * this.fieldRng.range(0.8, 1.3);
  }

  // -- lifecycle ------------------------------------------------------------

  start(context: StyleContext): void {
    this.ctx = context;
    this.applyFX();
  }

  stop(): void {
    this.ctx = null;
  }

  private applyFX(): void {
    const fx = this.ctx?.fx;
    if (!fx) return;
    fx.get('reverb')?.setParameter('decay', lerp(4, 11, this.num('reverbDecay', 0.8)));
    fx.get('reverb')?.setParameter('wet', 0.3 + this.num('space', 0.8) * 0.55);
    fx.get('reverb')?.setParameter('predelay', 0.04);
    fx.get('shimmer')?.setParameter('wet', this.num('shimmer', 0.3) * 0.45);
    fx.get('shimmer')?.setParameter('feedback', 0.45);
    fx.get('eq')?.setParameter('low', 1);
    fx.get('eq')?.setParameter('high', -1.2);
    fx.get('saturation')?.setParameter('wet', 0.06);
    fx.get('tape')?.setParameter('wet', 0.06);
    fx.get('vinyl')?.setParameter('amount', 0);
    fx.get('delay')?.setParameter('time', 0.55);
    fx.get('delay')?.setParameter('feedback', 0.35);
    fx.get('delay')?.setParameter('wet', 0.05);
    this.ctx?.spatial.setStereoWidth(0.8 + this.num('space', 0.8) * 0.7);
    this.ctx?.spatial.setMovement(this.num('stereoMovement', 0.5));
  }

  setParameter(name: string, value: ParamValue): void {
    this.p[name] = value;
    const n = Number(value);
    if (name === 'space') {
      this.ctx?.fx.get('reverb')?.setParameter('wet', 0.3 + n * 0.55);
      this.ctx?.spatial.setStereoWidth(0.8 + n * 0.7);
    } else if (name === 'reverbDecay') {
      this.ctx?.fx.get('reverb')?.setParameter('decay', lerp(4, 11, n));
    } else if (name === 'shimmer') {
      this.ctx?.fx.get('shimmer')?.setParameter('wet', n * 0.65);
    } else if (name === 'stereoMovement') {
      this.ctx?.spatial.setMovement(n);
    } else if (name === 'breath') {
      this.breath.setSpeed(n, this.master.fork('breath'));
    } else if (name === 'sessionPurpose') {
      this.purpose = String(value);
      this.arc.setPurpose(parsePurpose(this.purpose));
    } else if (name === 'sessionLength') {
      this.arc.setPurpose(parsePurpose(this.purpose), Number(value) || 30);
    }
  }

  nextBoundary(): number | null {
    // Free time: any moment is as good as another; the engine crossfades.
    return null;
  }

  // -- generation -----------------------------------------------------------

  generateEvents({ from, to }: GenerationContext): MusicalEvent[] {
    if (this.origin === null) this.origin = from;
    const localTo = to - this.origin;
    // Warm the field timeline before lanes query it.
    this.fieldAt(0);

    const breathAt = (t: number) => this.breath.value(t);
    const fieldAt = (t: number) => this.fieldAt(t);
    const origin = this.origin;
    const macroAt = (t: number) => this.arc.value(t);

    const params = {
      stillness: this.num('stillness', 0.8),
      presence: this.num('presence', 0.3),
      warmth: this.num('warmth', 0.6),
      space: this.num('space', 0.8),
      nature: this.num('nature', 0.4),
      breath: this.num('breath', 0.5),
      harmonicDensity: this.num('harmonicDensity', 0.35),
      melodicDensity: this.num('melodicDensity', 0.3),
      textureDensity: this.num('textureDensity', 0.4),
      eventDuration: this.num('eventDuration', 0.6),
      silenceDensity: this.num('silenceDensity', 0.7),
      stereoMovement: this.num('stereoMovement', 0.5),
    };

    // Breath quantization strength (§76.6): the breath param decides, and a
    // meditation purpose turns it into a near-lock to the inhale peaks.
    const alignProb = this.purpose === 'meditation' ? 0.5 + params.breath * 0.35 : params.breath * 0.45;

    const events: MusicalEvent[] = [];
    // Macro multipliers are always evaluated at each event's own local time,
    // never at window midpoints — that keeps generation chunking-invariant.
    events.push(...this.drones.generate(origin, localTo, fieldAt, params, breathAt, (t) => clamp(macroAt(t).brightness, 0.3, 1.1)));
    events.push(
      ...this.bells.generate(origin, localTo, fieldAt, params, breathAt, {
        alignProb,
        nextPeak: (t, maxSearch) => this.breath.nextPeakAfter(t, maxSearch),
        macro: (t) => macroAt(t),
      }),
    );
    events.push(...this.harmonics.generate(origin, localTo, fieldAt, params, breathAt));
    events.push(...this.textures.generate(origin, localTo, params));
    return events;
  }
}
