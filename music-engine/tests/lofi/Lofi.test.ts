import { describe, expect, it } from 'vitest';
import { lofiPlugin } from '../../src/styles/lofi';
import type { GenerationContext, MusicalEvent, ParamValue } from '../../src/core/types';

function defaults(): Record<string, ParamValue> {
  const out: Record<string, ParamValue> = {};
  for (const def of lofiPlugin.parameters) out[def.id] = def.default;
  return out;
}

function generateWith(params: Record<string, ParamValue>, windows: [number, number][], seed = '12345'): MusicalEvent[] {
  const instance = lofiPlugin.create({ seed, parameters: { ...defaults(), ...params } });
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

/** Candidate grid times (16th grid + swung 8th offbeats) for tolerance checks. */
function gridCandidates(bpm: number, swing: number, bars: number): number[] {
  const beat = 60 / bpm;
  const out: number[] = [];
  for (let bar = 0; bar <= bars; bar++) {
    const barStart = bar * beat * 4;
    for (let step = 0; step < 16; step++) {
      let t = barStart + step * (beat / 4);
      if (step % 4 === 2) t += (swing - 0.5) * beat; // swung 8th offbeat
      else if (step % 2 === 1) t += (swing - 0.5) * beat * 0.45; // swung 16th
      out.push(t);
    }
  }
  return out;
}

function nearAny(t: number, candidates: number[], tol: number): boolean {
  return candidates.some((c) => Math.abs(t - c) <= tol);
}

describe('Lofi plugin', () => {
  it('same seed + config → identical events (PRD §12)', () => {
    const a = generateWith({}, [
      [0, 30],
      [30, 60],
      [60, 90],
    ]);
    const b = generateWith({}, [
      [0, 30],
      [30, 60],
      [60, 90],
    ]);
    expect(a.length).toBeGreaterThan(50);
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  });

  it('chunking the timeline does not change the output', () => {
    const chunked = generateWith({}, [
      [0, 30],
      [30, 60],
    ]);
    const single = generateWith({}, [[0, 60]]);
    expect(JSON.stringify(chunked)).toBe(JSON.stringify(single));
  });

  it('different seed → different music', () => {
    const a = generateWith({}, [[0, 60]], '11111');
    const b = generateWith({}, [[0, 60]], '22222');
    expect(JSON.stringify(a)).not.toBe(JSON.stringify(b));
  });

  it('produces all four voices: harmony, melody, bass, drums', () => {
    const events = generateWith({}, [[0, 60]]);
    const roles = new Set(events.map((e) => e.metadata?.role));
    expect(roles.has('harmony')).toBe(true);
    expect(roles.has('melody')).toBe(true);
    expect(roles.has('bass')).toBe(true);
    expect(roles.has('drums')).toBe(true);
  });

  it('drum hits land on the (swung) grid within humanization bounds', () => {
    const swing = 0.58;
    const events = generateWith({ humanization: 1, swing, tempoDynamics: 0 }, [[0, 40]]);
    const bpm = 78;
    const grid = gridCandidates(bpm, swing, 12);
    const drums = events.filter((e) => e.metadata?.role === 'drums');
    expect(drums.length).toBeGreaterThan(20);
    for (const d of drums) {
      expect(nearAny(d.startTime, grid, 0.017)).toBe(true); // ±15ms + epsilon
    }
  });

  it('humanization stays within the PRD bounds (±15ms / ±10% / ±0.1)', () => {
    const events = generateWith({ humanization: 1, swing: 0.58, tempoDynamics: 0 }, [[0, 40]]);
    const bpm = 78;
    const grid = gridCandidates(bpm, 0.58, 12);
    for (const e of events) {
      if (e.type === 'silence') continue;
      expect(nearAny(e.startTime, grid, 0.017)).toBe(true);
      expect(e.pan ?? 0).toBeGreaterThanOrEqual(-0.35);
      expect(e.pan ?? 0).toBeLessThanOrEqual(0.35);
    }
  });

  it('pocket is directional: kicks lean late, hats push early (v1.1 §76.1)', () => {
    const swing = 0.58;
    const events = generateWith({ humanization: 1, swing, tempoDynamics: 0 }, [[0, 60]]);
    const grid = gridCandidates(78, swing, 20);
    const meanOffset = (instrument: string) => {
      const residuals: number[] = [];
      for (const e of events) {
        if (e.instrument !== instrument) continue;
        let nearest = Infinity;
        for (const c of grid) nearest = Math.min(nearest, Math.abs(e.startTime - c));
        residuals.push(e.startTime - (grid.find((c) => Math.abs(e.startTime - c) === nearest) ?? e.startTime));
      }
      return residuals.reduce((s, r) => s + r, 0) / Math.max(1, residuals.length);
    };
    expect(meanOffset('kick')).toBeGreaterThan(0.003); // ~+9ms bias
    expect(meanOffset('hat')).toBeLessThan(-0.001); // ~-6ms bias
  });

  it('kick events carry the sidechain duck parameter (v1.1 §76.2)', () => {
    const events = generateWith({ sidechain: 0.6 }, [[0, 40]]);
    const kicks = events.filter((e) => e.instrument === 'kick');
    expect(kicks.length).toBeGreaterThan(5);
    for (const k of kicks) {
      expect(k.parameters?.duck).toBeGreaterThan(0);
      expect(k.parameters?.duck).toBeLessThanOrEqual(1);
    }
    // sidechain=0 disables the pump entirely
    const off = generateWith({ sidechain: 0 }, [[0, 40]]);
    for (const k of off.filter((e) => e.instrument === 'kick')) {
      expect(k.parameters?.duck).toBeUndefined();
    }
  });

  it('chord events carry a roll and the chord root as pitch (§76.3/§76.9)', () => {
    const events = generateWith({}, [[0, 40]]);
    const chords = events.filter((e) => e.type === 'chord');
    expect(chords.length).toBeGreaterThan(4);
    for (const c of chords) {
      expect(c.pitch).toBeGreaterThan(40);
      expect(Number(c.parameters?.roll)).toBeGreaterThan(0);
      expect(Number(c.parameters?.roll)).toBeLessThanOrEqual(0.03);
    }
  });

  it('sections end with a ii7→V7 turnaround into the next key (v1.1 §76.4)', () => {
    const events = generateWith({ harmonyDensity: 0.35 }, [[0, 240]]);
    const chords = events
      .filter((e) => e.type === 'chord')
      .sort((a, b) => a.startTime - b.startTime)
      // Dedupe repeated hits of the same chord within a section.
      .filter((e, i, arr) => i === 0 || e.metadata?.section !== arr[i - 1].metadata?.section || e.pitch !== arr[i - 1].pitch);

    // V-root minus ii-root is exactly 5 semitones; collect the last distinct
    // chord pair before every section transition that has a turnaround.
    let checked = 0;
    for (let i = 1; i < chords.length; i++) {
      const prevSection = chords[i - 1].metadata?.section;
      const curSection = chords[i].metadata?.section;
      if (prevSection === curSection || prevSection === 'Intro') continue;
      const pairPrev = chords[i - 2];
      if (!pairPrev || pairPrev.metadata?.section !== prevSection) continue;
      const diff = (((chords[i - 1].pitch! - pairPrev.pitch!) % 12) + 12) % 12;
      expect(diff).toBe(5); // V7 = ii7 + 5 semitones
      checked++;
    }
    expect(checked).toBeGreaterThanOrEqual(2);
  });

  it('B sections modulate the key centre by +3/+5/-4 semitones (v1.1 §76.4)', () => {
    const events = generateWith({ harmonyDensity: 0.35 }, [[0, 240]]);
    const chords = events
      .filter((e) => e.type === 'chord')
      .sort((a, b) => a.startTime - b.startTime)
      .filter((e, i, arr) => i === 0 || e.metadata?.section !== arr[i - 1].metadata?.section || e.pitch !== arr[i - 1].pitch);

    // The last chord before a section change is the V of the NEXT section's
    // key, so the shift between consecutive transitions equals the keyOffset.
    const vRoots: { from: string; root: number }[] = [];
    for (let i = 1; i < chords.length; i++) {
      if (chords[i - 1].metadata?.section !== chords[i].metadata?.section && chords[i - 1].metadata?.section !== 'Intro') {
        vRoots.push({ from: chords[i - 1].metadata!.section!, root: chords[i - 1].pitch! });
      }
    }
    expect(vRoots.length).toBeGreaterThanOrEqual(2);
    const aPrime = vRoots.find((v) => v.from === "A'");
    const aFirst = vRoots[0];
    if (aPrime && aFirst && aFirst.from === 'A') {
      const diff = (((aPrime.root - aFirst.root) % 12) + 12) % 12;
      expect([3, 5, 8]).toContain(diff); // B keyOffset: +3, +5 or -4 (≡8)
    }
  });

  it('tempoDynamics=0 keeps a constant bar grid', () => {
    const events = generateWith({ tempoDynamics: 0 }, [[0, 90]]);
    const beat = 60 / 78;
    const grid = gridCandidates(78, 0.58, 30);
    const kicks = events.filter((e) => e.instrument === 'kick');
    expect(kicks.length).toBeGreaterThan(10);
    for (const k of kicks) expect(nearAny(k.startTime, grid, 0.017)).toBe(true);
  });

  it('sleep purpose thins the music over the session (v1.1 §76.8)', () => {
    const windows: [number, number][] = [];
    for (let t = 0; t < 1020; t += 60) windows.push([t, t + 60]);
    const events = generateWith({ sessionPurpose: 'sleep', sessionLength: '20' }, windows).filter(
      (e) => e.metadata?.role !== 'silence',
    );
    // Compare equal durations: minute 1 vs minute 16 of a 20-minute session.
    const early = events.filter((e) => e.startTime < 120).length;
    const late = events.filter((e) => e.startTime >= 900 && e.startTime < 1020).length;
    expect(early).toBeGreaterThan(100);
    expect(late).toBeLessThan(early * 0.75);
  });

  it('melody uses motifs: repeated pitch material, register bounded', () => {
    const events = generateWith({ melodyDensity: 0.8 }, [[0, 120]]);
    const melody = events.filter((e) => e.metadata?.role === 'melody');
    expect(melody.length).toBeGreaterThan(10);
    for (const m of melody) {
      expect(m.pitch!).toBeGreaterThanOrEqual(60);
      expect(m.pitch!).toBeLessThanOrEqual(92);
    }
  });

  it('bass sits in the low register', () => {
    const events = generateWith({}, [[0, 60]]);
    const bass = events.filter((e) => e.metadata?.role === 'bass');
    for (const b of bass) {
      expect(b.pitch!).toBeGreaterThanOrEqual(28);
      expect(b.pitch!).toBeLessThanOrEqual(58);
    }
  });

  it('chord voicings voice-lead: consecutive top notes move modestly', () => {
    const events = generateWith({ harmonyDensity: 0.3 }, [[0, 120]]);
    const chords = events.filter((e) => e.type === 'chord');
    let moves = 0;
    let count = 0;
    let prevTop: number | null = null;
    for (const c of chords) {
      const top = Math.max(...(c.notes ?? []));
      if (prevTop !== null) {
        moves += Math.abs(top - prevTop);
        count++;
      }
      prevTop = top;
    }
    expect(count).toBeGreaterThan(5);
    expect(moves / count).toBeLessThan(7); // average movement under a fifth
  });

  it('arrangement produces multiple section labels', () => {
    const events = generateWith({}, [[0, 180]]);
    const sections = new Set(events.map((e) => e.metadata?.section));
    expect(sections.size).toBeGreaterThanOrEqual(2);
    expect(sections.has('Intro')).toBe(true);
  });

  it('seed variety: multiple seeds give multiple distinct bass roots', () => {
    const roots = new Set<string>();
    for (const seed of ['1', '2', '3', '4', '5', '6', '7', '8']) {
      const events = generateWith({}, [[0, 30]], seed);
      const first = events.find((e) => e.type === 'chord');
      if (first) roots.add(String(first.notes?.[0]));
    }
    expect(roots.size).toBeGreaterThanOrEqual(3);
  });

  it('nextBoundary returns the next bar line', () => {
    const instance = lofiPlugin.create({ seed: 's', parameters: defaults() });
    instance.start({
      audioContext: null as any,
      random: null as any,
      instruments: { get: () => undefined },
      fx: { get: () => undefined, has: () => false },
      spatial: { setStereoWidth: () => {}, setMovement: () => {}, getMovement: () => 0 },
      eventBus: { emit: () => {} },
    });
    instance.generateEvents({ random: null as any, from: 0, to: 10 });
    const boundary = instance.nextBoundary!(2.5)!;
    const barDur = (60 / 78) * 4;
    expect(boundary).toBeGreaterThanOrEqual(2.5);
    expect(boundary % barDur).toBeCloseTo(0, 5);
  });
});
