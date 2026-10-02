import type { SeededRandom } from '../../core/SeededRandom';
import { lerp } from '../../core/music/Theory';
import type { MusicalEvent } from '../../core/types';

/**
 * Silence as a first-class element (PRD §28): explicit gaps with bounded
 * ranges, emitted as marker events the visualizer can render.
 */
export interface ZenParamsLike {
  stillness: number;
  silenceDensity: number;
  presence: number;
  breath: number;
}

export class SilenceGenerator {
  /** Silence gap in seconds before the next bell-family event. */
  static gap(rng: SeededRandom, p: ZenParamsLike, breathValue: number): number {
    const base = lerp(2.5, 26, p.stillness);
    const silenceScale = lerp(1.35, 0.6, p.silenceDensity);
    const presenceScale = 1 - p.presence * 0.3;
    const breathScale = 1 - (breathValue - 0.5) * 0.3 * p.breath;
    const jitter = rng.range(0.55, 1.65);
    return Math.min(75, Math.max(1.2, base * silenceScale * presenceScale * breathScale * jitter));
  }

  static marker(id: string, startTime: number, duration: number): MusicalEvent {
    return {
      id,
      type: 'silence',
      startTime,
      duration,
      metadata: { sourcePlugin: 'zen', role: 'silence' },
    };
  }
}
