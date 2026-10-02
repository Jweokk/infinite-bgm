import { describe, expect, it } from 'vitest';
import {
  CHORD_TYPES,
  SCALES,
  chordMidis,
  degreeToMidi,
  keyRootMidi,
  midiToFreq,
  midiToName,
  snapToScale,
} from '../../src/core/music/Theory';
import { voicingCost } from '../../src/styles/lofi/VoicingGenerator';

describe('Theory', () => {
  it('key root maps around C3', () => {
    expect(keyRootMidi('C')).toBe(48);
    expect(keyRootMidi('A')).toBe(57);
    expect(keyRootMidi('B')).toBe(59);
  });

  it('degreeToMidi wraps across octaves', () => {
    const scale = SCALES.minor;
    expect(degreeToMidi(48, scale, 0)).toBe(48);
    expect(degreeToMidi(48, scale, 7)).toBe(60); // one octave up
    expect(degreeToMidi(48, scale, -7)).toBe(36); // one octave down
    expect(degreeToMidi(48, scale, 1)).toBe(50); // second degree
  });

  it('chordMidis builds stacked chords', () => {
    const root = 48;
    const scale = SCALES.minor;
    const m7 = chordMidis(0, 'm7', root, scale);
    expect(m7).toEqual([48, 51, 55, 58]);
    const maj9 = chordMidis(3, 'maj9', 48, SCALES.dorian);
    // degree 3 of dorian = F#... (48 + 5 = 53)
    expect(maj9[0]).toBe(53);
    expect(maj9).toHaveLength(5);
  });

  it('all documented chord types exist', () => {
    for (const t of ['maj7', 'm7', 'm9', 'maj9', '7', 'sus2', 'sus4', '6']) {
      expect(CHORD_TYPES[t]).toBeDefined();
    }
  });

  it('midiToFreq / midiToName', () => {
    expect(midiToFreq(69)).toBeCloseTo(440, 5);
    expect(midiToName(60)).toBe('C4');
    expect(midiToName(69)).toBe('A4');
  });

  it('snapToScale finds the nearest scale member', () => {
    expect(snapToScale(62, 48, SCALES.major)).toBe(62); // D in C major
    expect(snapToScale(61, 48, SCALES.major)).toBe(60); // C# snaps to C
  });

  it('voicing cost grows with movement', () => {
    const prev = [60, 64, 67];
    expect(voicingCost([60, 64, 67], prev)).toBe(0);
    expect(voicingCost([62, 65, 69], prev)).toBeGreaterThan(0);
    expect(voicingCost([72, 76, 79], prev)).toBeGreaterThan(voicingCost([62, 65, 69], prev));
  });
});
