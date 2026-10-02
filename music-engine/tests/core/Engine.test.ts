import { describe, expect, it, vi } from 'vitest';
import { MusicEngine } from '../../src/core/MusicEngine';
import { pulsePlugin } from '../../src/styles/pulse';
import { zenPlugin } from '../../src/styles/zen';
import type { InstrumentPlugin, MusicalEvent } from '../../src/core/types';
import { MockAudioContext } from '../helpers/MockAudioContext';

function recordingInstrument(id: string, log: { id: string; event: MusicalEvent; at: number }[]): InstrumentPlugin {
  return {
    id,
    name: id,
    create: () => ({
      trigger(event, at) {
        log.push({ id: event.id, event, at });
      },
      stopAll() {},
      setParameter() {},
    }),
  };
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

function makeEngine(mock: MockAudioContext, log: { id: string; event: MusicalEvent; at: number }[] ) {
  const engine = new MusicEngine({
    audioContextFactory: () => mock as unknown as AudioContext,
    style: 'pulse',
    seed: '777',
    lookAhead: 0.16,
    generationHorizon: 45,
  });
  engine.registerInstrument(recordingInstrument('pluck', log));
  for (const id of ['drone', 'bell', 'bowl', 'noise-texture']) {
    engine.registerInstrument(recordingInstrument(id, log));
  }
  // Zen requires the reverb FX — register a stub.
  engine.registerFX({
    id: 'reverb',
    name: 'Reverb (stub)',
    create: () => {
      const g = mock.createGain() as unknown as AudioNode;
      return { input: g, output: g, setParameter() {}, reset() {}, dispose() {} };
    },
  });
  engine.registerStyle(pulsePlugin);
  engine.registerStyle(zenPlugin);
  return engine;
}

/** Advance the mock clock in small steps, ticking like the real interval would. */
function play(engine: MusicEngine, mock: MockAudioContext, seconds: number, step = 0.1): void {
  for (let t = 0; t < seconds; t += step) {
    mock.advance(step);
    (engine as any).scheduler.tick();
  }
}

describe('MusicEngine (headless with mock AudioContext)', () => {
  it('plugin → event → scheduler → instrument → audio pipeline works', async () => {
    const mock = new MockAudioContext();
    const log: { id: string; event: MusicalEvent; at: number }[] = [];
    const engine = makeEngine(mock, log);

    await engine.start();
    expect(engine.getState().status).toBe('playing');
    expect(mock.state).toBe('running');

    mock.advance(0.01);
    (engine as any).scheduler.tick();
    mock.advance(0.65);
    (engine as any).scheduler.tick();

    expect(log.length).toBeGreaterThan(0);
    // Events dispatched with exact audio-clock times, in order.
    for (let i = 1; i < log.length; i++) {
      expect(log[i].at).toBeGreaterThanOrEqual(log[i - 1].at - 1e-9);
    }
    expect(log[0].event.instrument).toBe('pluck');

    engine.pause();
    expect(engine.getState().status).toBe('paused');
    await engine.dispose();
  });

  it('pause halts dispatch; resume continues the same timeline', async () => {
    const mock = new MockAudioContext();
    const log: { id: string; event: MusicalEvent; at: number }[] = [];
    const engine = makeEngine(mock, log);

    await engine.start();
    play(engine, mock, 1.2);
    const before = log.length;
    expect(before).toBeGreaterThan(1);

    engine.pause();
    expect((engine as any).scheduler.timer).toBeNull(); // interval stopped
    await sleep(160); // suspend timer fires
    expect(mock.state).toBe('suspended');

    await engine.resume();
    expect(engine.getState().status).toBe('playing');
    play(engine, mock, 0.6);
    expect(log.length).toBeGreaterThan(before);
    // Timeline continuity: new events are strictly after previous ones.
    for (let i = before + 1; i < log.length; i++) {
      expect(log[i].at).toBeGreaterThanOrEqual(log[i - 1].at - 1e-9);
    }
    await engine.dispose();
  });

  it('stop clears everything and restart is deterministic with the same seed', async () => {
    const mock = new MockAudioContext();
    const log1: { id: string; event: MusicalEvent; at: number }[] = [];
    const engine = makeEngine(mock, log1);

    await engine.start();
    mock.advance(0.1);
    (engine as any).scheduler.tick();
    mock.advance(3.0);
    (engine as any).scheduler.tick();
    const run1 = log1.map((l) => ({ id: l.id, rel: l.at }));

    engine.stop();
    await sleep(260);
    expect(engine.getState().status).toBe('idle');
    const afterStop = log1.length;

    // Restart with the same seed — identical sequence.
    const log2Reference = run1;
    await engine.start();
    mock.advance(0.1);
    (engine as any).scheduler.tick();
    mock.advance(3.0);
    (engine as any).scheduler.tick();
    const run2 = log1.slice(afterStop).map((l) => ({ id: l.id, rel: l.at - log1[afterStop].at + log2Reference[0].rel }));
    expect(run2.length).toBe(log2Reference.length);
    for (let i = 0; i < run2.length; i++) {
      expect(run2[i].id).toBe(log2Reference[i].id);
      expect(run2[i].rel).toBeCloseTo(log2Reference[i].rel, 6);
    }
    await engine.dispose();
  });

  it('switches styles without a page refresh (PRD §70)', async () => {
    const mock = new MockAudioContext();
    const log: { id: string; event: MusicalEvent; at: number }[] = [];
    const engine = makeEngine(mock, log);

    await engine.start();
    expect(engine.getState().styleId).toBe('pulse');
    play(engine, mock, 0.3);

    engine.useStyle('zen');
    // The engine swaps at the style's next musical boundary (≤ 4s audio,
    // ≤ its wall-clock equivalent here). Let it happen.
    mock.advance(1.0);
    await sleep(2600);
    play(engine, mock, 2.0);

    expect(engine.getState().styleId).toBe('zen');
    expect(engine.getState().status).toBe('playing');
    // Zen events now flow (drones / bells).
    const zenEvents = log.filter((l) => l.event.metadata?.sourcePlugin === 'zen');
    expect(zenEvents.length).toBeGreaterThan(0);
    await engine.dispose();
  }, 10000);

  it('unknown style or missing dependencies throw EngineError', async () => {
    const mock = new MockAudioContext();
    const log: { id: string; event: MusicalEvent; at: number }[] = [];
    const engine = makeEngine(mock, log);
    expect(() => engine.useStyle('nope')).toThrow();
    // zen without drone registered would fail — build a stripped engine.
    const engine2 = new MusicEngine({ audioContextFactory: () => mock as unknown as AudioContext });
    engine2.registerInstrument(recordingInstrument('bell', log));
    engine2.registerStyle(zenPlugin);
    expect(() => engine2.useStyle('zen')).toThrow(/drone/);
    await engine.dispose();
  });

  it('setParameter / applyPreset update state without breaking playback', async () => {
    const mock = new MockAudioContext();
    const log: { id: string; event: MusicalEvent; at: number }[] = [];
    const engine = makeEngine(mock, log);
    await engine.start();
    engine.setParameter('bpm', 140);
    expect(engine.getParameters().bpm).toBe(140);
    engine.applyPreset('default');
    expect(engine.getParameters().bpm).toBe(100);
    mock.advance(1);
    (engine as any).scheduler.tick();
    expect(engine.getState().status).toBe('playing');
    await engine.dispose();
  });

  it('sidechain duck and sympathetic excitation schedule on the audio graph (v1.1)', async () => {
    const mock = new MockAudioContext();
    const log: { id: string; event: MusicalEvent; at: number }[] = [];
    const engine = makeEngine(mock, log);
    await engine.start();
    const audio = (engine as any).audio;

    const duckGain = audio.duckGain.gain;
    const before = duckGain.calls;
    audio.duck(1.0, 0.5);
    expect(duckGain.calls).toBeGreaterThan(before);

    // Excitation targets a registered instrument bus (pluck is registered).
    const pluckBus = audio.instrumentBuses.get('pluck').gain;
    const busBefore = pluckBus.calls;
    audio.excite('pluck', 1.0, 0.5);
    expect(pluckBus.calls).toBeGreaterThan(busBefore);
    // Unknown targets are a no-op, not an error.
    expect(() => audio.excite('nope', 1.0, 0.5)).not.toThrow();
    await engine.dispose();
  });
});
