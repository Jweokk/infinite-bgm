import type { SeededRandom } from '../../core/SeededRandom';
import { lerp } from '../../core/music/Theory';
import type { MusicalEvent } from '../../core/types';
import type { HarmonicField } from './ZenStyle';

export interface HarmonicParams {
  harmonicDensity: number;
  warmth: number;
  stereoMovement: number;
}

/**
 * Occasional soft plucked arpeggios drawn from the current harmonic field
 * (sus2 / open fifth / add9 colors — never traditional progressions).
 */
export class HarmonicGenerator {
  private cursor = 8; // let the drone establish itself first
  private counter = 0;
  private rng: SeededRandom;

  constructor(master: SeededRandom) {
    this.rng = master.fork('harmonics');
  }

  generate(
    origin: number,
    localTo: number,
    fieldAt: (t: number) => HarmonicField,
    p: HarmonicParams,
    breathAt: (t: number) => number,
  ): MusicalEvent[] {
    const events: MusicalEvent[] = [];
    let guard = 0;
    // Emit at cursor, then advance — chunking-invariant like the bell lane.
    while (this.cursor < localTo && guard++ < 128) {
      const t = this.cursor;
      const field = fieldAt(t);
      const b = breathAt(t);
      const noteCount = 2 + Math.floor(this.rng.next() * 3);
      const chosen = [...field.tones].sort(() => this.rng.next() - 0.5).slice(0, noteCount);
      let delay = 0;
      for (const tone of chosen) {
        events.push({
          id: `zen:harm:${this.counter++}`,
          type: 'harmonic',
          startTime: origin + t + delay,
          duration: lerp(2.5, 7, this.rng.next()),
          instrument: 'pluck',
          pitch: field.root + tone + 24,
          velocity: 0.2 + b * 0.12,
          pan: this.rng.range(-1, 1) * (0.1 + p.stereoMovement * 0.3),
          parameters: { bright: 0.35 + p.warmth * 0.3 },
          metadata: { sourcePlugin: 'zen', role: 'harmonic' },
        });
        delay += this.rng.range(0.5, 1.7);
      }
      this.cursor += lerp(14, 55, 1 - p.harmonicDensity) * this.rng.range(0.6, 1.5);
    }
    return events;
  }
}
