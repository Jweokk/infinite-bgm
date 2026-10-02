import { describe, expect, it } from 'vitest';
import { MusicEngine } from '../../src/core/MusicEngine';
import { DEFAULT_LOOKAHEAD, MAX_LATE_SECONDS, Scheduler } from '../../src/core/Scheduler';
import { declarePlaybackAudioSession, silentMediaElement, unlockIosAudioOutput } from '../../src/core/audioSession';
import { pulsePlugin } from '../../src/styles/pulse';
import { zenPlugin } from '../../src/styles/zen';
import type { InstrumentPlugin, MusicalEvent } from '../../src/core/types';
import { MockAudioContext } from '../helpers/MockAudioContext';

/** Mock whose resume() never settles — what iOS does without a valid gesture. */
class HangingResumeContext extends MockAudioContext {
  async resume(): Promise<void> {
    return new Promise<void>(() => {});
  }
}

/** Mock the test can flip between "resume works" and "resume is refused". */
class FlakyResumeContext extends MockAudioContext {
  allowResume = true;
  async resume(): Promise<void> {
    if (this.allowResume) this.state = 'running';
  }
}

/**
 * Regression tests for the v1.0.1 field fixes:
 *  1. background-tab throttling no longer starves the scheduler
 *  2. a stale persisted style id falls back instead of blocking playback
 *  3. ▶ pressed during the stop() wind-down is honoured
 *  4. style/seed requests made mid-transition are queued, never dropped
 */

function ev(id: string, startTime: number): MusicalEvent {
  return { id, type: 'note', startTime, duration: 0.1 };
}

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

function makeEngine(mock: MockAudioContext, log: { id: string; event: MusicalEvent; at: number }[]) {
  const engine = new MusicEngine({
    audioContextFactory: () => mock as unknown as AudioContext,
    style: 'pulse',
    seed: '777',
    generationHorizon: 45,
  });
  engine.registerInstrument(recordingInstrument('pluck', log));
  for (const id of ['drone', 'bell', 'bowl', 'noise-texture']) {
    engine.registerInstrument(recordingInstrument(id, log));
  }
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

describe('Scheduler under background-tab throttling', () => {
  const build = (lookahead: number, maxLate: number) => {
    let now = 100;
    const dispatched: { id: string; at: number }[] = [];
    const s = new Scheduler(
      {
        now: () => now,
        audioTimeFor: (t) => 100 + t,
        dispatch: (e, at) => dispatched.push({ id: e.id, at }),
        generate: () => {},
      },
      { lookahead, maxLate },
    );
    const events: MusicalEvent[] = [];
    for (let i = 0; i < 40; i++) events.push(ev(`e${i}`, i * 0.25)); // 10 s of music, 4 notes/s
    s.queue.push(events);
    // A hidden tab wakes timers up ~once per second — not every 25 ms.
    for (let t = 0; t <= 12; t += 1) {
      now = 100 + t;
      s.tick();
    }
    // Audio-clock time each note was supposed to sound at.
    const scheduledAt = (id: string) => 100 + Number(id.slice(1)) * 0.25;
    return { dispatched, total: events.length, scheduledAt };
  };

  it('look-ahead covers a whole throttled wake-up, so nothing is late or lost', () => {
    expect(DEFAULT_LOOKAHEAD).toBeGreaterThanOrEqual(1);
    expect(MAX_LATE_SECONDS).toBeGreaterThanOrEqual(0.5);
    const { dispatched, total, scheduledAt } = build(DEFAULT_LOOKAHEAD, MAX_LATE_SECONDS);
    expect(dispatched.length).toBe(total); // nothing lost
    expect(new Set(dispatched.map((d) => d.id)).size).toBe(total); // nothing doubled
    // The point of the look-ahead: every note reaches its instrument on time,
    // so the rhythm is intact even though the wake-ups are a second apart.
    const late = dispatched.filter((d) => d.at < scheduledAt(d.id) - 1e-9);
    expect(late).toEqual([]);
  });

  it('the pre-fix parameters dropped notes (regression guard)', () => {
    const { dispatched, total } = build(0.16, 0.3);
    expect(dispatched.length).toBeLessThan(total);
  });
});

describe('MusicEngine field fixes', () => {
  it('a persisted style that no longer exists falls back instead of blocking playback', async () => {
    const mock = new MockAudioContext();
    const log: { id: string; event: MusicalEvent; at: number }[] = [];
    const engine = makeEngine(mock, log);
    // Simulate a prefs file written by an older version with a removed style.
    const stale = new MusicEngine({
      audioContextFactory: () => mock as unknown as AudioContext,
      style: 'ghost-style',
      seed: '123',
      generationHorizon: 45,
    });
    stale.registerInstrument(recordingInstrument('pluck', log));
    for (const id of ['drone', 'bell', 'bowl', 'noise-texture']) {
      stale.registerInstrument(recordingInstrument(id, log));
    }
    stale.registerFX({
      id: 'reverb',
      name: 'Reverb (stub)',
      create: () => {
        const g = mock.createGain() as unknown as AudioNode;
        return { input: g, output: g, setParameter() {}, reset() {}, dispose() {} };
      },
    });
    stale.registerStyle(pulsePlugin);
    stale.registerStyle(zenPlugin);

    const notices: string[] = [];
    const stylesSeen: string[] = [];
    stale.eventBus.on('error', ({ scope, message }) => notices.push(`${scope}: ${message}`));
    stale.eventBus.on('style', ({ styleId }) => stylesSeen.push(styleId));

    expect(stale.getState().styleId).toBeNull();
    expect(stale.ensureStyleSelected()).toBe('pulse');
    expect(stale.getState().styleId).toBe('pulse');
    expect(stylesSeen).toEqual(['pulse']);
    expect(notices.join(' ')).toContain('ghost-style');

    // ▶ must work — the old behaviour threw 'No style selected' forever.
    await stale.start();
    expect(stale.getState().status).toBe('playing');
    play(stale, mock, 0.5);
    expect(log.length).toBeGreaterThan(0);

    await stale.dispose();
    await engine.dispose();
  });

  it('▶ pressed during the stop() wind-down is honoured, not swallowed', async () => {
    const mock = new MockAudioContext();
    const log: { id: string; event: MusicalEvent; at: number }[] = [];
    const engine = makeEngine(mock, log);
    await engine.start();
    play(engine, mock, 0.5);

    engine.stop();
    expect((engine as any).stopTimer).not.toBeNull(); // wind-down pending
    expect(engine.getState().status).toBe('idle');

    await engine.start(); // user hits play again immediately
    expect((engine as any).stopTimer).toBeNull();
    expect(engine.getState().status).toBe('playing');

    const before = log.length;
    play(engine, mock, 0.6);
    expect(log.length).toBeGreaterThan(before);
    await sleep(250); // a stale wind-down must not pull playback down
    expect(engine.getState().status).toBe('playing');
    await engine.dispose();
  });

  it('a style/seed change made during a transition is queued and lands at the boundary', async () => {
    const mock = new MockAudioContext();
    const log: { id: string; event: MusicalEvent; at: number }[] = [];
    const engine = makeEngine(mock, log);
    await engine.start();
    play(engine, mock, 0.5);

    const pendingStyles: string[] = [];
    const pendingSeeds: string[] = [];
    engine.eventBus.on('style-pending', ({ styleId }) => pendingStyles.push(styleId));
    engine.eventBus.on('seed', ({ seed, pending }) => {
      if (pending) pendingSeeds.push(seed);
    });

    engine.useStyle('zen'); // transition starts
    expect((engine as any).transitioning).toBe(true);

    engine.useStyle('pulse'); // requested mid-transition — must not vanish
    engine.setSeed('4242');
    expect(pendingStyles).toEqual(['pulse']);
    expect(pendingSeeds).toEqual(['4242']);
    expect((engine as any).pendingTarget).toMatchObject({ styleId: 'pulse', seed: '4242' });

    // Let the boundary arrive (≤ 4 s of audio clock) and the timer fire.
    mock.advance(4.0);
    await sleep(4200);
    play(engine, mock, 1.0);

    expect(engine.getState().styleId).toBe('pulse');
    expect(engine.getState().seed).toBe('4242');
    expect(engine.getState().status).toBe('playing');
    await engine.dispose();
  }, 15000);

  it('a transition interrupted by pause still applies its target on resume', async () => {
    const mock = new MockAudioContext();
    const log: { id: string; event: MusicalEvent; at: number }[] = [];
    const engine = makeEngine(mock, log);
    await engine.start();
    play(engine, mock, 0.5);

    engine.useStyle('zen');
    engine.pause();
    expect((engine as any).pendingTarget).toMatchObject({ styleId: 'zen' });
    await sleep(180);

    await engine.resume();
    expect(engine.getState().styleId).toBe('zen');
    expect(engine.getState().status).toBe('playing');
    play(engine, mock, 0.6);
    await engine.dispose();
  });
});

describe('iOS / mobile audio robustness', () => {
  it('declares a playback audio session when (and only when) the browser exposes one', () => {
    // Chrome/Firefox on every platform: no navigator.audioSession at all.
    expect(declarePlaybackAudioSession(null)).toBe(false);
    expect(declarePlaybackAudioSession({})).toBe(false);

    // Safari 16.4+ / iOS: type starts as 'auto' and must become 'playback', so
    // Web Audio reaches the media channel instead of the ring/silent channel.
    const nav: { audioSession?: { type?: string } } = { audioSession: { type: 'auto' } };
    expect(declarePlaybackAudioSession(nav)).toBe(true);
    expect(nav.audioSession!.type).toBe('playback');

    // A hostile/odd implementation must not break engine start-up.
    const thrower = {
      get audioSession(): { type?: string } {
        throw new Error('nope');
      },
    };
    expect(declarePlaybackAudioSession(thrower)).toBe(false);
  });

  it('never reports "playing" when the browser refuses to unlock the context', async () => {
    const mock = new HangingResumeContext();
    const log: { id: string; event: MusicalEvent; at: number }[] = [];
    const engine = makeEngine(mock, log);

    await expect(engine.start()).rejects.toThrow(/解锁/);
    expect(engine.getState().status).toBe('idle'); // UI must not lie
    expect(mock.state).toBe('suspended');
    await engine.dispose();
  }, 10000);

  it('watchdog recovers playback when the system suspends the context', async () => {
    const mock = new FlakyResumeContext();
    const log: { id: string; event: MusicalEvent; at: number }[] = [];
    const engine = makeEngine(mock, log);
    await engine.start();
    expect(mock.state).toBe('running');

    mock.state = 'suspended'; // e.g. a phone call grabbed the audio route
    await sleep(2600);

    expect(mock.state).toBe('running'); // recovered
    expect(engine.getState().status).toBe('playing');
    play(engine, mock, 0.4);
    expect(log.length).toBeGreaterThan(0);
    await engine.dispose();
  }, 15000);

  it('watchdog falls back to an honest paused state when recovery keeps failing', async () => {
    const mock = new FlakyResumeContext();
    const log: { id: string; event: MusicalEvent; at: number }[] = [];
    const engine = makeEngine(mock, log);
    const notices: string[] = [];
    engine.eventBus.on('error', ({ scope, message }) => notices.push(`${scope}: ${message}`));

    await engine.start();
    mock.allowResume = false;
    mock.state = 'suspended';
    await sleep(5200);

    expect(engine.getState().status).toBe('paused');
    expect(notices.join(' ')).toMatch(/音频被系统中断/);
    await engine.dispose();
  }, 20000);

  it('warmAudio() creates the context on a first gesture without starting playback', async () => {
    const mock = new MockAudioContext();
    const log: { id: string; event: MusicalEvent; at: number }[] = [];
    const engine = makeEngine(mock, log);

    expect(() => engine.warmAudio()).not.toThrow();
    await sleep(30);
    expect(mock.state).toBe('running'); // unlocked early
    expect(engine.getState().status).toBe('idle'); // but silent until ▶
    await engine.dispose();
  });

  it('testTone() runs through the master chain and reports a measurable peak', async () => {
    const mock = new MockAudioContext();
    const log: { id: string; event: MusicalEvent; at: number }[] = [];
    const engine = makeEngine(mock, log);
    const result = await engine.testTone(0.2);
    expect(result.ran).toBe(true);
    expect(Number.isFinite(result.graphPeak)).toBe(true);
    await engine.dispose();
  });

  it('unlockIosAudioOutput plays a silent Web Audio source and stays safe without a DOM', () => {
    const calls: string[] = [];
    const fakeCtx = {
      createBuffer: () => ({}),
      createBufferSource: () => ({
        buffer: null,
        onended: null,
        connect: () => calls.push('connect'),
        start: () => calls.push('start'),
        disconnect: () => calls.push('disconnect'),
      }),
      destination: {},
    } as unknown as BaseAudioContext;

    expect(unlockIosAudioOutput(fakeCtx)).toBe(true);
    expect(calls).toEqual(['connect', 'start']);

    // Node test env has no document: the HTML5 half must degrade gracefully.
    expect(silentMediaElement()).toBeNull();
    expect(() => unlockIosAudioOutput(null)).not.toThrow();
    expect(unlockIosAudioOutput(null)).toBe(false);
  });
});
