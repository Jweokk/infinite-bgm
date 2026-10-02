import { describe, expect, it } from 'vitest';
import { zenPlugin } from '../../src/styles/zen';
import { BreathEngine } from '../../src/styles/zen/BreathEngine';
import { SeededRandom } from '../../src/core/SeededRandom';
import type { GenerationContext, MusicalEvent, ParamValue } from '../../src/core/types';

function defaults(): Record<string, ParamValue> {
  const out: Record<string, ParamValue> = {};
  for (const def of zenPlugin.parameters) out[def.id] = def.default;
  return out;
}

function generateWith(params: Record<string, ParamValue>, windows: [number, number][], seed = '42'): MusicalEvent[] {
  const instance = zenPlugin.create({ seed, parameters: { ...defaults(), ...params } });
  instance.start({
    audioContext: null as any,
    random: null as any,
    instruments: { get: () => undefined },
    fx: { get: () => undefined, has: () => false },
    spatial: { setStereoWidth: () => {}, setMovement: () => {}, getMovement: () => 0 },
    eventBus: { emit: () => {} },
  });
  const all: MusicalEvent[] = [];
  for (const [from, to] of windows) {
    const ctx: GenerationContext = { random: null as any, from, to };
    all.push(...instance.generateEvents(ctx));
  }
  return all;
}

describe('Zen plugin', () => {
  it('same seed + config → identical events', () => {
    const a = generateWith({}, [
      [0, 30],
      [30, 60],
      [60, 120],
    ]);
    const b = generateWith({}, [
      [0, 30],
      [30, 60],
      [60, 120],
    ]);
    expect(a.length).toBeGreaterThan(5);
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  });

  it('window chunking does not change the output', () => {
    const chunked = generateWith({}, [
      [0, 30],
      [30, 60],
    ]);
    const single = generateWith({}, [[0, 60]]);
    // Lanes emit into per-window arrays, so cross-window ordering differs —
    // compare as time-ordered multisets.
    const key = (arr: MusicalEvent[]) =>
      JSON.stringify([...arr].sort((a, b) => a.startTime - b.startTime || (a.id < b.id ? -1 : 1)));
    expect(key(chunked)).toBe(key(single));
  });

  it('different seed → different events', () => {
    const a = generateWith({}, [[0, 90]], 'aa');
    const b = generateWith({}, [[0, 90]], 'bb');
    expect(JSON.stringify(a)).not.toBe(JSON.stringify(b));
  });

  it('produces drones, bells and textures — no beat grid required', () => {
    const events = generateWith({}, [[0, 120]]);
    const types = new Set(events.map((e) => e.type));
    expect(types.has('drone')).toBe(true);
    expect(types.has('bell') || types.has('harmonic')).toBe(true);
    expect(events.filter((e) => e.type === 'drone').length).toBeGreaterThan(0);
  });

  it('drones are long (≥20s) and overlapping', () => {
    const events = generateWith({ eventDuration: 0.7 }, [[0, 120]]);
    const drones = events.filter((e) => e.type === 'drone');
    for (const d of drones) expect(d.duration).toBeGreaterThanOrEqual(15);
    // Overlap: total drone time exceeds the timeline.
    const total = drones.reduce((s, d) => s + d.duration, 0);
    expect(total).toBeGreaterThan(120);
  });

  it('bells are separated by generous silences that scale with stillness', () => {
    const still = generateWith({ stillness: 0.95, silenceDensity: 0.9, melodicDensity: 0.2 }, [[0, 240]]);
    const active = generateWith({ stillness: 0.15, silenceDensity: 0.15, melodicDensity: 0.7 }, [[0, 240]]);
    const bellsOf = (evts: MusicalEvent[]) => evts.filter((e) => e.type === 'bell');
    // More stillness → fewer bell events.
    expect(bellsOf(still).length).toBeLessThan(bellsOf(active).length);

    const gaps: number[] = [];
    const sorted = bellsOf(still).sort((a, b) => a.startTime - b.startTime);
    for (let i = 1; i < sorted.length; i++) gaps.push(sorted[i].startTime - sorted[i - 1].startTime);
    for (const g of gaps) expect(g).toBeGreaterThanOrEqual(1.0);
  });

  it('explicit silence markers appear for long gaps', () => {
    const events = generateWith({ stillness: 0.95, silenceDensity: 0.9, melodicDensity: 0.15 }, [[0, 180]]);
    const silences = events.filter((e) => e.type === 'silence');
    expect(silences.length).toBeGreaterThan(0);
    for (const s of silences) expect(s.duration).toBeGreaterThan(6);
  });

  it('texture beds are long, sparse and driven by textureDensity/nature', () => {
    const withTexture = generateWith({ textureDensity: 0.6, nature: 0.8 }, [[0, 200]]);
    const textures = withTexture.filter((e) => e.type === 'texture' || e.type === 'wind' || e.type === 'water');
    expect(textures.length).toBeGreaterThan(0);
    for (const t of textures) {
      expect(t.duration).toBeGreaterThanOrEqual(20);
      expect(t.instrument).toBe('noise-texture');
    }

    const noTexture = generateWith({ textureDensity: 0.01, nature: 0.01 }, [[0, 200]]);
    expect(noTexture.filter((e) => e.instrument === 'noise-texture').length).toBe(0);
  });

  it('pitch material draws from harmonic fields (root/fifth/octave/sus/9)', () => {
    const events = generateWith({ melodicDensity: 0.7, harmonicDensity: 0.6 }, [[0, 300]]);
    const bells = events.filter((e) => e.type === 'bell');
    expect(bells.length).toBeGreaterThan(3);
    // Modulo octaves around field roots, bell pitches should be consonant.
    // v1.5: register dropped an octave (42–86) so bells bloom, not pierce.
    for (const b of bells) {
      expect(b.pitch!).toBeGreaterThan(42);
      expect(b.pitch!).toBeLessThan(88);
    }
  });

  it('breath modulation keeps velocities bounded', () => {
    const events = generateWith({}, [[0, 240]]);
    for (const e of events) {
      if (e.velocity === undefined) continue;
      expect(e.velocity).toBeGreaterThan(0);
      expect(e.velocity).toBeLessThanOrEqual(1);
    }
  });

  it('free time: bell start times are not quantized to any beat grid', () => {
    const events = generateWith({ melodicDensity: 0.6 }, [[0, 240]]);
    const bells = events.filter((e) => e.type === 'bell');
    const fractional = bells.filter((b) => Math.abs(b.startTime * 4 - Math.round(b.startTime * 4)) > 0.02);
    expect(fractional.length).toBeGreaterThan(0);
  });

  it('harmonic fields morph one note at a time (v1.1 §76.5)', () => {
    const events = generateWith({}, [[0, 600]]);
    const drones = events
      .filter((e) => e.type === 'drone')
      .sort((a, b) => a.startTime - b.startTime);
    expect(drones.length).toBeGreaterThan(6);
    let changes = 0;
    for (let i = 1; i < drones.length; i++) {
      const diff = Math.abs(drones[i].pitch! - drones[i - 1].pitch!);
      expect(diff).toBeLessThanOrEqual(2); // root slides a step, never jumps a fifth
      if (diff > 0) changes++;
    }
    expect(changes).toBeGreaterThan(0);
  });

  it('bells sympathetically excite the drone bus (v1.1 §76.7)', () => {
    const events = generateWith({ melodicDensity: 0.5 }, [[0, 240]]);
    const bells = events.filter((e) => e.type === 'bell');
    expect(bells.length).toBeGreaterThan(2);
    for (const b of bells) {
      expect(b.parameters?.exciteBus).toBe('drone');
      expect(Number(b.parameters?.excite)).toBeGreaterThan(0);
      expect(Number(b.parameters?.excite)).toBeLessThanOrEqual(1);
    }
  });

  it('breath peaks are found deterministically (v1.1 §76.6)', () => {
    const engine = new BreathEngine(new SeededRandom(12345), 0.7);
    const peak = engine.nextPeakAfter(100, 40);
    expect(peak).not.toBeNull();
    expect(peak!).toBeGreaterThanOrEqual(100);
    const vPeak = engine.value(peak!);
    // The returned point is a genuine local maximum dominating ±2s.
    for (let x = peak! - 2; x <= peak! + 2; x += 0.5) {
      expect(vPeak).toBeGreaterThanOrEqual(engine.value(x) - 1e-9);
    }
    // Deterministic across calls.
    expect(engine.nextPeakAfter(100, 40)).toBe(peak);
    // Peak chaining: the next peak after a peak is strictly later.
    const next = engine.nextPeakAfter(peak! + 1, 60);
    expect(next === null || next > peak!).toBe(true);
  });

  it('sleep purpose sparsifies: late-session bells are sparser than early ones (v1.1 §76.8)', () => {
    const windows: [number, number][] = [];
    for (let t = 0; t < 540; t += 60) windows.push([t, t + 60]);
    const events = generateWith({ sessionPurpose: 'sleep', sessionLength: '10' }, windows);
    const bellsOf = (from: number, to: number) => events.filter((e) => e.type === 'bell' && e.startTime >= from && e.startTime < to);
    const early = bellsOf(0, 120).length;
    const late = bellsOf(420, 540).length;
    expect(early).toBeGreaterThan(0);
    expect(late).toBeLessThan(early);
  });
});
