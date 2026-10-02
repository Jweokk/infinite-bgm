import type { StylePlugin } from '../../core/types';
import { LofiStyle } from './LofiStyle';
import { lofiParameters } from './parameters';
import { lofiPresets } from './presets';

export const lofiPlugin: StylePlugin = {
  id: 'lofi',
  name: 'Lofi',
  version: '1.0.0',
  description: '慵懒的 Lofi / Chillhop：爵士和声、boom-bap 鼓组、磁带与黑胶质感。',
  timeMode: 'beat',
  tags: ['lofi', 'chillhop', 'jazzhop', 'beats'],
  color: '#e8a04c',
  parameters: lofiParameters(),
  presets: lofiPresets(),
  requiredInstruments: ['electric-piano', 'bass', 'kick', 'snare', 'hat'],
  optionalInstruments: ['pluck'],
  requiredFX: ['reverb'],
  optionalFX: ['tape', 'vinyl', 'delay', 'eq', 'saturation', 'shimmer', 'stereo'],
  create: ({ seed, parameters }) => new LofiStyle(seed, parameters),
};

export default lofiPlugin;
