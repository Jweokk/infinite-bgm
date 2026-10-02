import type { SeededRandom } from '../../core/SeededRandom';
import type { BeatTimeModel } from '../../time/BeatTimeModel';
import { chordTonesWithOctaves, degreeToMidi, lerp, nearestIn } from '../../core/music/Theory';
import type { ChordSpec } from './HarmonyGenerator';

interface MotifNote {
  /** Beat offset inside the (1–2 bar) motif. */
  t: number;
  d: number;
  /** Scale-degree offset relative to the current chord's root degree. */
  contour: number;
  strong: boolean;
}

interface Motif {
  notes: MotifNote[];
  bars: number;
}

const RHYTHM_POOLS: number[][][] = [
  [
    [0, 0.5],
    [0.5, 0.5],
    [1, 1],
    [2, 0.5],
    [2.5, 0.5],
    [3, 1],
  ],
  [
    [0, 1],
    [1.5, 0.5],
    [2, 1],
    [3.5, 0.5],
  ],
  [
    [0.5, 0.75],
    [1.5, 0.5],
    [2.5, 1],
  ],
  [
    [0, 0.5],
    [1, 0.5],
    [1.5, 0.5],
    [2, 2],
  ],
  [
    [0, 1.5],
    [2, 0.5],
    [2.5, 0.5],
    [3, 0.5],
  ],
];

export interface MelodyNote {
  time: number;
  duration: number;
  pitch: number;
  velocity: number;
}

/**
 * Motif-based melody (PRD §18): a generated motif is repeated with
 * variations (transpose / invert / thin / octave), pitches resolve to chord
 * tones on strong beats and scale tones elsewhere, offbeat eighths swing.
 */
export class MelodyGenerator {
  private motif: Motif | null = null;
  private motifBar = 0;
  private prevPitch = 74;
  private variationCount = 0;

  reset(): void {
    this.motif = null;
    this.motifBar = 0;
  }

  private buildMotif(rng: SeededRandom, energy: number): Motif {
    const bars = rng.chance(0.35) ? 2 : 1;
    const pool = RHYTHM_POOLS[rng.int(0, RHYTHM_POOLS.length - 1)];
    const noteCount = Math.max(2, Math.round(pool.length * lerp(0.6, 1, energy)));
    const notes: MotifNote[] = [];
    let contour = rng.int(-2, 2);
    for (let i = 0; i < noteCount; i++) {
      const [t, d] = pool[i % pool.length];
      const barOffset = bars === 2 && i >= Math.ceil(noteCount / 2) ? 4 : 0;
      notes.push({
        t: (bars === 2 ? t % 4 : t) + barOffset,
        d,
        contour,
        strong: Math.round(t) === t,
      });
      contour += rng.pick([-2, -1, 1, 1, 2]);
      contour = Math.max(-4, Math.min(5, contour));
    }
    return { notes, bars };
  }

  private vary(motif: Motif, rng: SeededRandom): Motif {
    const notes = motif.notes.map((n) => ({ ...n }));
    const op = rng.int(0, 3);
    if (op === 0) {
      const shift = rng.pick([-2, -1, 1, 2, 3]);
      for (const n of notes) n.contour = Math.max(-5, Math.min(6, n.contour + shift));
    } else if (op === 1) {
      for (const n of notes) n.contour = -n.contour;
    } else if (op === 2 && notes.length > 2) {
      notes.splice(rng.int(1, notes.length - 2), 1);
    } else {
      const shift = rng.pick([-7, 7]);
      for (const n of notes) n.contour += shift;
    }
    if (rng.chance(0.4) && notes.length > 0) {
      notes[notes.length - 1].contour += rng.pick([-1, 0, 1]);
    }
    this.variationCount++;
    return { notes, bars: motif.bars };
  }

  generateBar(
    barAbs: number,
    rng: SeededRandom,
    beatModel: BeatTimeModel,
    chord: ChordSpec,
    rootMidi: number,
    scale: number[],
    opts: { density: number; energy: number; swing: number; guideTone?: number; chordChanged?: boolean },
  ): MelodyNote[] {
    const beat = beatModel.secPerBeat;

    if (!this.motif) {
      // Phrase breathing: sometimes rest a bar before a new motif.
      if (rng.chance(Math.max(0.15, 0.55 - opts.density * 0.5))) return [];
      this.motif = this.buildMotif(rng, opts.energy);
      this.motifBar = 0;
    }
    if (this.motifBar >= this.motif.bars) {
      if (rng.chance(0.3) || this.variationCount > 3) {
        this.motif = null;
        this.variationCount = 0;
        return [];
      }
      this.motif = this.vary(this.motif, rng);
      this.motifBar = 0;
    }

    const chordTones = chordTonesWithOctaves(
      [0, 3, 7, 10].map((i) => degreeToMidi(rootMidi, scale, chord.degree) + i),
      65,
      88,
    );

    const out: MelodyNote[] = [];
    const barBeatOffset = this.motifBar * 4;
    for (const n of this.motif.notes) {
      if (n.t < barBeatOffset || n.t >= barBeatOffset + 4) continue;
      const localBeat = n.t - barBeatOffset;
      let midi = degreeToMidi(rootMidi, scale, chord.degree + n.contour);
      // Guide-tone resolution (v1.1 §76.3): on the downbeat of a fresh chord,
      // the melody prefers to land on the guide tone (3rd/7th).
      if (n.strong && localBeat === 0 && opts.chordChanged && opts.guideTone !== undefined) {
        let g = opts.guideTone;
        while (g - this.prevPitch > 9) g -= 12;
        while (this.prevPitch - g > 9) g += 12;
        midi = nearestIn(chordTones, g);
      } else if (n.strong) {
        midi = nearestIn(chordTones, midi);
      }
      while (midi - this.prevPitch > 9) midi -= 12;
      while (this.prevPitch - midi > 9) midi += 12;
      midi = Math.max(64, Math.min(88, midi));
      this.prevPitch = midi;

      // Swing like the drums: full swing on 8th offbeats, partial on 16ths.
      const frac = localBeat % 1;
      const swingBeats = frac === 0 ? 0 : frac === 0.5 ? opts.swing - 0.5 : (opts.swing - 0.5) * 0.45;
      out.push({
        time: barAbs + (localBeat + swingBeats) * beat,
        duration: Math.max(0.12, n.d * beat * 0.9),
        pitch: midi,
        velocity: (n.strong ? 0.5 : 0.38) + opts.energy * 0.1,
      });
    }
    this.motifBar++;
    return out;
  }
}
