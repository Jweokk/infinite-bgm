import type { SeededRandom } from '../../core/SeededRandom';

export interface ChordSpec {
  /** Scale degree index (0 = tonic). */
  degree: number;
  /** Chord type key into CHORD_TYPES. */
  type: string;
}

type Pool = ChordSpec[][];

const MINOR_POOLS: Pool = [
  [
    { degree: 0, type: 'm9' },
    { degree: 3, type: '7' },
    { degree: 6, type: 'maj7' },
    { degree: 4, type: 'm7' },
  ],
  [
    { degree: 0, type: 'm9' },
    { degree: 5, type: 'maj7' },
    { degree: 2, type: 'm7' },
    { degree: 6, type: '7' },
  ],
  [
    { degree: 0, type: 'm7' },
    { degree: 4, type: 'm7' },
    { degree: 3, type: 'm9' },
    { degree: 0, type: 'm9' },
  ],
  [
    { degree: 3, type: 'm9' },
    { degree: 0, type: 'm7' },
    { degree: 5, type: 'maj9' },
    { degree: 6, type: '7' },
  ],
];

const MAJOR_POOLS: Pool = [
  [
    { degree: 1, type: 'm7' },
    { degree: 4, type: '7' },
    { degree: 0, type: 'maj9' },
    { degree: 5, type: 'm7' },
  ],
  [
    { degree: 0, type: 'maj9' },
    { degree: 5, type: 'm7' },
    { degree: 1, type: 'm9' },
    { degree: 4, type: '7' },
  ],
  [
    { degree: 0, type: 'maj7' },
    { degree: 3, type: 'maj7' },
    { degree: 5, type: 'm7' },
    { degree: 1, type: 'm9' },
  ],
  [
    { degree: 0, type: '6' },
    { degree: 3, type: 'maj9' },
    { degree: 1, type: 'm7' },
    { degree: 4, type: '7' },
  ],
];

/**
 * Chooses jazz-flavoured progressions from the seed + mood + scale
 * (PRD §16): never a single fixed loop, sus chords sprinkled in as color.
 */
export class HarmonyGenerator {
  progression(rng: SeededRandom, scaleName: string, mood: number, variant: number): ChordSpec[] {
    const minorish = scaleName === 'minor' || scaleName === 'dorian' || mood < 0.45;
    const pools = minorish ? MINOR_POOLS : MAJOR_POOLS;
    const pool = pools[Math.abs(variant) % pools.length];
    const rotation = rng.int(0, pool.length - 1);
    const out: ChordSpec[] = [];
    for (let i = 0; i < pool.length; i++) {
      const source = pool[(i + rotation) % pool.length];
      let type = source.type;
      // Sus-color substitution on non-tonic chords.
      if (source.degree !== 0 && rng.chance(0.18)) {
        type = rng.pick(['sus2', 'sus4', type]);
      }
      out.push({ degree: source.degree, type });
    }
    return out;
  }
}
