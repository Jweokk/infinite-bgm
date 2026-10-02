import { describe, expect, it } from 'vitest';
import { MacroArc } from '../../src/time/MacroArc';

describe('MacroArc (v1.1 §76.8)', () => {
  it('flow: a gentle 8-minute arc around 1.0', () => {
    const arc = new MacroArc('flow', 30, 0);
    const v0 = arc.value(0).density;
    const vQuarter = arc.value(120).density; // 2 min = quarter period → peak
    expect(v0).toBeCloseTo(1, 5);
    expect(vQuarter).toBeGreaterThan(1.05);
    const vOpposite = arc.value(360).density; // 6 min → trough
    expect(vOpposite).toBeLessThan(0.92);
  });

  it('focus: stable, slightly reduced salience', () => {
    const arc = new MacroArc('focus');
    const a = arc.value(0);
    const b = arc.value(1800);
    expect(a).toEqual(b);
    expect(a.density).toBeLessThan(1);
    expect(a.brightness).toBeLessThan(1);
  });

  it('sleep: monotonically dissolves toward silence', () => {
    const arc = new MacroArc('sleep', 10);
    const d0 = arc.value(0).density;
    const d3 = arc.value(180).density; // 3 min: halfway down the ramp
    const d7 = arc.value(420).density; // 7 min: hold phase
    const d9_5 = arc.value(570).density; // 9.5 min: fade tail
    expect(d0).toBeCloseTo(1, 5);
    expect(d3).toBeCloseTo(0.7, 5);
    expect(d7).toBeCloseTo(0.4, 5);
    expect(d9_5).toBeLessThanOrEqual(0.1);
    expect(d0).toBeGreaterThan(d3);
    expect(d3).toBeGreaterThan(d7);
    expect(d7).toBeGreaterThan(d9_5);
  });

  it('meditation: low density, open space', () => {
    const arc = new MacroArc('meditation');
    const v = arc.value(60);
    expect(v.density).toBeLessThan(1);
    expect(v.space).toBeGreaterThan(1);
  });

  it('setPurpose switches behaviour live', () => {
    const arc = new MacroArc('flow', 30, 0);
    const before = arc.value(120).density;
    arc.setPurpose('focus');
    const after = arc.value(120).density;
    expect(after).toBeLessThan(before);
  });
});
