import type { Preset } from '../../core/types';

export function zenPresets(): Preset[] {
  return [
    {
      id: 'deep-stillness',
      name: 'Deep Stillness',
      parameters: { stillness: 0.95, presence: 0.15, warmth: 0.7, space: 0.95, nature: 0.15, breath: 0.35, shimmer: 0.2, harmonicDensity: 0.25, melodicDensity: 0.15, textureDensity: 0.2, eventDuration: 0.85, silenceDensity: 0.9, reverbDecay: 0.95, stereoMovement: 0.45 },
    },
    {
      id: 'morning-zen',
      name: 'Morning Zen',
      parameters: { stillness: 0.7, presence: 0.4, warmth: 0.65, space: 0.8, nature: 0.45, breath: 0.55, shimmer: 0.3, harmonicDensity: 0.4, melodicDensity: 0.35, textureDensity: 0.4, eventDuration: 0.6, silenceDensity: 0.65, reverbDecay: 0.75, stereoMovement: 0.5 },
    },
    {
      id: 'temple',
      name: 'Temple',
      parameters: { stillness: 0.85, presence: 0.3, warmth: 0.75, space: 0.9, nature: 0.1, breath: 0.45, shimmer: 0.25, harmonicDensity: 0.35, melodicDensity: 0.3, textureDensity: 0.15, eventDuration: 0.75, silenceDensity: 0.8, reverbDecay: 0.9, stereoMovement: 0.4 },
    },
    {
      id: 'forest',
      name: 'Forest',
      parameters: { stillness: 0.65, presence: 0.45, warmth: 0.55, space: 0.75, nature: 0.85, breath: 0.6, shimmer: 0.2, harmonicDensity: 0.35, melodicDensity: 0.3, textureDensity: 0.7, eventDuration: 0.6, silenceDensity: 0.55, reverbDecay: 0.7, stereoMovement: 0.65 },
    },
    {
      id: 'water',
      name: 'Water',
      parameters: { stillness: 0.6, presence: 0.5, warmth: 0.5, space: 0.85, nature: 0.9, breath: 0.55, shimmer: 0.35, harmonicDensity: 0.3, melodicDensity: 0.35, textureDensity: 0.65, eventDuration: 0.55, silenceDensity: 0.5, reverbDecay: 0.8, stereoMovement: 0.6 },
    },
    {
      id: 'night-meditation',
      name: 'Night Meditation',
      parameters: { stillness: 0.9, presence: 0.25, warmth: 0.8, space: 0.9, nature: 0.25, breath: 0.3, shimmer: 0.15, harmonicDensity: 0.3, melodicDensity: 0.2, textureDensity: 0.3, eventDuration: 0.8, silenceDensity: 0.85, reverbDecay: 0.9, stereoMovement: 0.35 },
    },
  ];
}
