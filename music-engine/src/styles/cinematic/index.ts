import { SeededRandom } from '../../core/SeededRandom';
import type {
  GenerationContext,
  MusicalEvent,
  ParamValue,
  StyleContext,
  StyleInstance,
  StylePlugin,
} from '../../core/types';
import { clamp, degreeToMidi, lerp } from '../../core/music/Theory';
import { MacroArc, parsePurpose, PURPOSE_OPTIONS } from '../../time/MacroArc';

const CINEMATIC_SCALE = [0, 2, 3, 7, 10]; // minor pentatonic + b7: wide-screen material

/**
 * Cinematic (free): a sub-bass pedal, swelling minor chord voices, a sparse
 * piano motif and an optional heartbeat pulse — trailer music without the
 * trailer.
 */
class CinematicStyle implements StyleInstance {
  private p: Record<string, ParamValue>;
  private master: SeededRandom;
  private arc: MacroArc;

  private origin: number | null = null;
  private root: number;
  private pedalCursor = 0;
  private voiceCursor = 0;
  private motifCursor = 5;
  private pulseCursor = 0;
  private pedalCounter = 0;
  private voiceCounter = 0;
  private motifCounter = 0;
  private pulseCounter = 0;
  private pedalRng: SeededRandom;
  private voiceRng: SeededRandom;
  private motifRng: SeededRandom;

  constructor(seed: string | number, parameters: Record<string, ParamValue>) {
    this.p = { ...parameters };
    this.master = new SeededRandom(`${seed}::cinematic`);
    this.root = 33 + this.master.fork('root').int(0, 5);
    this.pedalRng = this.master.fork('pedal');
    this.voiceRng = this.master.fork('voices');
    this.motifRng = this.master.fork('motif');
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
    fx.get('eq')?.setParameter('low', 2.5);
    fx.get('eq')?.setParameter('high', -1);
    fx.get('reverb')?.setParameter('decay', lerp(5, 10, this.num('space', 0.9)));
    fx.get('reverb')?.setParameter('wet', 0.3 + this.num('space', 0.9) * 0.4);
    fx.get('shimmer')?.setParameter('wet', this.num('shimmer', 0.35) * 0.6);
    fx.get('delay')?.setParameter('wet', 0.06);
    fx.get('tape')?.setParameter('wet', 0.06);
    fx.get('vinyl')?.setParameter('amount', 0);
    fx.get('saturation')?.setParameter('wet', 0.1);
    context.spatial.setStereoWidth(1.15);
    context.spatial.setMovement(0.3);
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
    const depth = this.num('depth', 0.6);
    const root = this.root - Math.round(depth * 5);

    // --- sub pedal: the tectonic layer ---
    let guard = 0;
    while (this.pedalCursor < localTo && guard++ < 32) {
      const dur = lerp(50, 110, this.pedalRng.next());
      const m = macroAt(this.pedalCursor);
      events.push({
        id: `cin:pedal:${this.pedalCounter++}`,
        type: 'drone',
        startTime: origin + this.pedalCursor,
        duration: dur,
        instrument: 'drone',
        pitch: clamp(root, 24, 40),
        velocity: clamp(0.45 * (0.6 + m.brightness * 0.5), 0.05, 1),
        pan: 0,
        parameters: { warmth: 0.35, movement: 0.12, cutoff: 220 + depth * 120 },
        metadata: { sourcePlugin: 'cinematic', role: 'pedal' },
      });
      this.pedalCursor += dur - 10;
    }

    // --- swelling chord voices: minor stack breathing in and out ---
    guard = 0;
    while (this.voiceCursor < localTo && guard++ < 64) {
      const span = lerp(30, 75, 1 - this.num('movement', 0.5)) * this.voiceRng.range(0.8, 1.3);
      const m = macroAt(this.voiceCursor);
      const voices: [number, number][] = [
        [7, 0.28],
        [12, 0.22],
        [15, 0.16],
        [22, 0.1],
      ];
      for (const [interval, level] of voices) {
        if (this.voiceRng.chance(0.2)) continue;
        events.push({
          id: `cin:voice:${this.voiceCounter++}`,
          type: 'drone',
          startTime: origin + this.voiceCursor + this.voiceRng.range(0, span * 0.3),
          duration: span * lerp(1.1, 1.6, this.voiceRng.next()),
          instrument: 'drone',
          pitch: clamp(root + interval, 24, 60),
          velocity: clamp(level * (0.4 + this.num('intensity', 0.5) * 0.9) * (0.5 + m.brightness * 0.6), 0.02, 1),
          pan: this.voiceRng.range(-0.45, 0.45),
          parameters: { warmth: 0.45, movement: 0.3, cutoff: 320 + this.num('intensity', 0.5) * 380 },
          metadata: { sourcePlugin: 'cinematic', role: 'voices' },
        });
      }
      this.voiceCursor += span;
    }

    // --- piano motif: sparse long tones on wide intervals (emit-at-cursor) ---
    guard = 0;
    while (this.motifCursor < localTo && guard++ < 128) {
      const t = this.motifCursor;
      const m = macroAt(t);
      const notes = 1 + Math.floor(this.motifRng.next() * 3);
      let mt = t;
      for (let i = 0; i < notes; i++) {
        const deg = this.motifRng.pick([0, 2, 3, 4, 5]);
        events.push({
          id: `cin:motif:${this.motifCounter++}`,
          type: 'note',
          startTime: origin + mt,
          duration: this.motifRng.range(2, 5),
          instrument: 'electric-piano',
          pitch: degreeToMidi(root + 12, CINEMATIC_SCALE, deg) + 24,
          velocity: clamp((0.3 + this.num('intensity', 0.5) * 0.15) * m.brightness, 0.05, 1),
          pan: this.motifRng.range(-0.25, 0.25),
          parameters: { roll: i === 0 ? 0.03 : 0 },
          metadata: { sourcePlugin: 'cinematic', role: 'motif' },
        });
        mt += this.motifRng.range(0.8, 2.2);
      }
      const gap = lerp(10, 35, 1 - this.num('motifDensity', 0.4)) * this.motifRng.range(0.6, 1.5) / clamp(m.density, 0.4, 1.2);
      this.motifCursor = t + gap;
    }

    // --- heartbeat pulse (emit-at-cursor) ---
    if (this.num('pulse', 0.25) > 0.04) {
      guard = 0;
      while (this.pulseCursor < localTo && guard++ < 256) {
        const t = this.pulseCursor;
        const m = macroAt(t);
        events.push({
          id: `cin:pulse:${this.pulseCounter++}`,
          type: 'drum',
          startTime: origin + t,
          duration: 0.4,
          instrument: 'kick',
          velocity: clamp((0.28 + this.num('pulse', 0.25) * 0.3) * (0.5 + m.brightness * 0.6), 0.05, 1),
          pan: 0,
          parameters: { startFreq: 90, duck: this.num('pulse', 0.25) * 0.25 },
          metadata: { sourcePlugin: 'cinematic', role: 'pulse' },
        });
        this.pulseCursor = t + lerp(4.5, 1.8, this.num('intensity', 0.5));
      }
    }

    return events;
  }
}

function cinematicParameters() {
  return [
    { id: 'intensity', name: '强度', type: 'range', min: 0, max: 1, step: 0.01, default: 0.5, category: 'basic', percent: true },
    { id: 'depth', name: '深度', type: 'range', min: 0, max: 1, step: 0.01, default: 0.6, category: 'basic', percent: true },
    { id: 'movement', name: '和声流速', type: 'range', min: 0, max: 1, step: 0.01, default: 0.5, category: 'basic', percent: true },
    { id: 'motifDensity', name: '动机密度', type: 'range', min: 0, max: 1, step: 0.01, default: 0.4, category: 'basic', percent: true },
    { id: 'pulse', name: '心跳', type: 'range', min: 0, max: 1, step: 0.01, default: 0.25, category: 'basic', percent: true },
    { id: 'space', scope: 'fx', name: '空间', type: 'range', min: 0, max: 1, step: 0.01, default: 0.9, category: 'basic', percent: true },
    { id: 'sessionPurpose', name: '聆听目的', type: 'select', default: 'flow', options: [...PURPOSE_OPTIONS], category: 'basic' },
    { id: 'shimmer', scope: 'fx', name: '微光', type: 'range', min: 0, max: 1, step: 0.01, default: 0.35, category: 'advanced', percent: true },
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

export const cinematicPlugin: StylePlugin = {
  id: 'cinematic',
  name: 'Cinematic',
  version: '1.0.0',
  description: '电影感：次低音踏板、涌动的小调和声、稀疏钢琴动机与可选的心跳脉冲。',
  timeMode: 'free',
  tags: ['cinematic', 'epic', 'drone', 'score'],
  color: '#a884c9',
  parameters: cinematicParameters(),
  presets: [
    { id: 'wide-screen', name: 'Wide Screen', parameters: { intensity: 0.6, depth: 0.7, movement: 0.45, motifDensity: 0.45 } },
    { id: 'slow-tide', name: 'Slow Tide', parameters: { intensity: 0.3, depth: 0.8, movement: 0.25, pulse: 0.05 } },
    { id: 'approach', name: 'The Approach', parameters: { intensity: 0.85, depth: 0.6, movement: 0.65, motifDensity: 0.55, pulse: 0.55 } },
  ],
  requiredInstruments: ['drone', 'electric-piano'],
  optionalInstruments: ['kick'],
  requiredFX: ['reverb'],
  optionalFX: ['eq', 'shimmer', 'stereo', 'saturation'],
  create: ({ seed, parameters }) => new CinematicStyle(seed, parameters),
};

export default cinematicPlugin;
