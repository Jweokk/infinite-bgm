import type {
  GenerationContext,
  MusicalEvent,
  ParamValue,
  StyleInstance,
  StylePlugin,
  StyleContext,
} from '../../core/types';
import { SeededRandom } from '../../core/SeededRandom';

/**
 * Minimal test style used to validate the full pipeline
 * Plugin → Event → Scheduler → Instrument → Audio (PRD §74 step 13).
 * Not registered in the production UI.
 */
class PulseStyle implements StyleInstance {
  private rng: SeededRandom;
  private origin: number | null = null;
  private cursor = 0;
  private counter = 0;
  private bpm: number;

  constructor(seed: string | number, parameters: Record<string, ParamValue>) {
    this.rng = new SeededRandom(`${seed}::pulse`);
    this.bpm = Number(parameters.bpm ?? 100) || 100;
  }

  start(_context: StyleContext): void {
    /* stateless */
  }

  stop(): void {
    /* stateless */
  }

  generateEvents({ from, to }: GenerationContext): MusicalEvent[] {
    if (this.origin === null) this.origin = from;
    const events: MusicalEvent[] = [];
    const beat = 60 / this.bpm;
    const barDur = beat * 4;
    let guard = 0;
    while (this.origin + this.cursor < to && guard++ < 128) {
      for (let b = 0; b < 4; b++) {
        const t = this.origin + this.cursor + b * beat;
        if (t >= from - 1e-6) {
          events.push({
            id: `pulse:${this.counter++}`,
            type: 'note',
            startTime: t,
            duration: 0.3,
            instrument: 'pluck',
            pitch: b === 0 ? 69 : 64,
            velocity: b === 0 ? 0.7 : 0.4,
            pan: 0,
            metadata: { sourcePlugin: 'pulse', role: 'pulse', section: `${Math.floor(this.cursor / barDur) + 1}` },
          });
        }
      }
      this.cursor += barDur;
    }
    return events;
  }

  setParameter(name: string, value: ParamValue): void {
    if (name === 'bpm') this.bpm = Number(value) || this.bpm;
  }

  nextBoundary(currentPosition: number): number | null {
    if (this.origin === null) return null;
    const barDur = (60 / this.bpm) * 4;
    const local = Math.max(0, currentPosition - this.origin);
    return this.origin + Math.ceil(local / barDur + 1e-6) * barDur;
  }
}

export const pulsePlugin: StylePlugin = {
  id: 'pulse',
  name: 'Pulse (test)',
  version: '1.0.0',
  description: 'Minimal pipeline-validation style: one pluck per beat.',
  timeMode: 'beat',
  tags: ['test'],
  color: '#9aa4ff',
  parameters: [
    { id: 'bpm', name: 'BPM', type: 'range', min: 40, max: 200, step: 1, default: 100, category: 'basic', unit: 'bpm' },
  ],
  presets: [{ id: 'default', name: 'Default', parameters: { bpm: 100 } }],
  create: ({ seed, parameters }) => new PulseStyle(seed, parameters),
};

export default pulsePlugin;
