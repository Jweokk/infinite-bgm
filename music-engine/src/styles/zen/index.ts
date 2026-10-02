import type { StylePlugin } from '../../core/types';
import { ZenStyle } from './ZenStyle';
import { zenParameters } from './parameters';
import { zenPresets } from './presets';

export const zenPlugin: StylePlugin = {
  id: 'zen',
  name: 'Zen',
  version: '1.0.0',
  description: '禅意声音景观：长音 Drone、颂钵钟铃、大量留白与缓慢呼吸的空间感。',
  timeMode: 'free',
  tags: ['zen', 'ambient', 'meditation', 'soundscape'],
  color: '#7fd4c1',
  parameters: zenParameters(),
  presets: zenPresets(),
  requiredInstruments: ['drone', 'bell', 'bowl', 'noise-texture'],
  optionalInstruments: ['pluck'],
  requiredFX: ['reverb'],
  optionalFX: ['shimmer', 'stereo', 'eq', 'delay'],
  create: ({ seed, parameters }) => new ZenStyle(seed, parameters),
};

export default zenPlugin;
