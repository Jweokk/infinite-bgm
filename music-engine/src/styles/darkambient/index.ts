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

/**
 * Dark Ambient (free): the tension pole. Sub drones, tritone color voices,
 * rare dissonant metal hits, and swells that never quite resolve — unease
 * as a generative art.
 */
class DarkAmbientStyle implements StyleInstance {
  private p: Record<string, ParamValue>;
  private master: SeededRandom;
  private arc: MacroArc;

  private origin: number | null = null;
  private root: number;
  private droneCursor = 0;
  private hitCursor = 12;
  private textureCursor = 0;
  private droneCounter = 0;
  private hitCounter = 0;
  private texCounter = 0;
  private droneRng: SeededRandom;
  private hitRng: SeededRandom;
  private texRng: SeededRandom;

  constructor(seed: string | number, parameters: Record<string, ParamValue>) {
    this.p = { ...parameters };
    this.master = new SeededRandom(`${seed}::darkambient`);
    this.root = 26 + this.master.fork('root').int(0, 6); // D0–A0 region
    this.droneRng = this.master.fork('drone');
    this.hitRng = this.master.fork('hits');
    this.texRng = this.master.fork('texture');
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
    fx.get('eq')?.setParameter('low', 3);
    fx.get('eq')?.setParameter('mid', -1.5);
    fx.get('eq')?.setParameter('high', -4);
    fx.get('reverb')?.setParameter('decay', lerp(8, 13, this.num('space', 0.85)));
    fx.get('reverb')?.setParameter('wet', 0.4 + this.num('space', 0.85) * 0.3);
    fx.get('reverb')?.setParameter('predelay', 0.06);
    fx.get('shimmer')?.setParameter('wet', 0.05);
    fx.get('tape')?.setParameter('wet', 0.06);
    fx.get('vinyl')?.setParameter('amount', 0);
    fx.get('delay')?.setParameter('wet', 0.05);
    fx.get('saturation')?.setParameter('wet', 0.08);
    context.spatial.setStereoWidth(1.05);
    context.spatial.setMovement(0.35);
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
    const dread = this.num('dread', 0.6);

    // --- sub drone + dissonant color voices (tritone / minor 9th) ---
    let guard = 0;
    while (this.droneCursor < localTo && guard++ < 32) {
      const t = this.droneCursor;
      const dur = lerp(60, 140, this.droneRng.next());
      const m = macroAt(t);
      events.push({
        id: `da:drone:${this.droneCounter++}`,
        type: 'drone',
        startTime: origin + t,
        duration: dur,
        instrument: 'drone',
        pitch: this.root,
        velocity: clamp(0.5 * (0.5 + m.brightness * 0.6), 0.05, 1),
        pan: 0,
        parameters: { warmth: 0.3, movement: 0.25, cutoff: 180 + dread * 120 },
        metadata: { sourcePlugin: 'darkambient', role: 'drone' },
      });
      // The tritone voice — the source of the unease. Enters and leaves.
      if (this.droneRng.chance(0.45 + dread * 0.3)) {
        events.push({
          id: `da:voice:${this.droneCounter++}`,
          type: 'drone',
          startTime: origin + t + this.droneRng.range(0, dur * 0.4),
          duration: dur * lerp(0.5, 0.9, this.droneRng.next()),
          instrument: 'drone',
          pitch: this.root + this.droneRng.pick([6, 13, 1]),
          velocity: clamp(0.2 * dread * (0.5 + m.brightness * 0.6), 0.02, 0.6),
          pan: this.droneRng.range(-0.4, 0.4),
          parameters: { warmth: 0.25, movement: 0.4, cutoff: 240 + dread * 200 },
          metadata: { sourcePlugin: 'darkambient', role: 'voice' },
        });
      }
      this.droneCursor = t + dur - lerp(10, 20, this.droneRng.next());
    }

    // --- rare metal hits: dissonant, far away (emit-at-cursor) ---
    guard = 0;
    while (this.hitCursor < localTo && guard++ < 64) {
      const t = this.hitCursor;
      const m = macroAt(t);
      events.push({
        id: `da:hit:${this.hitCounter++}`,
        type: 'bell',
        startTime: origin + t,
        duration: lerp(5, 14, this.hitRng.next()),
        instrument: 'bell',
        pitch: this.root + 25 + this.hitRng.pick([0, 1, 6]),
        velocity: clamp((0.22 + dread * 0.15) * m.brightness, 0.02, 0.7),
        pan: this.hitRng.range(-0.6, 0.6),
        parameters: { attack: 0.02, detune: 8 },
        metadata: { sourcePlugin: 'darkambient', role: 'hit' },
      });
      this.hitCursor = t + lerp(18, 60, 1 - this.num('hits', 0.3)) * this.hitRng.range(0.6, 1.5);
    }

    // --- dark room tone, barely there ---
    guard = 0;
    while (this.textureCursor < localTo && guard++ < 32) {
      const dur = lerp(80, 180, this.texRng.next());
      events.push({
        id: `da:tex:${this.texCounter++}`,
        type: 'texture',
        startTime: origin + this.textureCursor,
        duration: dur,
        instrument: 'noise-texture',
        velocity: 0.1 + dread * 0.06,
        pan: this.texRng.range(-0.3, 0.3),
        parameters: { texture: 'room', movement: 0.3 },
        metadata: { sourcePlugin: 'darkambient', role: 'texture' },
      });
      this.textureCursor += dur * 0.75;
    }

    return events;
  }
}

function darkAmbientParameters() {
  return [
    { id: 'dread', name: '不安度', type: 'range', min: 0, max: 1, step: 0.01, default: 0.6, category: 'basic', percent: true },
    { id: 'hits', name: '金属敲击', type: 'range', min: 0, max: 1, step: 0.01, default: 0.3, category: 'basic', percent: true },
    { id: 'space', name: '空间', type: 'range', min: 0, max: 1, step: 0.01, default: 0.85, scope: 'fx', category: 'basic', percent: true },
    { id: 'sessionPurpose', name: '聆听目的', type: 'select', default: 'flow', options: [...PURPOSE_OPTIONS], category: 'basic' },
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

export const darkAmbientPlugin: StylePlugin = {
  id: 'darkambient',
  name: 'Dark Ambient',
  version: '1.0.0',
  description: '黑暗氛围：次低音持续音、三全音色彩声部、遥远的不协和金属敲击——不安本身就是音乐。',
  timeMode: 'free',
  tags: ['dark', 'ambient', 'tension', 'drone'],
  color: '#6b5f7a',
  parameters: darkAmbientParameters(),
  presets: [
    { id: 'basement', name: 'Basement', parameters: { dread: 0.55, hits: 0.25, space: 0.85 } },
    { id: 'the-void', name: 'The Void', parameters: { dread: 0.85, hits: 0.15, space: 1 } },
    { id: 'abandoned-hall', name: 'Abandoned Hall', parameters: { dread: 0.45, hits: 0.5, space: 0.9 } },
  ],
  requiredInstruments: ['drone', 'bell', 'noise-texture'],
  optionalInstruments: [],
  requiredFX: ['reverb'],
  optionalFX: ['eq', 'stereo'],
  create: ({ seed, parameters }) => new DarkAmbientStyle(seed, parameters),
};

export default darkAmbientPlugin;
