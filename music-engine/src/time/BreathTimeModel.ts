import type { SeededRandom } from '../core/SeededRandom';

/**
 * Breath time model (PRD §9.3 / §31).
 *
 * Several slow sine cycles with different periods (43s / 71s / 109s around
 * the PRD's suggested range) are summed so the result never feels like a
 * mechanical loop. `value(t)` ∈ [0,1] can drive density, brightness, filters
 * and stereo movement.
 */
export class BreathTimeModel {
  private components: { period: number; phase: number; amp: number }[] = [];
  private ampTotal = 0;

  constructor(rng: SeededRandom, opts: { speed?: number } = {}) {
    const speed = Math.min(2, Math.max(0.2, opts.speed ?? 1));
    const periods = [43, 71, 109].map((p) => p / speed);
    const amps = [0.5, 0.3, 0.2];
    for (let i = 0; i < periods.length; i++) {
      const c = { period: periods[i], phase: rng.next(), amp: amps[i] };
      this.components.push(c);
      this.ampTotal += c.amp;
    }
  }

  /** Breath value at local time t (seconds since style start), in [0, 1]. */
  value(t: number): number {
    let v = 0;
    for (const c of this.components) {
      v += c.amp * Math.sin(2 * Math.PI * (t / c.period + c.phase));
    }
    // Keep a gentle floor so "exhale" never fully collapses the music.
    return 0.5 + 0.45 * (v / this.ampTotal);
  }
}
