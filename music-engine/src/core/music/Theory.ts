/**
 * Shared music theory helpers (scales, chords, voicing).
 * Cross-style generic capability — lives in core per PRD rule 7.
 */

export const NOTE_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'] as const;
export type NoteName = (typeof NOTE_NAMES)[number];

export const SCALES: Record<string, number[]> = {
  major: [0, 2, 4, 5, 7, 9, 11],
  minor: [0, 2, 3, 5, 7, 8, 10],
  dorian: [0, 2, 3, 5, 7, 9, 10],
  mixolydian: [0, 2, 4, 5, 7, 9, 10],
};

export const CHORD_TYPES: Record<string, number[]> = {
  maj7: [0, 4, 7, 11],
  m7: [0, 3, 7, 10],
  m9: [0, 3, 7, 10, 14],
  maj9: [0, 4, 7, 11, 14],
  '7': [0, 4, 7, 10],
  sus2: [0, 2, 7],
  sus4: [0, 5, 7],
  '6': [0, 4, 7, 9],
  add9: [0, 4, 7, 14],
  min: [0, 3, 7],
  maj: [0, 4, 7],
};

export function noteNameToPc(name: string): number {
  const idx = NOTE_NAMES.indexOf(name.toUpperCase() as NoteName);
  return idx < 0 ? 0 : idx;
}

export function midiToFreq(midi: number): number {
  return 440 * Math.pow(2, (midi - 69) / 12);
}

export function midiToName(midi: number): string {
  const m = Math.round(midi);
  return `${NOTE_NAMES[((m % 12) + 12) % 12]}${Math.floor(m / 12) - 1}`;
}

/** Root MIDI for a key around C3 (48). */
export function keyRootMidi(key: string): number {
  return 48 + noteNameToPc(key);
}

/** Map a (possibly negative / out-of-octave) scale degree to a MIDI note. */
export function degreeToMidi(rootMidi: number, scale: number[], degree: number): number {
  const len = scale.length;
  const oct = Math.floor(degree / len);
  const idx = ((degree % len) + len) % len;
  return rootMidi + oct * 12 + scale[idx];
}

export function chordMidis(degree: number, type: string, rootMidi: number, scale: number[]): number[] {
  const root = degreeToMidi(rootMidi, scale, degree);
  const intervals = CHORD_TYPES[type] ?? CHORD_TYPES.m7;
  return intervals.map((i) => root + i);
}

export function chordTonesWithOctaves(midis: number[], minMidi: number, maxMidi: number): number[] {
  const out: number[] = [];
  for (const m of midis) {
    for (let n = m - 12; n <= maxMidi; n += 12) {
      if (n >= minMidi) out.push(n);
    }
  }
  return out.sort((a, b) => a - b);
}

/** Nearest member of `pool` to `midi` (wraps across octaves via provided pool). */
export function nearestIn(pool: number[], midi: number): number {
  let best = pool[0];
  let bestDist = Infinity;
  for (const p of pool) {
    const d = Math.abs(p - midi);
    if (d < bestDist) {
      bestDist = d;
      best = p;
    }
  }
  return best;
}

/**
 * Guide-tone candidates (PRD v1.1 §76.3): the 3rd and 7th of a chord, placed
 * near `center` — the two voices that resolve stepwise through a progression.
 */
export function guideToneCandidates(chordMidis: number[], center = 72): number[] {
  const third = chordMidis.length > 1 ? chordMidis[1] : chordMidis[0] + 4;
  const seventh = chordMidis.length > 3 ? chordMidis[3] : chordMidis[chordMidis.length - 1] + 3;
  const place = (m: number) => {
    let n = m;
    while (n < center - 6) n += 12;
    while (n > center + 6) n -= 12;
    return n;
  };
  return [place(third), place(seventh)];
}

/** Snap any midi to the nearest scale tone. */
export function snapToScale(midi: number, rootMidi: number, scale: number[]): number {
  let best = midi;
  let bestDist = Infinity;
  for (let oct = -2; oct <= 3; oct++) {
    for (const step of scale) {
      const candidate = rootMidi + oct * 12 + step;
      const d = Math.abs(candidate - midi);
      if (d < bestDist) {
        bestDist = d;
        best = candidate;
      }
    }
  }
  return best;
}

export function clamp(v: number, min: number, max: number): number {
  return v < min ? min : v > max ? max : v;
}

export function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}
