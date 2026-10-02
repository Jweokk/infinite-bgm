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
import { DroneGenerator } from '../zen/DroneGenerator';
import { HarmonicGenerator } from '../zen/HarmonicGenerator';

/**
 * Dream (free): high, soft bells over a warm major pad, plucked tones
 * trailing into long echoes — tape wobble and shimmer do the "half-remembered"
 * work. Pitch material is major/add9 only.
 */
class DreamStyle implements StyleInstance {
  private p: Record<string, ParamValue>;
  private master: SeededRandom;
  private pads: DroneGenerator;
  private plucks: HarmonicGenerator;
  private arc: MacroArc;

  private origin: number | null = null;
  private root = 44;
  private bellCursor = 4;
  private counter = 0;
  private bellRng: SeededRandom;

  constructor(seed: string | number, parameters: Record<string, ParamValue>) {
    this.p = { ...parameters };
    this.master = new SeededRandom(`${seed}::dream`);
    this.pads = new DroneGenerator(this.master);
    this.plucks = new HarmonicGenerator(this.master);
    this.bellRng = this.master.fork('bells');
    this.root = 41 + this.master.fork('root').int(0, 7);
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
    fx.get('reverb')?.setParameter('decay', lerp(5, 9, this.num('space', 0.85)));
    fx.get('reverb')?.setParameter('wet', 0.35 + this.num('space', 0.85) * 0.4);
    fx.get('shimmer')?.setParameter('wet', this.num('shimmer', 0.55) * 0.5);
    fx.get('shimmer')?.setParameter('feedback', 0.3);
    fx.get('delay')?.setParameter('wet', this.num('echo', 0.6) * 0.4);
    fx.get('delay')?.setParameter('time', 0.46);
    fx.get('delay')?.setParameter('feedback', 0.45);
    // Identity feature (v1.4): heavy tape pitch drift — the track sags and sways.
    fx.get('tape')?.setParameter('wet', 0.42);
    fx.get('tape')?.setParameter('wobble', 2.4);
    fx.get('eq')?.setParameter('low', 0.5);
    fx.get('eq')?.setParameter('high', 1);
    fx.get('vinyl')?.setParameter('amount', 0);
    fx.get('saturation')?.setParameter('wet', 0.05);
    context.spatial.setStereoWidth(1.1 + this.num('drift', 0.5) * 0.4);
    context.spatial.setMovement(this.num('drift', 0.5));
  }

  stop(): void {
    /* nothing to release */
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

    // --- warm pad: root + fifth + ninth, crossfading ---
    events.push(
      ...this.pads.generate(
        origin,
        localTo,
        () => ({ root: this.root, tones: [0, 7] }),
        { eventDuration: 0.65, warmth: 0.7, stereoMovement: this.num('drift', 0.5) },
        () => 0.55,
        (t) => clamp(macroAt(t).brightness, 0.35, 1.1),
      ),
    );
    // Ninth voice one octave up, quieter.
    events.push(
      ...this.pads.generate(
        origin,
        localTo,
        () => ({ root: this.root + 12, tones: [0, 2] }),
        { eventDuration: 0.6, warmth: 0.6, stereoMovement: this.num('drift', 0.5) * 0.8 },
        () => 0.5,
        (t) => clamp(macroAt(t).brightness, 0.35, 1.1),
      ),
    );

    // --- soft plucked tones with long echoes ---
    events.push(
      ...this.plucks.generate(
        origin,
        localTo,
        () => ({ root: this.root, tones: [0, 2, 7, 11, 14] }), // major + add9 material
        { harmonicDensity: this.num('bellDensity', 0.35) * 0.6, warmth: 0.5, stereoMovement: this.num('drift', 0.5) },
        () => 0.5,
      ),
    );

    // --- high bells: the dream signifier (emit-at-cursor) ---
    let guard = 0;
    while (this.bellCursor < localTo && guard++ < 128) {
      const t = this.bellCursor;
      const m = macroAt(t);
      events.push({
        id: `dream:bell:${this.counter++}`,
        type: 'bell',
        startTime: origin + t,
        duration: lerp(4, 9, this.bellRng.next()),
        instrument: 'bell',
        pitch: this.root + this.bellRng.pick([24, 26, 31, 36]),
        velocity: clamp((0.24 + this.num('brightness', 0.6) * 0.18) * m.brightness, 0.02, 1),
        pan: this.bellRng.range(-1, 1) * (0.15 + this.num('drift', 0.5) * 0.35),
        parameters: { attack: 0.12, detune: 5, exciteBus: 'drone', excite: 0.2 },
        metadata: { sourcePlugin: 'dream', role: 'bell' },
      });
      const gap = lerp(4, 16, 1 - this.num('bellDensity', 0.35)) * this.bellRng.range(0.6, 1.5) / clamp(m.density, 0.3, 1.2);
      this.bellCursor = t + gap;
    }

    return events;
  }
}

function dreamParameters() {
  return [
    { id: 'brightness', name: '亮度', type: 'range', min: 0, max: 1, step: 0.01, default: 0.6, category: 'basic', percent: true },
    { id: 'bellDensity', name: '钟声密度', type: 'range', min: 0, max: 1, step: 0.01, default: 0.35, category: 'basic', percent: true },
    { id: 'echo', scope: 'fx', name: '回声', type: 'range', min: 0, max: 1, step: 0.01, default: 0.6, category: 'basic', percent: true },
    { id: 'drift', name: '漂移', type: 'range', min: 0, max: 1, step: 0.01, default: 0.5, category: 'basic', percent: true },
    { id: 'space', scope: 'fx', name: '空间', type: 'range', min: 0, max: 1, step: 0.01, default: 0.85, category: 'basic', percent: true },
    { id: 'sessionPurpose', name: '聆听目的', type: 'select', default: 'flow', options: [...PURPOSE_OPTIONS], category: 'basic' },
    { id: 'shimmer', scope: 'fx', name: '微光', type: 'range', min: 0, max: 1, step: 0.01, default: 0.55, category: 'advanced', percent: true },
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

export const dreamPlugin: StylePlugin = {
  id: 'dream',
  name: 'Dream',
  version: '1.0.0',
  description: '梦境：大调和声的温暖铺底、高空灵钟与拖长的回声，如半醒的记忆。',
  timeMode: 'free',
  tags: ['dream', 'ethereal', 'warm', 'reverb'],
  color: '#9fd8e8',
  parameters: dreamParameters(),
  presets: [
    { id: 'lullaby', name: 'Lullaby', parameters: { brightness: 0.5, bellDensity: 0.25, echo: 0.7, drift: 0.6, sessionPurpose: 'sleep' } },
    { id: 'reverie', name: 'Reverie', parameters: { brightness: 0.65, bellDensity: 0.45, echo: 0.55, shimmer: 0.7 } },
    { id: 'half-asleep', name: 'Half Asleep', parameters: { brightness: 0.4, bellDensity: 0.18, echo: 0.75, drift: 0.7, sessionPurpose: 'sleep', sessionLength: '30' } },
  ],
  requiredInstruments: ['drone', 'bell', 'pluck'],
  optionalInstruments: [],
  requiredFX: ['reverb'],
  optionalFX: ['shimmer', 'delay', 'tape', 'stereo', 'eq'],
  create: ({ seed, parameters }) => new DreamStyle(seed, parameters),
};

export default dreamPlugin;
