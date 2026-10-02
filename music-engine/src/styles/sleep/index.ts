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
import { SilenceGenerator } from '../zen/SilenceGenerator';

/**
 * Sleep (free): the darkest, sparsest variant — a sub-root drone, rare
 * distant bowls, near-silent room tone. Defaults to the sleep macro arc so
 * the music dissolves toward silence over the session.
 */
class SleepStyle implements StyleInstance {
  private p: Record<string, ParamValue>;
  private master: SeededRandom;
  private drones: DroneGenerator;
  private arc: MacroArc;
  private lastCtx: StyleContext | null = null;

  private origin: number | null = null;
  private root: number;
  private bowlCursor = 0;
  private textureCursor = 0;
  private bellCounter = 0;
  private texCounter = 0;
  private bowlRng: SeededRandom;
  private texRng: SeededRandom;

  constructor(seed: string | number, parameters: Record<string, ParamValue>) {
    this.p = { ...parameters };
    this.master = new SeededRandom(`${seed}::sleep`);
    this.drones = new DroneGenerator(this.master);
    const rootRng = this.master.fork('root');
    this.root = 31 + rootRng.int(0, 5); // G1–C2 region
    this.bowlRng = this.master.fork('bowls');
    this.texRng = this.master.fork('texture');
    this.arc = new MacroArc(
      parsePurpose(this.p.sessionPurpose ?? 'sleep'),
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
    this.lastCtx = context;
    const fx = context.fx;
    // A deliberately dark mix: nothing bright survives the night.
    fx.get('eq')?.setParameter('low', 2);
    fx.get('eq')?.setParameter('high', -6);
    fx.get('reverb')?.setParameter('decay', lerp(5, 9, this.num('space', 0.8)));
    fx.get('reverb')?.setParameter('wet', 0.25 + this.num('space', 0.8) * 0.4);
    fx.get('shimmer')?.setParameter('wet', 0.05);
    fx.get('saturation')?.setParameter('wet', 0.04);
    fx.get('tape')?.setParameter('wet', 0.05);
    fx.get('vinyl')?.setParameter('amount', 0);
    fx.get('delay')?.setParameter('wet', 0.03);
    context.spatial.setStereoWidth(0.7);
    context.spatial.setMovement(0.2);
  }

  stop(): void {
    /* nothing to release */
  }

  setParameter(name: string, value: ParamValue): void {
    this.p[name] = value;
    if (name === 'sessionPurpose') this.arc.setPurpose(parsePurpose(value));
    else if (name === 'sessionLength') this.arc.setPurpose(parsePurpose(this.p.sessionPurpose ?? 'sleep'), Number(value) || 30);
    else if (name === 'space' && this.lastCtx) this.start(this.lastCtx);
  }

  nextBoundary(): number | null {
    return null;
  }

  generateEvents({ from, to }: GenerationContext): MusicalEvent[] {
    if (this.origin === null) this.origin = from;
    const localTo = to - this.origin;
    const origin = this.origin;
    const events: MusicalEvent[] = [];

    const warmth = this.num('warmth', 0.85);
    const macroAt = (t: number) => this.arc.value(t);

    // --- sub drone lane (root only, very warm) ---
    events.push(
      ...this.drones.generate(
        origin,
        localTo,
        () => ({ root: this.root, tones: [0, 7] }),
        { eventDuration: 0.85, warmth, stereoMovement: 0.18 },
        () => 0.5,
        (t) => clamp(macroAt(t).brightness, 0.3, 1),
      ),
    );

    // --- distant bowl lane (emit-at-cursor) ---
    const bellFreq = clamp(this.num('bellFrequency', 0.12), 0.02, 1);
    let guard = 0;
    while (this.bowlCursor < localTo && guard++ < 128) {
      const t = this.bowlCursor;
      const m = macroAt(t);
      events.push({
        id: `sleep:bell:${this.bellCounter++}`,
        type: 'bell',
        startTime: origin + t,
        duration: lerp(10, 22, this.bowlRng.next()),
        instrument: 'bowl',
        pitch: this.root + 12 + this.bowlRng.pick([0, 7, 12]),
        velocity: clamp(0.18 * m.brightness, 0.02, 0.5),
        pan: this.bowlRng.range(-0.5, 0.5),
        parameters: { attack: 0.25, detune: 3, exciteBus: 'drone', excite: 0.15 },
        metadata: { sourcePlugin: 'sleep', role: 'bowl' },
      });
      const gap =
        (SilenceGenerator.gap(this.bowlRng, { stillness: this.num('stillness', 0.95), silenceDensity: 0.85, presence: 0.1, breath: 0.3 }, 0.5) /
          clamp(bellFreq, 0.15, 1)) *
        (1 / clamp(m.density, 0.25, 1.2));
      if (gap > 8) {
        events.push(SilenceGenerator.marker(`sleep:sil:${this.bellCounter++}`, origin + t, gap));
      }
      this.bowlCursor = t + gap;
    }

    // --- near-silent room tone ---
    let tguard = 0;
    while (this.textureCursor < localTo && tguard++ < 32) {
      const dur = lerp(90, 200, this.texRng.next());
      events.push({
        id: `sleep:tex:${this.texCounter++}`,
        type: 'texture',
        startTime: origin + this.textureCursor,
        duration: dur,
        instrument: 'noise-texture',
        velocity: 0.08 + this.num('stillness', 0.95) * 0.05,
        pan: 0,
        parameters: { texture: 'room', movement: 0.12 },
        metadata: { sourcePlugin: 'sleep', role: 'texture' },
      });
      this.textureCursor += dur * 0.8;
    }

    return events;
  }
}

function sleepParameters() {
  return [
    { id: 'warmth', name: '温暖', type: 'range', min: 0, max: 1, step: 0.01, default: 0.85, category: 'basic', percent: true },
    { id: 'stillness', name: '宁静', type: 'range', min: 0, max: 1, step: 0.01, default: 0.95, category: 'basic', percent: true },
    { id: 'space', scope: 'fx', name: '空间', type: 'range', min: 0, max: 1, step: 0.01, default: 0.8, category: 'basic', percent: true },
    { id: 'sessionPurpose', name: '聆听目的', type: 'select', default: 'sleep', options: [...PURPOSE_OPTIONS], category: 'basic' },
    { id: 'bellFrequency', name: '颂钵频率', type: 'range', min: 0.02, max: 1, step: 0.01, default: 0.12, category: 'advanced', percent: true },
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

export const sleepPlugin: StylePlugin = {
  id: 'sleep',
  name: 'Sleep',
  version: '1.0.0',
  description: '睡眠声景：次低音 Drone、遥远的颂钵与近乎无声的房间底噪，随会话淡入寂静。',
  timeMode: 'free',
  tags: ['sleep', 'drone', 'dark', 'relaxation'],
  color: '#5a6d9e',
  parameters: sleepParameters(),
  presets: [
    { id: 'deep-night', name: 'Deep Night', parameters: { warmth: 0.95, stillness: 1, bellFrequency: 0.06, space: 0.9 } },
    { id: 'nap', name: 'Power Nap', parameters: { warmth: 0.75, stillness: 0.85, bellFrequency: 0.25, sessionPurpose: 'sleep', sessionLength: '20' } },
    { id: 'rain-room', name: 'Rainy Room', parameters: { warmth: 0.8, stillness: 0.9, bellFrequency: 0.1, space: 0.85 } },
  ],
  requiredInstruments: ['drone', 'bowl', 'noise-texture'],
  optionalInstruments: [],
  requiredFX: ['reverb'],
  optionalFX: ['eq', 'stereo'],
  create: ({ seed, parameters }) => new SleepStyle(seed, parameters),
};

export default sleepPlugin;
