import { describe, expect, it } from 'vitest';
import { PluginRegistry } from '../../src/core/PluginRegistry';
import type { StylePlugin } from '../../src/core/types';

const fakePlugin = (id: string): StylePlugin => ({
  id,
  name: id,
  version: '1.0.0',
  description: '',
  timeMode: 'beat',
  tags: [],
  color: '#fff',
  parameters: [{ id: 'p', name: 'P', type: 'range', min: 0, max: 1, default: 0.5 }],
  presets: [],
  create: () => {
    throw new Error('not needed');
  },
});

describe('PluginRegistry', () => {
  it('registers and lists styles', () => {
    const r = new PluginRegistry();
    r.register(fakePlugin('lofi'));
    r.register(fakePlugin('zen'));
    expect(r.list().map((p) => p.id)).toEqual(['lofi', 'zen']);
    expect(r.infos().map((i) => i.id)).toEqual(['lofi', 'zen']);
  });

  it('rejects duplicate ids', () => {
    const r = new PluginRegistry();
    r.register(fakePlugin('lofi'));
    expect(() => r.register(fakePlugin('lofi'))).toThrow();
  });

  it('unregisters', () => {
    const r = new PluginRegistry();
    r.register(fakePlugin('lofi'));
    expect(r.unregister('lofi')).toBe(true);
    expect(r.get('lofi')).toBeUndefined();
  });
});
