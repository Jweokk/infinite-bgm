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

const NATURE_SCALE = [0, 2, 4, 7, 9]; // major pentatonic — forest-friendliness

/**
 * Nature (free): a living soundscape — wind and water beds, birdsong motifs
 * in the high canopy, a distant pentatonic pluck and a soft ground drone.
 */
class NatureStyle implements StyleInstance {
  private p: Record<string, ParamValue>;
  private master: SeededRandom;
  private arc: MacroArc;

  private origin: number | null = null;
  private root: number;
  private windCursor = 0;
  private waterCursor = 0;
  private birdCursor = 3;
  private pluckCursor = 6;
  private droneCursor = 0;
  private windCounter = 0;
  private waterCounter = 0;
  private birdCounter = 0;
  private pluckCounter = 0;
  private droneCounter = 0;
  private windRng: SeededRandom;
  private waterRng: SeededRandom;
  private birdRng: SeededRandom;
  private pluckRng: SeededRandom;
  private droneRng: SeededRandom;

  constructor(seed: string | number, parameters: Record<string, ParamValue>) {
    this.p = { ...parameters };
    this.master = new SeededRandom(`${seed}::nature`);
    this.root = 36 + this.master.fork('root').int(0, 6);
    this.windRng = this.master.fork('wind');
    this.waterRng = this.master.fork('water');
    this.birdRng = this.master.fork('birds');
    this.pluckRng = this.master.fork('pluck');
    this.droneRng = this.master.fork('ground');
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
    fx.get('reverb')?.setParameter('decay', lerp(3, 8, this.num('space', 0.85)));
    fx.get('reverb')?.setParameter('wet', 0.2 + this.num('space', 0.85) * 0.35);
    fx.get('shimmer')?.setParameter('wet', 0.15);
    fx.get('eq')?.setParameter('high', -0.5);
    fx.get('delay')?.setParameter('wet', 0.08);
    fx.get('tape')?.setParameter('wet', 0.05);
    fx.get('vinyl')?.setParameter('amount', 0);
    fx.get('saturation')?.setParameter('wet', 0.04);
    context.spatial.setStereoWidth(1.05);
    context.spatial.setMovement(0.55);
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

    // --- wind bed ---
    if (this.num('wind', 0.5) > 0.04) {
      let guard = 0;
      while (this.windCursor < localTo && guard++ < 32) {
        const dur = lerp(50, 140, this.windRng.next());
        const m = macroAt(this.windCursor);
        events.push({
          id: `nat:wind:${this.windCounter++}`,
          type: 'wind',
          startTime: origin + this.windCursor,
          duration: dur,
          instrument: 'noise-texture',
          velocity: clamp(this.num('wind', 0.5) * 0.35 * (0.6 + m.brightness * 0.5), 0.02, 1),
          pan: this.windRng.range(-0.5, 0.5),
          parameters: { texture: 'wind', movement: 0.6 },
          metadata: { sourcePlugin: 'nature', role: 'wind' },
        });
        this.windCursor += dur * this.windRng.range(0.45, 0.85);
      }
    }

    // --- water bed (stream / rain family) ---
    if (this.num('water', 0.4) > 0.04) {
      let guard = 0;
      while (this.waterCursor < localTo && guard++ < 32) {
        const dur = lerp(50, 150, this.waterRng.next());
        const m = macroAt(this.waterCursor);
        const kind = this.waterRng.chance(0.55) ? 'rain' : 'water';
        events.push({
          id: `nat:water:${this.waterCounter++}`,
          type: 'water',
          startTime: origin + this.waterCursor,
          duration: dur,
          instrument: 'noise-texture',
          velocity: clamp(this.num('water', 0.4) * 0.32 * (0.6 + m.brightness * 0.5), 0.02, 1),
          pan: this.waterRng.range(-0.4, 0.4),
          parameters: { texture: kind, movement: 0.5 },
          metadata: { sourcePlugin: 'nature', role: 'water' },
        });
        this.waterCursor += dur * this.waterRng.range(0.5, 0.9);
      }
    }

    // --- birdsong: high short motifs, 2-4 chirps each (emit-at-cursor) ---
    if (this.num('birdsong', 0.35) > 0.04) {
      let guard = 0;
      while (this.birdCursor < localTo && guard++ < 256) {
        const t = this.birdCursor;
        const chirps = 2 + Math.floor(this.birdRng.next() * 3);
        const pan = this.birdRng.range(-0.75, 0.75);
        let bt = t;
        for (let i = 0; i < chirps; i++) {
          const deg = this.birdRng.int(6, 13);
          events.push({
            id: `nat:bird:${this.birdCounter++}`,
            type: 'bell',
            startTime: origin + bt,
            duration: this.birdRng.range(0.25, 0.8),
            instrument: 'bell',
            pitch: degreeToMidi(this.root, NATURE_SCALE, deg) + 12,
            velocity: 0.1 + this.birdRng.next() * 0.08,
            pan,
            parameters: { attack: 0.035, detune: 5 },
            metadata: { sourcePlugin: 'nature', role: 'birdsong' },
          });
          bt += this.birdRng.range(0.14, 0.4);
        }
        this.birdCursor = t + lerp(5, 22, 1 - this.num('birdsong', 0.35)) * this.birdRng.range(0.5, 1.6);
      }
    }

    // --- distant pluck (a wanderer with a string instrument) ---
    if (this.num('density', 0.6) > 0.04) {
      let guard = 0;
      while (this.pluckCursor < localTo && guard++ < 128) {
        const t = this.pluckCursor;
        const m = macroAt(t);
        events.push({
          id: `nat:pluck:${this.pluckCounter++}`,
          type: 'note',
          startTime: origin + t,
          duration: this.pluckRng.range(1.5, 3),
          instrument: 'pluck',
          pitch: degreeToMidi(this.root, NATURE_SCALE, this.pluckRng.int(0, 7)) + 24,
          velocity: clamp(0.26 * m.brightness, 0.05, 1),
          pan: this.pluckRng.range(-0.3, 0.3),
          parameters: { bright: 0.4 },
          metadata: { sourcePlugin: 'nature', role: 'pluck' },
        });
        this.pluckCursor = t + lerp(9, 28, 1 - this.num('density', 0.6)) * this.pluckRng.range(0.6, 1.4);
      }
    }

    // --- ground drone (own rng so lanes never interleave draws) ---
    if (this.num('droneLevel', 0.25) > 0.05) {
      let guard = 0;
      while (this.droneCursor < localTo && guard++ < 32) {
        const dur = lerp(45, 100, this.droneRng.next());
        events.push({
          id: `nat:drone:${this.droneCounter++}`,
          type: 'drone',
          startTime: origin + this.droneCursor,
          duration: dur,
          instrument: 'drone',
          pitch: this.root,
          velocity: this.num('droneLevel', 0.25) * 0.5,
          pan: 0,
          parameters: { warmth: 0.5, movement: 0.3, cutoff: 300 },
          metadata: { sourcePlugin: 'nature', role: 'drone' },
        });
        this.droneCursor += dur - 10;
      }
    }

    return events;
  }
}

function natureParameters() {
  return [
    { id: 'wind', name: '风', type: 'range', min: 0, max: 1, step: 0.01, default: 0.5, category: 'basic', percent: true },
    { id: 'water', name: '水', type: 'range', min: 0, max: 1, step: 0.01, default: 0.4, category: 'basic', percent: true },
    { id: 'birdsong', name: '鸟鸣', type: 'range', min: 0, max: 1, step: 0.01, default: 0.35, category: 'basic', percent: true },
    { id: 'density', name: '密度', type: 'range', min: 0, max: 1, step: 0.01, default: 0.6, category: 'basic', percent: true },
    { id: 'space', scope: 'fx', name: '空间', type: 'range', min: 0, max: 1, step: 0.01, default: 0.85, category: 'basic', percent: true },
    { id: 'sessionPurpose', name: '聆听目的', type: 'select', default: 'flow', options: [...PURPOSE_OPTIONS], category: 'basic' },
    { id: 'droneLevel', name: '大地铺底', type: 'range', min: 0, max: 1, step: 0.01, default: 0.25, category: 'advanced', percent: true },
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

export const naturePlugin: StylePlugin = {
  id: 'nature',
  name: 'Nature',
  version: '1.0.0',
  description: '自然声景：风与水的长音铺底、林间鸟鸣动机、五声拨弦与大地般的低音。',
  timeMode: 'free',
  tags: ['nature', 'soundscape', 'forest', 'field'],
  color: '#7cc576',
  parameters: natureParameters(),
  presets: [
    { id: 'forest-dawn', name: 'Forest Dawn', parameters: { wind: 0.55, water: 0.3, birdsong: 0.55, density: 0.5 } },
    { id: 'rainstream', name: 'Rain & Stream', parameters: { wind: 0.3, water: 0.85, birdsong: 0.12, density: 0.4 } },
    { id: 'mountain-wind', name: 'Mountain Wind', parameters: { wind: 0.9, water: 0.1, birdsong: 0.05, droneLevel: 0.4 } },
    { id: 'meadow', name: 'Meadow', parameters: { wind: 0.45, water: 0.25, birdsong: 0.7, density: 0.7 } },
  ],
  requiredInstruments: ['noise-texture', 'bell', 'pluck', 'drone'],
  optionalInstruments: [],
  requiredFX: ['reverb'],
  optionalFX: ['eq', 'stereo', 'delay'],
  create: ({ seed, parameters }) => new NatureStyle(seed, parameters),
};

export default naturePlugin;
