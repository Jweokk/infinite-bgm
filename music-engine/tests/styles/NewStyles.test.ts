import { describe, expect, it } from 'vitest';
import type { ParamValue, StylePlugin } from '../../src/core/types';
import { generateWith } from '../helpers/styleContext';
import { jazzhopPlugin } from '../../src/styles/jazzhop';
import { meditationPlugin } from '../../src/styles/meditation';
import { ambientPlugin } from '../../src/styles/ambient';
import { japanesePlugin } from '../../src/styles/japanese';
import { naturePlugin } from '../../src/styles/nature';
import { sleepPlugin } from '../../src/styles/sleep';
import { cinematicPlugin } from '../../src/styles/cinematic';
import { minimalPlugin } from '../../src/styles/minimal';
import { dreamPlugin } from '../../src/styles/dream';
import { synthwavePlugin } from '../../src/styles/synthwave';
import { deepHousePlugin } from '../../src/styles/deephouse';
import { neoClassicalPlugin } from '../../src/styles/neoclassical';
import { chiptunePlugin } from '../../src/styles/chiptune';
import { darkAmbientPlugin } from '../../src/styles/darkambient';

/** Shared checks every new style must pass (PRD §106). */
function contract(plugin: StylePlugin, opts: { window: number; minEvents: number; roles: string[] }) {
  it(`${plugin.name}: same seed → identical events`, () => {
    const windows: [number, number][] = [
      [0, opts.window],
      [opts.window, opts.window * 2],
    ];
    const a = generateWith(plugin, {}, windows, 'seed-A');
    const b = generateWith(plugin, {}, windows, 'seed-A');
    expect(a.length).toBeGreaterThanOrEqual(opts.minEvents);
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  });

  it(`${plugin.name}: different seed → different events`, () => {
    const windows: [number, number][] = [[0, opts.window * 2]];
    const a = generateWith(plugin, {}, windows, 'seed-A');
    const b = generateWith(plugin, {}, windows, 'seed-B');
    expect(JSON.stringify(a)).not.toBe(JSON.stringify(b));
  });

  it(`${plugin.name}: window chunking does not change the output`, () => {
    const chunked = generateWith(plugin, {}, [
      [0, opts.window],
      [opts.window, opts.window * 2],
    ]);
    const single = generateWith(plugin, {}, [[0, opts.window * 2]]);
    const key = (arr: typeof chunked) =>
      JSON.stringify([...arr].sort((x, y) => x.startTime - y.startTime || (x.id < y.id ? -1 : 1)));
    expect(key(chunked)).toBe(key(single));
  });

  it(`${plugin.name}: produces its characteristic voices`, () => {
    const events = generateWith(plugin, {}, [[0, opts.window * 2]]);
    const roles = new Set(events.map((e) => e.metadata?.role));
    for (const role of opts.roles) expect(roles.has(role)).toBe(true);
    for (const e of events) {
      expect(Number.isFinite(e.startTime)).toBe(true);
      expect(e.duration).toBeGreaterThan(0);
      if (e.velocity !== undefined) {
        expect(e.velocity).toBeGreaterThan(0);
        expect(e.velocity).toBeLessThanOrEqual(1);
      }
    }
  });
}

describe('Jazzhop', () => {
  contract(jazzhopPlugin, { window: 30, minEvents: 40, roles: ['harmony', 'bass', 'drums'] });
  it('walking bass plays quarter notes (4 per bar)', () => {
    const events = generateWith(jazzhopPlugin, {}, [[0, 40]]);
    const bass = events.filter((e) => e.metadata?.role === 'bass').sort((a, b) => a.startTime - b.startTime);
    expect(bass.length).toBeGreaterThanOrEqual(16);
    const beat = 60 / 88;
    for (let i = 1; i < bass.length; i++) {
      expect(bass[i].startTime - bass[i - 1].startTime).toBeCloseTo(beat, 1);
    }
  });
  it('ride pattern exists (hat drum events)', () => {
    const events = generateWith(jazzhopPlugin, {}, [[0, 30]]);
    expect(events.filter((e) => e.instrument === 'hat').length).toBeGreaterThan(10);
  });
});

describe('Meditation', () => {
  contract(meditationPlugin, { window: 120, minEvents: 3, roles: ['drone'] });
  it('defaults to the meditation purpose (breath-forward)', () => {
    expect(meditationPlugin.parameters.find((p) => p.id === 'sessionPurpose')?.default).toBe('meditation');
    expect(meditationPlugin.timeMode).toBe('breath');
  });
});

describe('Ambient', () => {
  contract(ambientPlugin, { window: 120, minEvents: 6, roles: ['drone'] });
  it('chord clouds overlap (drones crossfade, not gap)', () => {
    const events = generateWith(ambientPlugin, { chordSpeed: 0.6 }, [[0, 180]]);
    const drones = events.filter((e) => e.type === 'drone').sort((a, b) => a.startTime - b.startTime);
    expect(drones.length).toBeGreaterThan(6);
    let overlapped = 0;
    for (const d of drones) {
      const endsAfterAnotherStart = drones.some((o) => o !== d && o.startTime > d.startTime && o.startTime < d.startTime + d.duration);
      if (endsAfterAnotherStart) overlapped++;
    }
    expect(overlapped).toBeGreaterThan(0);
  });
});

describe('Japanese', () => {
  contract(japanesePlugin, { window: 120, minEvents: 3, roles: ['koto', 'drone'] });
  it('koto rolls produce tight note groups', () => {
    const events = generateWith(japanesePlugin, { rollAmount: 0.9, density: 0.6 }, [[0, 240]]);
    const koto = events.filter((e) => e.metadata?.role === 'koto').sort((a, b) => a.startTime - b.startTime);
    expect(koto.length).toBeGreaterThan(6);
    // All pitches stay inside the pentatonic register.
    for (const k of koto) {
      expect(k.pitch).toBeGreaterThanOrEqual(55);
      expect(k.pitch).toBeLessThanOrEqual(96);
    }
  });
});

describe('Nature', () => {
  contract(naturePlugin, { window: 120, minEvents: 4, roles: ['wind', 'birdsong'] });
  it('texture parameters can mute wind and water entirely', () => {
    const off = generateWith(naturePlugin, { wind: 0, water: 0, birdsong: 0, droneLevel: 0, density: 0 }, [[0, 120]]);
    expect(off.filter((e) => e.type !== 'silence').length).toBe(0);
  });
});

describe('Sleep', () => {
  contract(sleepPlugin, { window: 120, minEvents: 2, roles: ['drone'] });
  it('defaults to the sleep purpose and dissolves over the session', () => {
    expect(sleepPlugin.parameters.find((p) => p.id === 'sessionPurpose')?.default).toBe('sleep');
    const windows: [number, number][] = [];
    for (let t = 0; t < 600; t += 60) windows.push([t, t + 60]);
    const events = generateWith(sleepPlugin, { sessionLength: '10' }, windows);
    const early = events.filter((e) => e.startTime < 120).length;
    const late = events.filter((e) => e.startTime >= 480).length;
    expect(late).toBeLessThan(early);
  });
  it('keeps the mix dark: drones live in the sub register', () => {
    const events = generateWith(sleepPlugin, {}, [[0, 180]]);
    for (const d of events.filter((e) => e.type === 'drone')) {
      expect(d.pitch!).toBeLessThanOrEqual(40);
    }
  });
});

describe('Cinematic', () => {
  contract(cinematicPlugin, { window: 120, minEvents: 4, roles: ['pedal', 'voices', 'motif'] });
  it('heartbeat pulse only fires when enabled', () => {
    const off = generateWith(cinematicPlugin, { pulse: 0 }, [[0, 120]]);
    expect(off.filter((e) => e.metadata?.role === 'pulse').length).toBe(0);
    const on = generateWith(cinematicPlugin, { pulse: 0.6 }, [[0, 120]]);
    expect(on.filter((e) => e.metadata?.role === 'pulse').length).toBeGreaterThan(3);
  });
});

describe('Minimal', () => {
  contract(minimalPlugin, { window: 30, minEvents: 30, roles: ['arpeggio'] });
  it('arpeggio runs on a straight grid', () => {
    const events = generateWith(minimalPlugin, { patternSpeed: 0.35, humanization: 0, pulse: 0, density: 1 }, [[0, 20]]);
    const arp = events.filter((e) => e.metadata?.role === 'arpeggio').sort((a, b) => a.startTime - b.startTime);
    expect(arp.length).toBeGreaterThan(20);
    const step = (60 / 118) / 2; // eighth notes
    for (let i = 1; i < arp.length; i++) {
      expect(arp[i].startTime - arp[i - 1].startTime).toBeCloseTo(step, 1);
    }
  });
  it('phase motion rotates the contour (patterns evolve)', () => {
    const a = generateWith(minimalPlugin, { motion: 0 }, [[0, 40]], 'same');
    const b = generateWith(minimalPlugin, { motion: 0.9 }, [[0, 40]], 'same');
    expect(JSON.stringify(a)).not.toBe(JSON.stringify(b));
  });
});

describe('Dream', () => {
  contract(dreamPlugin, { window: 120, minEvents: 5, roles: ['drone', 'bell'] });
  it('bells excite the pad drone (layer coupling)', () => {
    const events = generateWith(dreamPlugin, {}, [[0, 180]]);
    const bells = events.filter((e) => e.type === 'bell');
    expect(bells.length).toBeGreaterThan(2);
    for (const b of bells) expect(b.parameters?.exciteBus).toBe('drone');
  });
});

describe('Synthwave', () => {
  contract(synthwavePlugin, { window: 30, minEvents: 40, roles: ['pad', 'arp', 'drums'] });
  it('kicks carry a strong sidechain duck (the pump)', () => {
    const events = generateWith(synthwavePlugin, {}, [[0, 30]]);
    const kicks = events.filter((e) => e.instrument === 'kick');
    expect(kicks.length).toBeGreaterThan(6);
    for (const k of kicks) expect(Number(k.parameters?.duck)).toBeGreaterThan(0.3);
  });
  it('pads are supersaw chords spanning the bar', () => {
    const events = generateWith(synthwavePlugin, {}, [[0, 30]]);
    const pads = events.filter((e) => e.metadata?.role === 'pad');
    expect(pads.length).toBeGreaterThan(6);
    for (const p of pads) {
      expect(p.instrument).toBe('supersaw');
      expect((p.notes ?? []).length).toBeGreaterThanOrEqual(4);
      expect(p.duration).toBeGreaterThan(2);
    }
  });
});

describe('Deep House', () => {
  contract(deepHousePlugin, { window: 30, minEvents: 50, roles: ['drums', 'bass', 'stab'] });
  it('four on the floor: kicks land exactly on beats', () => {
    const events = generateWith(deepHousePlugin, {}, [[0, 40]]);
    const kicks = events.filter((e) => e.instrument === 'kick').sort((a, b) => a.startTime - b.startTime);
    expect(kicks.length).toBeGreaterThan(20);
    const beat = 60 / 121;
    for (const k of kicks) {
      const off = k.startTime % beat;
      expect(Math.min(off, beat - off)).toBeLessThan(0.02); // distance to nearest beat
    }
    for (let i = 1; i < kicks.length; i++) {
      expect(kicks[i].startTime - kicks[i - 1].startTime).toBeCloseTo(beat, 1);
    }
  });
  it('runs an intro/groove/break/drop arc', () => {
    const events = generateWith(deepHousePlugin, {}, [[0, 120]]);
    const sections = new Set(events.map((e) => e.metadata?.section));
    expect(sections.has('break')).toBe(true);
    expect(sections.has('drop') || sections.has('groove')).toBe(true);
  });
});

describe('Neo-Classical', () => {
  contract(neoClassicalPlugin, { window: 60, minEvents: 20, roles: ['arpeggio', 'pad'] });
  it('felt piano broken chords run on an eighth grid', () => {
    const events = generateWith(neoClassicalPlugin, { humanization: 0 }, [[0, 30]]);
    const arp = events.filter((e) => e.metadata?.role === 'arpeggio').sort((a, b) => a.startTime - b.startTime);
    expect(arp.length).toBeGreaterThan(8);
    const beat = 60 / 64;
    for (const a of arp) {
      expect(a.startTime % beat).toBeLessThan(0.02);
    }
    expect(arp.every((a) => a.instrument === 'felt-piano')).toBe(true);
  });
});

describe('Chiptune', () => {
  contract(chiptunePlugin, { window: 30, minEvents: 60, roles: ['arp', 'bass', 'drums'] });
  it('everything plays on the chip instrument with near-constant velocity', () => {
    const events = generateWith(chiptunePlugin, {}, [[0, 20]]);
    const chip = events.filter((e) => e.instrument === 'chip');
    expect(chip.length).toBeGreaterThan(30);
    const vels = new Set(chip.map((e) => Math.round((e.velocity ?? 0) * 100)));
    expect(vels.size).toBeLessThanOrEqual(4); // 8-bit honesty: stepped velocities
  });
});

describe('Dark Ambient', () => {
  contract(darkAmbientPlugin, { window: 120, minEvents: 3, roles: ['drone'] });
  it('lives in the sub register with dissonant color voices', () => {
    const events = generateWith(darkAmbientPlugin, { dread: 0.8 }, [[0, 240]]);
    const drones = events.filter((e) => e.metadata?.role === 'drone');
    expect(drones.length).toBeGreaterThan(2);
    for (const d of drones) expect(d.pitch!).toBeLessThanOrEqual(36);
    const voices = events.filter((e) => e.metadata?.role === 'voice');
    expect(voices.length).toBeGreaterThan(0);
    // Trititone (+6), minor 9th (+13) or minor 2nd (+1) — the unease intervals.
    const root = drones[0].pitch!;
    for (const v of voices) {
      expect([1, 6, 13]).toContain(v.pitch! - root);
    }
  });
});

describe('Meditation identity (v1.4)', () => {
  it('emits audible breath swells locked to inhale peaks', () => {
    const events = generateWith(meditationPlugin, { breathSound: 0.6 }, [[0, 180]]);
    const swells = events.filter((e) => e.metadata?.role === 'breath');
    expect(swells.length).toBeGreaterThan(1);
    for (const s of swells) {
      expect(s.instrument).toBe('noise-texture');
      expect(s.duration).toBeGreaterThanOrEqual(2.5);
      expect(s.duration).toBeLessThanOrEqual(6);
    }
    // Swells are spaced by breath-cycle scale (tens of seconds apart).
    const sorted = swells.sort((a, b) => a.startTime - b.startTime);
    for (let i = 1; i < sorted.length; i++) {
      expect(sorted[i].startTime - sorted[i - 1].startTime).toBeGreaterThan(5);
    }
  });
});

describe('Bell softness guard (v1.5)', () => {
  it('bell-family voices stay in a gentle register across quiet styles', () => {
    // Quiet styles must not schedule piercing strikes (MIDI > 88 ≈ 2.1kHz).
    const cases: [StylePlugin, Record<string, ParamValue>][] = [
      [meditationPlugin, {}],
      [dreamPlugin, { bellDensity: 0.7 }],
      [japanesePlugin, {}],
      [sleepPlugin, {}],
      [naturePlugin, { birdsong: 0.8 }],
    ];
    for (const [plugin, params] of cases) {
      const events = generateWith(plugin, params, [[0, 240]], 'soft-check');
      const bells = events.filter((e) => e.instrument === 'bell' || e.instrument === 'bowl');
      expect(bells.length).toBeGreaterThan(0);
      for (const b of bells) {
        expect(b.pitch!).toBeLessThanOrEqual(88);
        expect(b.velocity ?? 0).toBeLessThanOrEqual(0.75);
      }
    }
  });
});

describe('Plugin registry isolation (PRD §60)', () => {
  it('all 11 styles register with unique ids and metadata', () => {
    const plugins = [
      jazzhopPlugin,
      meditationPlugin,
      ambientPlugin,
      japanesePlugin,
      naturePlugin,
      sleepPlugin,
      cinematicPlugin,
      minimalPlugin,
      dreamPlugin,
      synthwavePlugin,
      deepHousePlugin,
      neoClassicalPlugin,
      chiptunePlugin,
      darkAmbientPlugin,
    ];
    const ids = new Set(plugins.map((p) => p.id));
    expect(ids.size).toBe(plugins.length);
    for (const p of plugins) {
      expect(p.parameters.length).toBeGreaterThan(3);
      expect(p.presets.length).toBeGreaterThanOrEqual(3);
      expect(p.color).toMatch(/^#[0-9a-f]{6}$/i);
      // v1.3: parameter scope metadata must be well-formed.
      for (const def of p.parameters) {
        if (def.scope !== undefined) expect(['fx', 'generation']).toContain(def.scope);
      }
      // The session-length label must not imply playback stops.
      const sessionLen = p.parameters.find((d) => d.id === 'sessionLength');
      if (sessionLen) expect(sessionLen.name).toBe('睡眠/冥想时长');
    }
  });
});
