import type { SeededRandom } from '../../core/SeededRandom';
import { lerp } from '../../core/music/Theory';
import type { MusicalEvent } from '../../core/types';
import type { HarmonicField } from './ZenStyle';

export interface DroneParams {
  eventDuration: number;
  warmth: number;
  stereoMovement: number;
}

/**
 * Long overlapping drone beds (PRD §30): 22–70s voices that crossfade,
 * breathing with the breath curve.
 */
export class DroneGenerator {
  private cursor = 0;
  private counter = 0;
  private rng: SeededRandom;

  constructor(master: SeededRandom) {
    this.rng = master.fork('drone');
  }

  generate(
    origin: number,
    localTo: number,
    fieldAt: (t: number) => HarmonicField,
    p: DroneParams,
    breathAt: (t: number) => number,
    brightnessAt: (t: number) => number = () => 1,
  ): MusicalEvent[] {
    const events: MusicalEvent[] = [];
    let guard = 0;
    while (this.cursor < localTo && guard++ < 32) {
      const dur = lerp(22, 70, p.eventDuration) * this.rng.range(0.8, 1.25);
      const b = breathAt(this.cursor);
      const field = fieldAt(this.cursor);
      const brightness = Math.max(0.3, brightnessAt(this.cursor));
      events.push({
        id: `zen:drone:${this.counter++}`,
        type: 'drone',
        startTime: origin + this.cursor,
        duration: dur,
        instrument: 'drone',
        pitch: field.root,
        velocity: (0.32 + b * 0.18) * brightness,
        pan: this.rng.range(-0.25, 0.25) * p.stereoMovement,
        parameters: {
          warmth: p.warmth,
          movement: p.stereoMovement * (0.35 + b * 0.4),
          cutoff: (240 + p.warmth * 420 + b * 240) * (0.75 + brightness * 0.5),
        },
        metadata: { sourcePlugin: 'zen', role: 'drone' },
      });
      // Overlap so consecutive drones crossfade instead of gap.
      this.cursor += dur - lerp(5, 10, this.rng.next());
    }
    return events;
  }
}
