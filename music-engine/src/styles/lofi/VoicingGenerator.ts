/**
 * Piano voicing with inversions, rootless variants, octave displacement and
 * voice leading toward the previous chord (PRD §17): pick the candidate
 * whose total movement from the previous voicing is smallest.
 */

const LOW = 52;
const HIGH = 84;

function normalize(midis: number[]): number[] {
  const out = midis.map((m) => {
    let n = m;
    while (n < LOW) n += 12;
    while (n > HIGH) n -= 12;
    return n;
  });
  return [...new Set(out)].sort((a, b) => a - b);
}

function inversions(midis: number[]): number[][] {
  const sorted = [...midis].sort((a, b) => a - b);
  const results: number[][] = [];
  let current = sorted;
  for (let i = 0; i < sorted.length; i++) {
    results.push(current);
    current = [...current.slice(1), current[0] + 12]; // rotate lowest up an octave
  }
  return results;
}

export function voicingCost(candidate: number[], previous: number[]): number {
  if (!previous.length) return 0;
  const a = [...candidate].sort((x, y) => x - y);
  const b = [...previous].sort((x, y) => x - y);
  const n = Math.min(a.length, b.length);
  let cost = 0;
  for (let i = 0; i < n; i++) cost += Math.abs(a[a.length - n + i] - b[b.length - n + i]);
  cost += Math.abs(a.length - b.length) * 4; // size-change penalty
  return cost;
}

export class VoicingGenerator {
  /**
   * Choose the best voicing for `chordMidis` given the previous one. When a
   * `guideTone` is provided (v1.1 §76.3), voicings whose top note sits near
   * it get a cost bonus, so the guide line stays audible in the upper voice.
   */
  voice(chordMidis: number[], previous: number[], guideTone?: number): number[] {
    const base = normalize(chordMidis);
    if (!previous.length) {
      // Center the first voicing around the middle register.
      const shifted = base.map((m) => (m < 60 ? m + 12 : m));
      return [...shifted].sort((a, b) => a - b);
    }

    const candidates: number[][] = [];
    for (const inv of inversions(base)) candidates.push(normalize(inv));
    // Rootless variant (bass covers the root).
    if (base.length >= 4) {
      for (const inv of inversions(base.slice(1))) candidates.push(normalize(inv));
    }
    // Octave displacement of the top note.
    for (const inv of inversions(base)) {
      const up = [...inv];
      up[up.length - 1] += 12;
      candidates.push(normalize(up));
    }

    const guided = guideTone !== undefined && Number.isFinite(guideTone);
    let best = candidates[0];
    let bestCost = Infinity;
    for (const c of candidates) {
      let cost = voicingCost(c, previous);
      if (guided && c.length) {
        const top = c[c.length - 1];
        const d = Math.abs(top - guideTone!);
        if (d <= 2) cost -= 2.5;
        else cost += Math.min(3, d * 0.15);
      }
      if (cost < bestCost) {
        bestCost = cost;
        best = c;
      }
    }
    return best;
  }
}
