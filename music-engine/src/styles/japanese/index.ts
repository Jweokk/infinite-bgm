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
import { SilenceGenerator } from '../zen/SilenceGenerator';

const JAPANESE_SCALES: Record<string, number[]> = {
  hirajoshi: [0, 2, 3, 7, 8],
  insen: [0, 1, 5, 7, 10],
  kumoi: [0, 2, 3, 7, 9],
};

/**
 * Japanese (free): koto-like plucks on traditional pentatonic scales with
 * occasional fast rolls, a deep root+fifth drone and rare temple bowls.
 * Ma (間) — the silence between events — carries as much weight as the notes.
 */
class JapaneseStyle implements StyleInstance {
  private p: Record<string, ParamValue>;
  private master: SeededRandom;
  private arc: MacroArc;

  private origin: number | null = null;
  private root: number;
  private kotoCursor = 2;
  private bellCursor = 10;
  private droneCursor = 0;
  private droneCounter = 0;
  private kotoCounter = 0;
  private bellCounter = 0;
  private kotoRng: SeededRandom;
  private bellRng: SeededRandom;
  private droneRng: SeededRandom;

  constructor(seed: string | number, parameters: Record<string, ParamValue>) {
    this.p = { ...parameters };
    this.master = new SeededRandom(`${seed}::japanese`);
    this.root = 38 + this.master.fork('root').int(0, 5);
    this.kotoRng = this.master.fork('koto');
    this.bellRng = this.master.fork('bells');
    this.droneRng = this.master.fork('drone');
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

  private scale(): number[] {
    return JAPANESE_SCALES[String(this.p.scale ?? 'hirajoshi')] ?? JAPANESE_SCALES.hirajoshi;
  }

  start(context: StyleContext): void {
    const fx = context.fx;
    fx.get('reverb')?.setParameter('decay', lerp(4, 9, this.num('space', 0.8)));
    fx.get('reverb')?.setParameter('wet', 0.25 + this.num('space', 0.8) * 0.4);
    fx.get('shimmer')?.setParameter('wet', 0.12);
    fx.get('eq')?.setParameter('mid', -1);
    fx.get('eq')?.setParameter('high', -1.5);
    fx.get('delay')?.setParameter('wet', 0.1);
    fx.get('delay')?.setParameter('time', 0.4);
    fx.get('tape')?.setParameter('wet', 0.12);
    fx.get('vinyl')?.setParameter('amount', 0);
    fx.get('saturation')?.setParameter('wet', 0.06);
    context.spatial.setStereoWidth(0.9);
    context.spatial.setMovement(0.25);
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
    const scale = this.scale();
    const macroAt = (t: number) => this.arc.value(t);

    // --- root + fifth drone (the floor of the room) ---
    if (this.num('droneLevel', 0.5) > 0.05) {
      let guard = 0;
      while (this.droneCursor < localTo && guard++ < 32) {
        const dur = lerp(40, 90, this.droneRng.next());
        const m = macroAt(this.droneCursor);
        for (const [interval, level] of [[0, 0.42], [7, 0.18]] as const) {
          events.push({
            id: `jp:drone:${this.droneCounter++}`,
            type: 'drone',
            startTime: origin + this.droneCursor,
            duration: dur,
            instrument: 'drone',
            pitch: this.root + interval,
            velocity: clamp(level * this.num('droneLevel', 0.5) * 1.6 * (0.6 + m.brightness * 0.5), 0.02, 1),
            pan: interval === 0 ? -0.15 : 0.15,
            parameters: { warmth: this.num('warmth', 0.6), movement: 0.2, cutoff: 280 + this.num('warmth', 0.6) * 300 },
            metadata: { sourcePlugin: 'japanese', role: 'drone' },
          });
        }
        this.droneCursor += dur - 8;
      }
    }

    // --- koto lane: single notes and rolls (速弾き), emit-at-cursor ---
    let guard = 0;
    while (this.kotoCursor < localTo && guard++ < 256) {
      const m = macroAt(this.kotoCursor);
      const t = this.kotoCursor;

      const isRoll = this.kotoRng.chance(this.num('rollAmount', 0.5) * 0.4);
      const startDegree = this.kotoRng.int(0, 9);
      const pan = this.kotoRng.range(-0.35, 0.35);
      if (isRoll) {
        // A burst of fast ascending/descending scale notes — the koto roll.
        const count = 3 + Math.floor(this.kotoRng.next() * 4);
        const dir = this.kotoRng.chance(0.7) ? 1 : -1;
        let rt = t;
        for (let i = 0; i < count; i++) {
          const deg = clamp(startDegree + dir * i, 0, 11);
          events.push({
            id: `jp:koto:${this.kotoCounter++}`,
            type: 'note',
            startTime: origin + rt,
            duration: 0.5,
            instrument: 'pluck',
            pitch: degreeToMidi(this.root, scale, deg) + 24,
            velocity: clamp((0.3 + (1 - i / count) * 0.18) * m.brightness, 0.05, 1),
            pan,
            parameters: { bright: 0.65 },
            metadata: { sourcePlugin: 'japanese', role: 'koto' },
          });
          rt += this.kotoRng.range(0.07, 0.12);
        }
      } else {
        events.push({
          id: `jp:koto:${this.kotoCounter++}`,
          type: 'note',
          startTime: origin + t,
          duration: this.kotoRng.range(1.5, 3.5),
          instrument: 'pluck',
          pitch: degreeToMidi(this.root, scale, startDegree) + 24,
          velocity: clamp((0.32 + this.num('presence', 0.3) * 0.15) * m.brightness, 0.05, 1),
          pan,
          parameters: { bright: 0.45 + this.num('warmth', 0.6) * 0.25 },
          metadata: { sourcePlugin: 'japanese', role: 'koto' },
        });
      }

      const gap =
        SilenceGenerator.gap(this.kotoRng, { stillness: this.num('stillness', 0.75), silenceDensity: 0.7, presence: 0.3, breath: 0.3 }, 0.5) *
        lerp(1.3, 0.55, this.num('density', 0.4)) /
        clamp(m.density, 0.3, 1.2);
      this.kotoCursor = t + gap;
    }

    // --- rare temple bowl (emit-at-cursor) ---
    guard = 0;
    while (this.bellCursor < localTo && guard++ < 64) {
      const t = this.bellCursor;
      events.push({
        id: `jp:bell:${this.bellCounter++}`,
        type: 'bell',
        startTime: origin + t,
        duration: lerp(8, 16, this.bellRng.next()),
        instrument: 'bowl',
        pitch: this.root + 12,
        velocity: 0.26,
        pan: this.bellRng.range(-0.3, 0.3),
        parameters: { attack: 0.15, detune: 3, exciteBus: 'drone', excite: 0.2 },
        metadata: { sourcePlugin: 'japanese', role: 'bell' },
      });
      this.bellCursor = t + lerp(25, 70, 1 - this.num('bellAmount', 0.25)) * this.bellRng.range(0.7, 1.4);
    }

    return events;
  }
}

function japaneseParameters() {
  return [
    {
      id: 'scale',
      name: '音阶',
      type: 'select',
      default: 'hirajoshi',
      options: [
        { value: 'hirajoshi', label: '平调子' },
        { value: 'insen', label: '阴音阶' },
        { value: 'kumoi', label: '云井' },
      ],
      category: 'basic',
    },
    { id: 'stillness', name: '间 · 静', type: 'range', min: 0, max: 1, step: 0.01, default: 0.75, category: 'basic', percent: true },
    { id: 'density', name: '筝声密度', type: 'range', min: 0, max: 1, step: 0.01, default: 0.4, category: 'basic', percent: true },
    { id: 'rollAmount', name: '滚奏', type: 'range', min: 0, max: 1, step: 0.01, default: 0.5, category: 'basic', percent: true },
    { id: 'warmth', name: '温暖', type: 'range', min: 0, max: 1, step: 0.01, default: 0.6, category: 'basic', percent: true },
    { id: 'space', scope: 'fx', name: '空间', type: 'range', min: 0, max: 1, step: 0.01, default: 0.8, category: 'basic', percent: true },
    { id: 'sessionPurpose', name: '聆听目的', type: 'select', default: 'flow', options: [...PURPOSE_OPTIONS], category: 'basic' },
    { id: 'bellAmount', name: '钵频', type: 'range', min: 0, max: 1, step: 0.01, default: 0.25, category: 'advanced', percent: true },
    { id: 'droneLevel', name: '铺底', type: 'range', min: 0, max: 1, step: 0.01, default: 0.5, category: 'advanced', percent: true },
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

export const japanesePlugin: StylePlugin = {
  id: 'japanese',
  name: 'Japanese',
  version: '1.0.0',
  description: '和风：平调子五声音阶上的筝声与滚奏、远寺钵音与根五度铺底，重视「间」的留白。',
  timeMode: 'free',
  tags: ['japanese', 'koto', 'pentatonic', 'ma'],
  color: '#f2a0b5',
  parameters: japaneseParameters(),
  presets: [
    { id: 'zen-garden', name: 'Zen Garden', parameters: { stillness: 0.85, density: 0.3, rollAmount: 0.4, bellAmount: 0.35 } },
    { id: 'summer-matsuri', name: 'Summer Festival', parameters: { stillness: 0.5, density: 0.6, rollAmount: 0.7, droneLevel: 0.6 } },
    { id: 'snow-temple', name: 'Snow Temple', parameters: { scale: 'insen', stillness: 0.9, density: 0.25, bellAmount: 0.5, space: 0.9 } },
  ],
  requiredInstruments: ['pluck', 'bowl', 'drone'],
  optionalInstruments: ['bell'],
  requiredFX: ['reverb'],
  optionalFX: ['eq', 'delay', 'tape', 'stereo'],
  create: ({ seed, parameters }) => new JapaneseStyle(seed, parameters),
};

export default japanesePlugin;
