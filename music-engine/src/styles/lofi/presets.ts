import type { Preset } from '../../core/types';

export function lofiPresets(): Preset[] {
  return [
    {
      id: 'late-night',
      name: 'Late Night',
      parameters: { bpm: 72, key: 'D', scale: 'minor', energy: 0.35, mood: 0.3, swing: 0.6, harmonyDensity: 0.5, melodyDensity: 0.4, drumDensity: 0.55, reverb: 0.45, tape: 0.5, vinyl: 0.45, humanization: 0.6 },
    },
    {
      id: 'rainy-cafe',
      name: 'Rainy Cafe',
      parameters: { bpm: 76, key: 'F', scale: 'dorian', energy: 0.5, mood: 0.45, swing: 0.58, harmonyDensity: 0.65, melodyDensity: 0.55, drumDensity: 0.7, reverb: 0.35, tape: 0.4, vinyl: 0.55, humanization: 0.55 },
    },
    {
      id: 'study',
      name: 'Study',
      parameters: { bpm: 80, key: 'C', scale: 'minor', energy: 0.45, mood: 0.4, swing: 0.56, harmonyDensity: 0.6, melodyDensity: 0.4, drumDensity: 0.75, reverb: 0.3, tape: 0.35, vinyl: 0.25, humanization: 0.5 },
    },
    {
      id: 'midnight',
      name: 'Midnight',
      parameters: { bpm: 68, key: 'A', scale: 'minor', energy: 0.3, mood: 0.25, swing: 0.62, harmonyDensity: 0.4, melodyDensity: 0.3, drumDensity: 0.45, reverb: 0.55, tape: 0.55, vinyl: 0.4, humanization: 0.65 },
    },
    {
      id: 'warm-tape',
      name: 'Warm Tape',
      parameters: { bpm: 74, key: 'E', scale: 'mixolydian', energy: 0.5, mood: 0.6, swing: 0.58, harmonyDensity: 0.7, melodyDensity: 0.5, drumDensity: 0.65, reverb: 0.3, tape: 0.75, vinyl: 0.2, humanization: 0.5 },
    },
    {
      id: 'deep-focus',
      name: 'Deep Focus',
      parameters: { bpm: 76, key: 'C', scale: 'dorian', energy: 0.4, mood: 0.45, swing: 0.56, sidechain: 0.4, sessionPurpose: 'focus', harmonyDensity: 0.55, melodyDensity: 0.35, drumDensity: 0.65, reverb: 0.3, tape: 0.4, vinyl: 0.2, humanization: 0.45 },
    },
    {
      id: 'sleep-fade',
      name: 'Sleep Fade',
      parameters: { bpm: 70, key: 'A', scale: 'minor', energy: 0.3, mood: 0.3, swing: 0.6, sidechain: 0.25, sessionPurpose: 'sleep', sessionLength: '20', harmonyDensity: 0.45, melodyDensity: 0.25, drumDensity: 0.4, reverb: 0.5, tape: 0.5, vinyl: 0.15, humanization: 0.6 },
    },
  ];
}
