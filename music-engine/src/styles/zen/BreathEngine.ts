import type { SeededRandom } from '../../core/SeededRandom';
import { BreathTimeModel } from '../../time/BreathTimeModel';
import { lerp } from '../../core/music/Theory';

/**
 * Independent breath engine (PRD §31). A single multi-period breath curve
 * modulates event density, brightness and drone cutoffs. Speed follows the
 * `breath` parameter; phases are seed-derived so the curve is deterministic.
 */
export class BreathEngine {
  private model: BreathTimeModel;
  private speed: number;

  constructor(rng: SeededRandom, breathParam: number) {
    this.speed = breathParam;
    this.model = this.build(rng);
  }

  private build(rng: SeededRandom): BreathTimeModel {
    return new BreathTimeModel(rng, { speed: lerp(0.6, 1.7, this.speed) });
  }

  setSpeed(breathParam: number, rng: SeededRandom): void {
    this.speed = breathParam;
    this.model = this.build(rng);
  }

  /** Breath value at local time t, in [0,1]. */
  value(t: number): number {
    return this.model.value(t);
  }

  /**
   * Deterministic search for the next breath *local maximum* after `t`
   * (v1.1 §76.6): the next inhale peak. Detects the rising→falling slope
   * change with a 0.2s scan, then refines at 0.05s. Returns null when no
   * peak exists within `maxSearchSec` (breath periods are 30–80s, so small
   * windows legitimately contain no peak at all).
   */
  nextPeakAfter(t: number, maxSearchSec: number): number | null {
    const step = 0.2;
    let rising = false;
    let prev = this.value(t);
    for (let x = t + step; x <= t + maxSearchSec; x += step) {
      const v = this.value(x);
      if (v > prev) {
        rising = true;
      } else if (rising && v < prev) {
        return this.refinePeak(x - step, step);
      }
      prev = v;
    }
    return null;
  }

  private refinePeak(center: number, step: number): number {
    let best = center;
    let bestV = this.value(center);
    for (let x = center - step; x <= center + step; x += 0.05) {
      if (x < 0) continue;
      const v = this.value(x);
      if (v > bestV) {
        bestV = v;
        best = x;
      }
    }
    return best;
  }

  /** Density multiplier: more events while "inhaling". */
  densityFactor(t: number): number {
    return lerp(1.15, 0.85, this.value(t));
  }

  /** Brightness multiplier for bells / drones. */
  brightness(t: number): number {
    return this.value(t);
  }
}
