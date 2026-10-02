/**
 * Free time model (PRD §9.2) — Zen / Ambient styles.
 * Events live on absolute seconds; silence gaps are explicit, first-class.
 */
export class FreeTimeModel {
  /** Sample a silence gap in seconds for the next event. */
  static gap(rng: { next(): number }, opts: { min: number; max: number; jitter?: number }): number {
    const jitterRange = opts.jitter ?? 0.6;
    const base = opts.min + (opts.max - opts.min) * rng.next();
    const jitter = 1 - jitterRange / 2 + jitterRange * rng.next();
    return Math.max(0.5, base * jitter);
  }

  /** Map a 0..1 density parameter onto a [min,max] window. */
  static window(density: number, min: number, max: number): { min: number; max: number } {
    const d = Math.min(1, Math.max(0, density));
    return { min: min + (max - min) * (1 - d), max: min + (max - min) * (1 - d * 0.45) };
  }
}
