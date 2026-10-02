import { SeededRandom } from '../../core/SeededRandom';
import type {
  GenerationContext,
  MusicalEvent,
  ParamValue,
  StyleContext,
  StyleInstance,
  StylePlugin,
} from '../../core/types';
import { clamp, lerp } from '../../core/music/Theory';
import { MacroArc, parsePurpose, PURPOSE_OPTIONS } from '../../time/MacroArc';
import { BreathEngine } from '../zen/BreathEngine';
import { DroneGenerator } from '../zen/DroneGenerator';
import { BellGenerator } from '../zen/BellGenerator';
import { HarmonicGenerator } from '../zen/HarmonicGenerator';
import { TextureGenerator } from '../zen/TextureGenerator';
import type { HarmonicField } from '../zen/ZenStyle';

interface FieldSpan {
  start: number;
  end: number;
  field: HarmonicField;
}

/**
 * Meditation (breath time model, PRD §77–93): breath-locked bells over a
 * warm drone, slow single-note harmonic fields. Reuses the zen lane
 * generators with meditation-flavoured parameter mapping.
 */
class MeditationStyle implements StyleInstance {
  private p: Record<string, ParamValue>;
  private master: SeededRandom;
  private breath: BreathEngine;
  private drones: DroneGenerator;
  private bells: BellGenerator;
  private harmonics: HarmonicGenerator;
  private textures: TextureGenerator;
  private arc: MacroArc;

  private origin: number | null = null;
  private fieldTimeline: FieldSpan[] = [];
  private fieldEnd = 0;
  private fieldRng: SeededRandom;

  constructor(seed: string | number, parameters: Record<string, ParamValue>) {
    this.p = { ...parameters };
    this.master = new SeededRandom(`${seed}::meditation`);
    this.breath = new BreathEngine(this.master.fork('breath'), this.num('breathRate', 0.4));
    this.drones = new DroneGenerator(this.master);
    this.bells = new BellGenerator(this.master);
    this.harmonics = new HarmonicGenerator(this.master);
    this.textures = new TextureGenerator(this.master);
    this.fieldRng = this.master.fork('field');
    this.arc = new MacroArc(
      parsePurpose(this.p.sessionPurpose ?? 'meditation'),
      Number(this.p.sessionLength ?? 20) || 20,
      this.master.fork('arc').next() * Math.PI * 2,
    );
  }

  private num(name: string, fallback: number): number {
    const v = this.p[name];
    const n = typeof v === 'number' ? v : parseFloat(String(v));
    return Number.isFinite(n) ? n : fallback;
  }

  private morphField(prev: HarmonicField): HarmonicField {
    const rng = this.fieldRng;
    if (rng.chance(0.45)) {
      return { root: clamp(prev.root + rng.pick([-2, -1, 1, 2]), 33, 46), tones: [...prev.tones] };
    }
    const tones = [...prev.tones];
    if (tones.length > 1) {
      const idx = 1 + Math.floor(rng.next() * (tones.length - 1));
      tones[idx] = rng.pick([2, 3, 4, 5, 7, 9, 10, 12, 14].filter((v) => Math.abs(v - tones[idx]) >= 1));
      tones.sort((a, b) => a - b);
    }
    return { root: prev.root, tones };
  }

  private fieldAt(localT: number): HarmonicField {
    let guard = 0;
    while (this.fieldEnd <= localT && guard++ < 64) {
      const prev = this.fieldTimeline.length ? this.fieldTimeline[this.fieldTimeline.length - 1].field : null;
      const field =
        prev === null
          ? { root: 35 + this.fieldRng.int(0, 6), tones: [0, 7, 12, this.fieldRng.pick([2, 5]), ...(this.fieldRng.chance(0.6) ? [14] : [])] }
          : this.morphField(prev);
      // transitionSpeed stretches how long each harmonic field breathes.
      const span = lerp(55, 130, 1 - this.num('harmonicDensity', 0.3)) * lerp(1.6, 0.6, this.num('transitionSpeed', 0.4)) * this.fieldRng.range(0.85, 1.25);
      this.fieldTimeline.push({ start: this.fieldEnd, end: this.fieldEnd + span, field });
      this.fieldEnd += span;
    }
    for (let i = this.fieldTimeline.length - 1; i >= 0; i--) {
      if (localT >= this.fieldTimeline[i].start) return this.fieldTimeline[i].field;
    }
    return this.fieldTimeline[0].field;
  }

  start(context: StyleContext): void {
    const fx = context.fx;
    fx.get('reverb')?.setParameter('decay', lerp(5, 12, this.num('reverb', 0.85)));
    fx.get('reverb')?.setParameter('wet', 0.3 + this.num('space', 0.85) * 0.55);
    fx.get('reverb')?.setParameter('predelay', 0.05);
    fx.get('shimmer')?.setParameter('wet', this.num('shimmer', 0.25) * 0.35);
    fx.get('eq')?.setParameter('low', 1.5);
    fx.get('eq')?.setParameter('high', -2);
    fx.get('saturation')?.setParameter('wet', 0.05);
    fx.get('tape')?.setParameter('wet', 0.04);
    fx.get('vinyl')?.setParameter('amount', 0);
    fx.get('delay')?.setParameter('wet', 0.04);
    context.spatial.setStereoWidth(0.8 + this.num('space', 0.85) * 0.7);
    context.spatial.setMovement(0.4);
  }

  stop(): void {
    /* lanes are stateless between calls */
  }

  setParameter(name: string, value: ParamValue): void {
    this.p[name] = value;
    if (name === 'breathRate') this.breath.setSpeed(this.num('breathRate', 0.4), this.master.fork('breath'));
    else if (name === 'sessionPurpose') this.arc.setPurpose(parsePurpose(value));
    else if (name === 'sessionLength') this.arc.setPurpose(parsePurpose(this.p.sessionPurpose ?? 'meditation'), Number(value) || 20);
  }

  nextBoundary(): number | null {
    return null;
  }

  generateEvents({ from, to }: GenerationContext): MusicalEvent[] {
    if (this.origin === null) this.origin = from;
    const localTo = to - this.origin;
    this.fieldAt(0);

    const breathAt = (t: number) => this.breath.value(t);
    const fieldAt = (t: number) => this.fieldAt(t);
    const macroAt = (t: number) => this.arc.value(t);
    const origin = this.origin;

    const params = {
      stillness: this.num('stillness', 0.85),
      presence: this.num('presence', 0.25),
      warmth: this.num('warmth', 0.7),
      space: this.num('space', 0.85),
      nature: 0.15,
      breath: this.num('breathRate', 0.4),
      harmonicDensity: this.num('harmonicDensity', 0.3),
      melodicDensity: this.num('bellDensity', 0.15),
      textureDensity: this.num('textureDensity', 0.25),
      eventDuration: lerp(0.55, 0.95, this.num('droneDensity', 0.6)),
      silenceDensity: 0.8,
      stereoMovement: 0.35,
    };

    // Meditation locks bells to the inhale peaks more strongly than zen.
    const alignProb = 0.45 + params.breath * 0.4;

    const events: MusicalEvent[] = [];
    events.push(...this.drones.generate(origin, localTo, fieldAt, params, breathAt, (t) => clamp(macroAt(t).brightness, 0.3, 1.1)));
    events.push(
      ...this.bells.generate(origin, localTo, fieldAt, params, breathAt, {
        alignProb,
        nextPeak: (t, maxSearch) => this.breath.nextPeakAfter(t, maxSearch),
        macro: (t) => macroAt(t),
      }),
    );
    events.push(...this.harmonics.generate(origin, localTo, fieldAt, { harmonicDensity: params.harmonicDensity * 0.7, warmth: params.warmth, stereoMovement: 0.3 }, breathAt));
    events.push(...this.textures.generate(origin, localTo, { textureDensity: params.textureDensity, nature: 0.2, stereoMovement: 0.35 }));

    // --- audible breath swells (v1.4 identity feature) ---
    // A soft air bed swelling on every inhale peak — you can breathe along.
    // Peak times are deterministic functions of time, so this is chunk-safe.
    const audible = this.num('breathSound', 0.25);
    if (audible > 0.03) {
      let bguard = 0;
      while (this.breathSwellCursor < localTo && bguard++ < 64) {
        const p1 = this.breath.nextPeakAfter(this.breathSwellCursor + 1, 150);
        if (p1 === null || p1 >= localTo) break; // leave the cursor: the next window re-finds this peak
        const p2 = this.breath.nextPeakAfter(p1 + 1, 150) ?? p1 + 18;
        events.push({
          id: `med:breath:${this.breathCounter++}`,
          type: 'texture',
          startTime: origin + p1,
          duration: clamp((p2 - p1) * 0.45, 2.5, 6),
          instrument: 'noise-texture',
          velocity: 0.03 + audible * 0.09,
          pan: 0,
          parameters: { texture: 'air', movement: 0.1 },
          metadata: { sourcePlugin: 'meditation', role: 'breath' },
        });
        this.breathSwellCursor = p1;
      }
    }
    return events;
  }

  private breathSwellCursor = 0;
  private breathCounter = 0;
}

function meditationParameters() {
  return [
    { id: 'stillness', name: '宁静', type: 'range', min: 0, max: 1, step: 0.01, default: 0.85, category: 'basic', percent: true },
    { id: 'breathRate', name: '呼吸速率', type: 'range', min: 0, max: 1, step: 0.01, default: 0.4, category: 'basic', percent: true },
    { id: 'warmth', name: '温暖', type: 'range', min: 0, max: 1, step: 0.01, default: 0.7, category: 'basic', percent: true },
    { id: 'presence', name: '临在', type: 'range', min: 0, max: 1, step: 0.01, default: 0.25, category: 'basic', percent: true },
    { id: 'breathSound', name: '呼吸声', type: 'range', min: 0, max: 1, step: 0.01, default: 0.25, category: 'basic', percent: true },
    { id: 'space', scope: 'fx', name: '空间', type: 'range', min: 0, max: 1, step: 0.01, default: 0.85, category: 'basic', percent: true },
    { id: 'sessionPurpose', name: '聆听目的', type: 'select', default: 'meditation', options: [...PURPOSE_OPTIONS], category: 'basic' },
    { id: 'bellDensity', name: '钟声密度', type: 'range', min: 0, max: 1, step: 0.01, default: 0.15, category: 'advanced', percent: true },
    { id: 'droneDensity', name: 'Drone 持续', type: 'range', min: 0, max: 1, step: 0.01, default: 0.6, category: 'advanced', percent: true },
    { id: 'harmonicDensity', name: '和声密度', type: 'range', min: 0, max: 1, step: 0.01, default: 0.3, category: 'advanced', percent: true },
    { id: 'textureDensity', name: '纹理密度', type: 'range', min: 0, max: 1, step: 0.01, default: 0.25, category: 'advanced', percent: true },
    { id: 'reverb', scope: 'fx', name: '混响', type: 'range', min: 0, max: 1, step: 0.01, default: 0.85, category: 'advanced', percent: true },
    { id: 'shimmer', scope: 'fx', name: '微光', type: 'range', min: 0, max: 1, step: 0.01, default: 0.25, category: 'advanced', percent: true },
    { id: 'transitionSpeed', name: '过渡速度', type: 'range', min: 0, max: 1, step: 0.01, default: 0.4, category: 'advanced', percent: true },
    {
      id: 'sessionLength',
      name: '睡眠/冥想时长',
      type: 'select',
      default: '20',
      options: [
        { value: '10', label: '10 分钟' },
        { value: '20', label: '20 分钟' },
        { value: '30', label: '30 分钟' },
        { value: '60', label: '60 分钟' },
      ],
      category: 'advanced',
    },
  ] as import('../../core/types').ParameterDefinition[];
}

export const meditationPlugin: StylePlugin = {
  id: 'meditation',
  name: 'Meditation',
  version: '1.0.0',
  description: '呼吸冥想：颂钵声锁定吸气峰值，温暖的低音 Drone 与极慢的和声场。',
  timeMode: 'breath',
  tags: ['meditation', 'mindfulness', 'breath', 'relaxation'],
  color: '#b7a6e3',
  parameters: meditationParameters(),
  presets: [
    { id: 'body-scan', name: 'Body Scan', parameters: { stillness: 0.9, breathRate: 0.3, bellDensity: 0.1, droneDensity: 0.7, transitionSpeed: 0.3 } },
    { id: 'breathing', name: 'Guided Breath', parameters: { stillness: 0.7, breathRate: 0.65, bellDensity: 0.28, presence: 0.4, transitionSpeed: 0.55 } },
    { id: 'singing-bowl', name: 'Singing Bowl', parameters: { stillness: 0.8, warmth: 0.85, bellDensity: 0.35, droneDensity: 0.5, reverb: 0.95 } },
  ],
  requiredInstruments: ['drone', 'bowl', 'noise-texture'],
  optionalInstruments: ['bell', 'pluck'],
  requiredFX: ['reverb'],
  optionalFX: ['shimmer', 'stereo', 'eq', 'delay'],
  create: ({ seed, parameters }) => new MeditationStyle(seed, parameters),
};

export default meditationPlugin;
