import type { SeededRandom } from '../../core/SeededRandom';
import type { BeatTimeModel } from '../../time/BeatTimeModel';
import { degreeToMidi } from '../../core/music/Theory';
import type { ChordSpec } from './HarmonyGenerator';

interface BassNote {
  t: number;
  d: number;
  /** Semitone offset from the chord root. */
  interval: number;
  approach?: boolean;
}

const PATTERNS: { maxEnergy: number; notes: BassNote[] }[] = [
  { maxEnergy: 0.3, notes: [{ t: 0, d: 3.8, interval: 0 }] },
  {
    maxEnergy: 0.55,
    notes: [
      { t: 0, d: 1.9, interval: 0 },
      { t: 2, d: 1.9, interval: 7 },
    ],
  },
  {
    maxEnergy: 0.8,
    notes: [
      { t: 0, d: 0.95, interval: 0 },
      { t: 1, d: 0.9, interval: 0 },
      { t: 2, d: 0.45, interval: 7 },
      { t: 2.5, d: 1.4, interval: 0 },
    ],
  },
  {
    maxEnergy: 1.01,
    notes: [
      { t: 0, d: 0.9, interval: 0 },
      { t: 1, d: 0.9, interval: 12 },
      { t: 2, d: 0.45, interval: 7 },
      { t: 2.5, d: 0.45, interval: 4 },
      { t: 3, d: 0.7, interval: 0 },
      { t: 3.5, d: 0.45, interval: 0, approach: true },
    ],
  },
];

/**
 * Bass lines built from root / third / fifth / octave with passing notes into
 * the next chord, density driven by energy (PRD §19).
 */
export class BassGenerator {
  generateBar(
    barAbs: number,
    rng: SeededRandom,
    beatModel: BeatTimeModel,
    chord: ChordSpec,
    rootMidi: number,
    scale: number[],
    nextChord: ChordSpec,
    opts: { energy: number; density: number; swing: number },
  ): { time: number; duration: number; pitch: number; velocity: number }[] {
    let pattern = PATTERNS[PATTERNS.length - 1];
    for (const p of PATTERNS) {
      if (opts.energy <= p.maxEnergy) {
        pattern = p;
        break;
      }
    }
    const beat = beatModel.secPerBeat;
    const swingBeats = (t: number) => {
      const frac = t % 1;
      if (frac === 0) return 0;
      return frac === 0.5 ? opts.swing - 0.5 : (opts.swing - 0.5) * 0.45;
    };
    const rootBass = this.bassRegister(degreeToMidi(rootMidi, scale, chord.degree));
    const nextRootBass = this.bassRegister(degreeToMidi(rootMidi, scale, nextChord.degree));

    const out: { time: number; duration: number; pitch: number; velocity: number }[] = [];
    for (const n of pattern.notes) {
      // Density thinning for optional notes (everything except the downbeat).
      if (n.t > 0 && n.approach !== true && rng.chance(Math.max(0, 0.75 - opts.density * 0.9))) continue;
      let pitch = rootBass + n.interval;
      let velocity = 0.55 + opts.energy * 0.15;
      if (n.approach) {
        // Chromatic approach into the next chord's root.
        const diff = nextRootBass - (rootBass + 0);
        pitch = nextRootBass + (diff >= 0 ? -1 : 1);
        velocity = 0.42;
      }
      out.push({
        time: barAbs + (n.t + swingBeats(n.t)) * beat,
        duration: Math.max(0.1, n.d * beat * 0.92),
        pitch,
        velocity,
      });
    }
    return out;
  }

  private bassRegister(midi: number): number {
    let m = midi - 12;
    while (m > 45) m -= 12;
    while (m < 33) m += 12;
    return m;
  }
}
