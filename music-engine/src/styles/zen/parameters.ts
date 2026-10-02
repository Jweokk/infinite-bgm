import type { ParameterDefinition } from '../../core/types';
import { PURPOSE_OPTIONS } from '../../time/MacroArc';

export function zenParameters(): ParameterDefinition[] {
  return [
    { id: 'stillness', name: '宁静', type: 'range', min: 0, max: 1, step: 0.01, default: 0.8, category: 'basic', percent: true },
    { id: 'presence', name: '临在', type: 'range', min: 0, max: 1, step: 0.01, default: 0.3, category: 'basic', percent: true },
    { id: 'warmth', name: '温暖', type: 'range', min: 0, max: 1, step: 0.01, default: 0.6, category: 'basic', percent: true },
    { id: 'space', scope: 'fx', name: '空间', type: 'range', min: 0, max: 1, step: 0.01, default: 0.8, category: 'basic', percent: true },
    { id: 'nature', name: '自然', type: 'range', min: 0, max: 1, step: 0.01, default: 0.4, category: 'basic', percent: true },
    { id: 'breath', name: '呼吸', type: 'range', min: 0, max: 1, step: 0.01, default: 0.5, category: 'basic', percent: true },
    { id: 'shimmer', scope: 'fx', name: '微光', type: 'range', min: 0, max: 1, step: 0.01, default: 0.3, category: 'basic', percent: true },
    {
      id: 'sessionPurpose',
      name: '聆听目的',
      type: 'select',
      default: 'flow',
      options: [...PURPOSE_OPTIONS],
      category: 'basic',
    },
    { id: 'harmonicDensity', name: '和声密度', type: 'range', min: 0, max: 1, step: 0.01, default: 0.35, category: 'advanced', percent: true },
    { id: 'melodicDensity', name: '钟声密度', type: 'range', min: 0, max: 1, step: 0.01, default: 0.3, category: 'advanced', percent: true },
    { id: 'textureDensity', name: '纹理密度', type: 'range', min: 0, max: 1, step: 0.01, default: 0.4, category: 'advanced', percent: true },
    { id: 'eventDuration', name: '事件时长', type: 'range', min: 0, max: 1, step: 0.01, default: 0.6, category: 'advanced', percent: true },
    { id: 'silenceDensity', name: '留白密度', type: 'range', min: 0, max: 1, step: 0.01, default: 0.7, category: 'advanced', percent: true },
    { id: 'reverbDecay', scope: 'fx', name: '混响衰减', type: 'range', min: 0, max: 1, step: 0.01, default: 0.8, category: 'advanced', percent: true },
    { id: 'stereoMovement', scope: 'fx', name: '声场漂移', type: 'range', min: 0, max: 1, step: 0.01, default: 0.5, category: 'advanced', percent: true },
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
