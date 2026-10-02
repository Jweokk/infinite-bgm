import type { SeededRandom } from '../../core/SeededRandom';
import { clamp, lerp } from '../../core/music/Theory';
import type { MusicalEvent } from '../../core/types';
import { SilenceGenerator, type ZenParamsLike } from './SilenceGenerator';
import type { HarmonicField } from './ZenStyle';

export interface BellParams extends ZenParamsLike {
  melodicDensity: number;
  warmth: number;
  eventDuration: number;
  stereoMovement: number;
  harmonicDensity: number;
}

export interface BellOpts {
  /** Probability that a bell soft-aligns to the breath peak (§76.6). */
  alignProb: number;
  /** Deterministic next-inhale-peak lookup after a time. */
  nextPeak: ((t: number, maxSearchSec: number) => number | null) | null;
  /** Macro-arc multipliers evaluated at each event's own time (§76.8). */
  macro: (t: number) => { density: number; brightness: number };
}

/**
 * Sparse bell / singing-bowl strikes separated by long, explicit silences
 * (PRD §27/§28). Pitch material comes from the current harmonic field.
 *
 * The cursor always points at the time of the *next* bell ("emit at cursor,
 * then advance"), so events falling exactly on a window boundary are never
 * swallowed — generation is chunking-invariant. A share of bells soft-aligns
 * to breath peaks, and each strike sympathetically excites the drone bus
 * (v1.1 §76.6/§76.7).
 */
export class BellGenerator {
  private cursor = -1;
  private counter = 0;
  private rng: SeededRandom;

  constructor(master: SeededRandom) {
    this.rng = master.fork('bells');
  }

  generate(
    origin: number,
    localTo: number,
    fieldAt: (t: number) => HarmonicField,
    p: BellParams,
    breathAt: (t: number) => number,
    opts: BellOpts,
  ): MusicalEvent[] {
    if (this.cursor < 0) {
      // Opening silence before the first bell.
      this.cursor = this.gap(p, breathAt(0), opts.macro(0).density);
    }
    const events: MusicalEvent[] = [];
    let guard = 0;
    while (this.cursor < localTo && guard++ < 256) {
      const t = this.cursor;
      const b = breathAt(t);
      const field = fieldAt(t);
      const macro = opts.macro(t);

      // Breath quantization (§76.6): softly move some bells onto the next
      // inhale peak when one is reachable, keeping a minimum spacing.
      let emitAt = t;
      if (opts.alignProb > 0 && this.rng.chance(opts.alignProb) && opts.nextPeak) {
        const peak = opts.nextPeak(emitAt, 15);
        if (peak !== null && peak <= t + 10 && peak > t - this.lastGap + 1.2) {
          emitAt = peak;
        }
      }

      const isBowl = this.rng.chance(lerp(0.75, 0.2, p.warmth));
      // Weighted pitch pick — root and fifth dominate.
      const entries = field.tones.map((tone, i) => [tone, Math.max(0.25, 1.6 - i * 0.35)] as const);
      const tone = this.rng.weighted(entries);
      // v1.5: an octave lower than v1 — bells bloom instead of pierce.
      const pitch = field.root + tone + (isBowl ? 12 : 24);

      events.push({
        id: `zen:bell:${this.counter}`,
        type: 'bell',
        startTime: origin + emitAt,
        duration: lerp(5, 18, p.eventDuration) * (isBowl ? 1.35 : 1),
        instrument: isBowl ? 'bowl' : 'bell',
        pitch,
        velocity: clamp((0.28 + p.presence * 0.22 + b * 0.14) * macro.brightness, 0.02, 1),
        pan: this.rng.range(-1, 1) * (0.12 + p.stereoMovement * 0.38),
        parameters: {
          attack: lerp(0.02, 0.18, 1 - p.presence),
          detune: 4,
          // Sympathetic excitation: the bell lights up the drone (§76.7).
          exciteBus: 'drone',
          excite: 0.25 + p.presence * 0.35,
        },
        metadata: { sourcePlugin: 'zen', role: isBowl ? 'bowl' : 'bell', section: '' },
      });
      this.counter++;

      const gap = this.gap(p, b, macro.density);
      if (gap > 6) {
        events.push(SilenceGenerator.marker(`zen:sil:${this.counter++}`, origin + emitAt, gap));
      }
      this.lastGap = gap;
      this.cursor = emitAt + gap;
    }
    return events;
  }

  private lastGap = 12;

  private gap(p: BellParams, breathValue: number, macroDensity: number): number {
    const raw = SilenceGenerator.gap(this.rng, p, breathValue) * lerp(1.2, 0.55, p.melodicDensity);
    // Macro arc stretches the silences as density falls (§76.8).
    return raw / clamp(macroDensity, 0.15, 1.3);
  }
}
