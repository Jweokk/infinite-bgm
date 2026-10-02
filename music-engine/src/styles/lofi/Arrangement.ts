import type { SeededRandom } from '../../core/SeededRandom';

export interface SectionMods {
  drums: number;
  melody: number;
  bass: number;
  harmony: number;
}

export interface SectionSpec {
  name: string;
  bars: number;
  mods: SectionMods;
  /** Progression variant seed offset for this section. */
  variant: number;
  /** Alternate melody instrument for B sections (empty = main piano). */
  melodyInstrument: string;
  /**
   * Semitone offset for the whole section (v1.1 §76.4): B sections lift the
   * key centre, Outro returns home.
   */
  keyOffset: number;
  tempoRole: 'intro' | 'main' | 'b' | 'outro';
}

const A: SectionMods = { drums: 1, melody: 1, bass: 1, harmony: 1 };
const A_PRIME: SectionMods = { drums: 0.85, melody: 0.8, bass: 1, harmony: 1 };
const B: SectionMods = { drums: 1.1, melody: 1.15, bass: 0.9, harmony: 0.9 };
const INTRO: SectionMods = { drums: 0, melody: 0.35, bass: 0.5, harmony: 0.8 };
const OUTRO: SectionMods = { drums: 0.25, melody: 0.4, bass: 0.6, harmony: 0.7 };

/**
 * Infinite arrangement (PRD §22): Intro, then cycles of A / A' / B / A with
 * seeded variation per cycle, occasional breather "outros" — never an exact
 * loop. Sections run 8–16 bars (intro/outro shorter).
 */
export class Arrangement {
  private queue: SectionSpec[] = [];
  private cycle = 0;

  constructor(private rng: SeededRandom) {}

  next(): SectionSpec {
    if (this.queue.length === 0) this.planCycle();
    return this.queue.shift()!;
  }

  /**
   * Look at the section after the current one without consuming it (needed
   * for turnarounds that target the next section's key). The active section
   * has already been popped, so the next one is queue[0]. Planning ahead is
   * deterministic: cycle n is always planned from fork(`cycle:n`).
   */
  peekNext(): SectionSpec {
    while (this.queue.length === 0) this.planCycle();
    return this.queue[0];
  }

  private planCycle(): void {
    const rng = this.rng.fork(`cycle:${this.cycle}`);
    const bars = () => rng.int(8, 16);
    const push = (spec: SectionSpec) => this.queue.push(spec);

    if (this.cycle === 0) {
      push({ name: 'Intro', bars: rng.int(4, 6), mods: INTRO, variant: 0, melodyInstrument: '', keyOffset: 0, tempoRole: 'intro' });
    } else if (this.cycle % 3 === 2) {
      // Occasional breather between cycles.
      push({ name: 'Outro', bars: rng.int(4, 8), mods: OUTRO, variant: 3, melodyInstrument: '', keyOffset: 0, tempoRole: 'outro' });
    }

    const bUsesPluck = rng.chance(0.5);
    // B-section modulation (v1.1 §76.4): lift or drop the key centre.
    const bOffset = rng.pick([3, 5, -4]);
    push({ name: 'A', bars: bars(), mods: A, variant: this.cycle * 4 + 0, melodyInstrument: '', keyOffset: 0, tempoRole: 'main' });
    push({ name: "A'", bars: bars(), mods: A_PRIME, variant: this.cycle * 4 + 1, melodyInstrument: '', keyOffset: 0, tempoRole: 'main' });
    push({ name: 'B', bars: bars(), mods: B, variant: this.cycle * 4 + 2, melodyInstrument: bUsesPluck ? 'pluck' : '', keyOffset: bOffset, tempoRole: 'b' });
    push({ name: 'A', bars: Math.max(8, bars() - 2), mods: A, variant: this.cycle * 4 + 3, melodyInstrument: '', keyOffset: 0, tempoRole: 'main' });

    this.cycle++;
  }
}
