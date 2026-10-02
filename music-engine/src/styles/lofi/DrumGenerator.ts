import type { SeededRandom } from '../../core/SeededRandom';
import type { BeatTimeModel } from '../../time/BeatTimeModel';

export interface DrumKit {
  kick: number[];
  kickOpt: number[];
  snare: number[];
  ghost: number[];
  hat16: boolean;
  open: number[];
}

/** At least 4 patterns per PRD §20. */
export const DRUM_KITS: DrumKit[] = [
  {
    // Classic boom-bap
    kick: [0, 10],
    kickOpt: [6, 14],
    snare: [4, 12],
    ghost: [7, 15],
    hat16: false,
    open: [14],
  },
  {
    // Lazy head-nod
    kick: [0, 11],
    kickOpt: [7],
    snare: [4, 12],
    ghost: [9],
    hat16: false,
    open: [6],
  },
  {
    // Bouncy
    kick: [0, 6, 10],
    kickOpt: [13],
    snare: [4, 12],
    ghost: [7, 9],
    hat16: false,
    open: [14],
  },
  {
    // Busy / pushed
    kick: [0, 6, 10],
    kickOpt: [3, 13],
    snare: [4, 12],
    ghost: [2, 7, 9, 15],
    hat16: true,
    open: [6, 14],
  },
];

export interface DrumHit {
  time: number;
  instrument: 'kick' | 'snare' | 'hat';
  velocity: number;
  duration: number;
  open: boolean;
  ghost: boolean;
}

/**
 * 16-step drum patterns combined by seed + energy + drum density
 * (PRD §20/§21), with swung offbeats and humanization applied by the caller.
 */
export class DrumGenerator {
  chooseKit(rng: SeededRandom, energy: number): number {
    if (energy < 0.35) return rng.chance(0.7) ? 1 : 0;
    if (energy < 0.6) return rng.chance(0.7) ? 0 : 2;
    if (energy < 0.8) return rng.chance(0.7) ? 2 : 3;
    return 3;
  }

  generateBar(
    barAbs: number,
    rng: SeededRandom,
    beatModel: BeatTimeModel,
    kit: DrumKit,
    barIndexInSection: number,
    opts: { density: number; energy: number; swing: number },
  ): DrumHit[] {
    const hits: DrumHit[] = [];
    const stepTime = (step: number) => beatModel.stepTime(barAbs, step, opts.swing);

    const fill = barIndexInSection % 8 === 7 && opts.energy > 0.45;

    for (let step = 0; step < 16; step++) {
      // --- kick
      if (kit.kick.includes(step) && rng.chance(0.96)) {
        hits.push({ time: stepTime(step), instrument: 'kick', velocity: 0.85 + opts.energy * 0.15, duration: 0.3, open: false, ghost: false });
      } else if (kit.kickOpt.includes(step) && rng.chance(opts.density * 0.55)) {
        hits.push({ time: stepTime(step), instrument: 'kick', velocity: 0.6, duration: 0.25, open: false, ghost: false });
      }

      // --- snare / ghosts
      if (kit.snare.includes(step)) {
        hits.push({ time: stepTime(step), instrument: 'snare', velocity: 0.75 + opts.energy * 0.15, duration: 0.16, open: false, ghost: false });
      } else if (kit.ghost.includes(step) && rng.chance(opts.density * 0.3)) {
        hits.push({ time: stepTime(step), instrument: 'snare', velocity: 0.3, duration: 0.08, open: false, ghost: true });
      }

      // --- hats
      const isGrid = kit.hat16 ? true : step % 2 === 0;
      if (isGrid && !kit.open.includes(step)) {
        const accent = step % 4 === 0;
        const vel = accent ? 0.5 : 0.34;
        const prob = kit.hat16 && step % 2 === 1 ? opts.density * 0.6 : 0.92;
        if (rng.chance(prob)) {
          hits.push({ time: stepTime(step), instrument: 'hat', velocity: vel, duration: 0.06, open: false, ghost: false });
        }
      }
      if (kit.open.includes(step) && rng.chance(0.4 + opts.density * 0.35)) {
        hits.push({ time: stepTime(step), instrument: 'hat', velocity: 0.42, duration: 0.3, open: true, ghost: false });
      }
    }

    // Simple end-of-phrase fill: crescendo ghosts over the last 3 16ths.
    if (fill) {
      for (let k = 0; k < 3; k++) {
        const step = 13 + k;
        if (kit.snare.includes(step)) continue;
        hits.push({
          time: stepTime(step),
          instrument: 'snare',
          velocity: 0.3 + k * 0.14,
          duration: 0.09,
          open: false,
          ghost: true,
        });
      }
    }

    return hits;
  }
}
