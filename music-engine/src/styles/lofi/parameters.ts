import type { ParameterDefinition } from '../../core/types';
import { NOTE_NAMES } from '../../core/music/Theory';
import { PURPOSE_OPTIONS } from '../../time/MacroArc';

export function lofiParameters(): ParameterDefinition[] {
  return [
    { id: 'bpm', name: 'BPM', type: 'range', min: 60, max: 110, step: 1, default: 78, category: 'basic', unit: 'bpm' },
    {
      id: 'key',
      name: '调性',
      type: 'select',
      default: 'C',
      options: NOTE_NAMES.map((n) => ({ value: n, label: n })),
      category: 'basic',
    },
    {
      id: 'scale',
      name: '音阶',
      type: 'select',
      default: 'minor',
      options: [
        { value: 'minor', label: '自然小调' },
        { value: 'dorian', label: '多利亚' },
        { value: 'major', label: '大调' },
        { value: 'mixolydian', label: '混合利亚' },
      ],
      category: 'basic',
    },
    { id: 'energy', name: '能量', type: 'range', min: 0, max: 1, step: 0.01, default: 0.45, category: 'basic', percent: true },
    { id: 'mood', name: '情绪', type: 'range', min: 0, max: 1, step: 0.01, default: 0.4, category: 'basic', percent: true },
    { id: 'swing', name: '摇摆', type: 'range', min: 0.5, max: 0.72, step: 0.005, default: 0.58, category: 'basic', percent: false },
    { id: 'sidechain', name: '侧链泵动', type: 'range', min: 0, max: 1, step: 0.01, default: 0.5, category: 'basic', percent: true },
    {
      id: 'sessionPurpose',
      name: '聆听目的',
      type: 'select',
      default: 'flow',
      options: [...PURPOSE_OPTIONS],
      category: 'basic',
    },
    { id: 'harmonyDensity', name: '和声密度', type: 'range', min: 0, max: 1, step: 0.01, default: 0.6, category: 'basic', percent: true },
    { id: 'melodyDensity', name: '旋律密度', type: 'range', min: 0, max: 1, step: 0.01, default: 0.5, category: 'basic', percent: true },
    { id: 'drumDensity', name: '鼓密度', type: 'range', min: 0, max: 1, step: 0.01, default: 0.7, category: 'basic', percent: true },
    { id: 'reverb', scope: 'fx', name: '混响', type: 'range', min: 0, max: 1, step: 0.01, default: 0.35, category: 'basic', percent: true },
    { id: 'tape', scope: 'fx', name: '磁带', type: 'range', min: 0, max: 1, step: 0.01, default: 0.4, category: 'basic', percent: true },
    { id: 'vinyl', scope: 'fx', name: '黑胶', type: 'range', min: 0, max: 1, step: 0.01, default: 0.3, category: 'basic', percent: true },
    { id: 'humanization', name: '人性化', type: 'range', min: 0, max: 1, step: 0.01, default: 0.5, category: 'advanced', percent: true },
    { id: 'tempoDynamics', name: '速度呼吸', type: 'range', min: 0, max: 1, step: 0.01, default: 0.5, category: 'advanced', percent: true },
    {
      id: 'sessionLength',
      name: '睡眠/冥想时长',
      type: 'select',
      default: '30',
      options: [
        { value: '10', label: '10 分钟' },
        { value: '20', label: '20 分钟' },
        { value: '30', label: '30 分钟' },
        { value: '60', label: '60 分钟' },
      ],
      category: 'advanced',
    },
  ];
}
