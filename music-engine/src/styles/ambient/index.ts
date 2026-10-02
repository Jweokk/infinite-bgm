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
import { HarmonicGenerator } from '../zen/HarmonicGenerator';
import { TextureGenerator } from '../zen/TextureGenerator';

/**
 * Ambient (free): evolving "chord clouds" — each harmonic field becomes a
 * stack of overlapping drone voices that crossfade into the next, with
 * sparse plucked tones drifting above. No bells, no drums: pure harmony
 * moving at glacial speed.
 */
class AmbientStyle implements StyleInstance {
  private p: Record<string, ParamValue>;
  private master: SeededRandom;
  private plucks: HarmonicGenerator;
  private textures: TextureGenerator;
  private arc: MacroArc;

  private origin: number | null = null;
  private cloudCursor = 0;
  private cloudRoot: number | null = null;
  private counter = 0;
  private cloudRng: SeededRandom;

  constructor(seed: string | number, parameters: Record<string, ParamValue>) {
    this.p = { ...parameters };
    this.master = new SeededRandom(`${seed}::ambient`);
    this.plucks = new HarmonicGenerator(this.master);
    this.textures = new TextureGenerator(this.master);
    this.cloudRng = this.master.fork('clouds');
    this.arc = new MacroArc(
      parsePurpose(this.p.sessionPurpose),
      Number(this.p.sessionLength ?? 30) || 30,
      this.master.fork('arc').next() * Math.PI * 2,
    );
  }

  private num(name: string, fallback: number): number {
    const v = this.p[name];
    const n = typeof v === 'number' ? v : parseFloat(String(v));
    return Number.isFinite(n) ? n : fallback;
  }

  start(context: StyleContext): void {
    const fx = context.fx;
    fx.get('reverb')?.setParameter('decay', lerp(6, 11, this.num('space', 0.9)));
    fx.get('reverb')?.setParameter('wet', 0.4 + this.num('space', 0.9) * 0.35);
    fx.get('reverb')?.setParameter('predelay', 0.06);
    fx.get('shimmer')?.setParameter('wet', this.num('shimmer', 0.5) * 0.5);
    fx.get('shimmer')?.setParameter('feedback', 0.3);
    fx.get('eq')?.setParameter('low', 0.5);
    fx.get('eq')?.setParameter('high', -1);
    fx.get('delay')?.setParameter('wet', 0.12);
    fx.get('delay')?.setParameter('time', 0.5);
    fx.get('delay')?.setParameter('feedback', 0.4);
    fx.get('tape')?.setParameter('wet', 0.08);
    fx.get('saturation')?.setParameter('wet', 0.05);
    fx.get('vinyl')?.setParameter('amount', 0);
    context.spatial.setStereoWidth(1.0 + this.num('space', 0.9) * 0.4);
    context.spatial.setMovement(this.num('movement', 0.4));
  }

  stop(): void {
    /* lanes are stateless between calls */
  }

  setParameter(name: string, value: ParamValue): void {
    this.p[name] = value;
    if (name === 'sessionPurpose') this.arc.setPurpose(parsePurpose(value));
    else if (name === 'sessionLength') this.arc.setPurpose(parsePurpose(this.p.sessionPurpose), Number(value) || 30);
  }

  nextBoundary(): number | null {
    return null;
  }

  generateEvents({ from, to }: GenerationContext): MusicalEvent[] {
    if (this.origin === null) this.origin = from;
    const localTo = to - this.origin;
    const origin = this.origin;
    const events: MusicalEvent[] = [];
    const macroAt = (t: number) => this.arc.value(t);

    // --- chord cloud lane: crossfading stacks of drone voices ---
    if (this.cloudRoot === null) this.cloudRoot = 40 + this.cloudRng.int(0, 6);
    let root = this.cloudRoot;
    let guard = 0;
    while (this.cloudCursor < localTo && guard++ < 64) {
      const m = macroAt(this.cloudCursor);
      const span = lerp(28, 75, 1 - this.num('chordSpeed', 0.5)) * this.cloudRng.range(0.8, 1.3);
      // Stack: root, fifth, ninth, color third — an open ambient voicing.
      const color = this.cloudRng.pick([16, 17, 19, 21]);
      const voices: [number, number][] = [
        [0, 0.5],
        [7, 0.3],
        [14, 0.22],
        [color, 0.14],
      ];
      const droneLevel = this.num('droneLevel', 0.7);
      for (const [interval, level] of voices) {
        if (interval !== 0 && this.cloudRng.chance(0.15)) continue; // voices drop in/out
        events.push({
          id: `amb:cloud:${this.counter++}`,
          type: 'drone',
          startTime: origin + this.cloudCursor,
          duration: span * lerp(1.4, 1.9, this.cloudRng.next()),
          instrument: 'drone',
          pitch: clamp(root + interval, 24, 60),
          velocity: clamp(level * droneLevel * (0.5 + m.brightness * 0.6), 0.02, 1),
          pan: this.cloudRng.range(-0.4, 0.4) * this.num('movement', 0.4),
          parameters: {
            warmth: 0.55,
            movement: this.num('movement', 0.4) * 0.6,
            cutoff: (300 + this.num('brightness', 0.5) * 500) * (0.7 + m.brightness * 0.5),
          },
          metadata: { sourcePlugin: 'ambient', role: 'drone' },
        });
      }
      // Slow root drift for the next cloud (voice-led, one step at a time).
      this.rootTimeline.push({ t: this.cloudCursor, root });
      root = clamp(root + this.cloudRng.pick([-2, -1, 1, 2, 5]), 36, 50);
      this.cloudCursor += span;
    }
    this.cloudRoot = root; // persist the drift across generation windows

    // --- sparse plucked tones above the clouds (follow the cloud root) ---
    events.push(
      ...this.plucks.generate(
        origin,
        localTo,
        (t) => ({ root: this.rootAt(t), tones: [0, 7, 14, 16] }),
        { harmonicDensity: this.num('melodyDensity', 0.3), warmth: 0.5, stereoMovement: this.num('movement', 0.4) },
        () => 0.5,
      ),
    );

    // --- air ---
    events.push(
      ...this.textures.generate(origin, localTo, {
        textureDensity: this.num('textureDensity', 0.35) * 0.6,
        nature: 0.25,
        stereoMovement: this.num('movement', 0.4),
      }),
    );
    return events;
  }

  /** Cloud root active at time t (recorded during cloud generation). */
  private rootTimeline: { t: number; root: number }[] = [{ t: 0, root: 40 }];
  private rootAt(t: number): number {
    for (let i = this.rootTimeline.length - 1; i >= 0; i--) {
      if (t >= this.rootTimeline[i].t) return this.rootTimeline[i].root;
    }
    return this.rootTimeline[0].root;
  }
}

function ambientParameters() {
  return [
    { id: 'brightness', name: '亮度', type: 'range', min: 0, max: 1, step: 0.01, default: 0.5, category: 'basic', percent: true },
    { id: 'chordSpeed', name: '和声流速', type: 'range', min: 0, max: 1, step: 0.01, default: 0.5, category: 'basic', percent: true },
    { id: 'droneLevel', name: '铺底音量', type: 'range', min: 0, max: 1, step: 0.01, default: 0.7, category: 'basic', percent: true },
    { id: 'space', scope: 'fx', name: '空间', type: 'range', min: 0, max: 1, step: 0.01, default: 0.9, category: 'basic', percent: true },
    { id: 'movement', name: '漂移', type: 'range', min: 0, max: 1, step: 0.01, default: 0.4, category: 'basic', percent: true },
    { id: 'sessionPurpose', name: '聆听目的', type: 'select', default: 'flow', options: [...PURPOSE_OPTIONS], category: 'basic' },
    { id: 'melodyDensity', name: '拨弦密度', type: 'range', min: 0, max: 1, step: 0.01, default: 0.3, category: 'advanced', percent: true },
    { id: 'textureDensity', name: '空气感', type: 'range', min: 0, max: 1, step: 0.01, default: 0.35, category: 'advanced', percent: true },
    { id: 'shimmer', scope: 'fx', name: '微光', type: 'range', min: 0, max: 1, step: 0.01, default: 0.5, category: 'advanced', percent: true },
    {
      id: 'sessionLength',
      name: '睡眠/冥想时长',
      type: 'select',
      default: '30',
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

export const ambientPlugin: StylePlugin = {
  id: 'ambient',
  name: 'Ambient',
  version: '1.0.0',
  description: '氛围音乐：缓慢交叉淡化的和弦云、空气质感与偶尔的拨弦星光。',
  timeMode: 'free',
  tags: ['ambient', 'drone', 'soundscape', 'evolving'],
  color: '#6ea8d8',
  parameters: ambientParameters(),
  presets: [
    { id: 'stratosphere', name: 'Stratosphere', parameters: { brightness: 0.35, chordSpeed: 0.3, space: 0.95, movement: 0.5 } },
    { id: 'polar', name: 'Polar', parameters: { brightness: 0.25, chordSpeed: 0.25, droneLevel: 0.85, textureDensity: 0.5 } },
    { id: 'sunrise', name: 'Sunrise', parameters: { brightness: 0.7, chordSpeed: 0.6, melodyDensity: 0.45, shimmer: 0.65 } },
  ],
  requiredInstruments: ['drone', 'pluck', 'noise-texture'],
  optionalInstruments: [],
  requiredFX: ['reverb'],
  optionalFX: ['shimmer', 'stereo', 'delay', 'eq'],
  create: ({ seed, parameters }) => new AmbientStyle(seed, parameters),
};

export default ambientPlugin;
