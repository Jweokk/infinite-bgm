/**
 * Beat time model (PRD §9.1) — Lofi / Jazzhop / hip-hop styles.
 * Converts BPM + bar/step grids into seconds, applying swing.
 */
export class BeatTimeModel {
  constructor(
    private readonly getBpm: () => number,
    public readonly beatsPerBar = 4,
  ) {}

  get secPerBeat(): number {
    return 60 / this.getBpm();
  }

  get barDuration(): number {
    return this.secPerBeat * this.beatsPerBar;
  }

  get stepDuration(): number {
    return this.secPerBeat / 4; // 16th notes
  }

  /**
   * Swing: `ratio` is the position of the offbeat eighth inside its beat
   * (0.5 = straight, 0.58 = the PRD default lofi feel).
   */
  swingOffset(stepIndex: number, ratio: number): number {
    const off8 = (ratio - 0.5) * this.secPerBeat; // eighth-note offbeats
    if (stepIndex % 4 === 2) return off8;
    if (stepIndex % 2 === 1) return off8 * 0.45; // 16th offbeats swing less
    return 0;
  }

  stepTime(barStart: number, stepIndex: number, swing = 0.5): number {
    return barStart + stepIndex * this.stepDuration + this.swingOffset(stepIndex, swing);
  }
}
