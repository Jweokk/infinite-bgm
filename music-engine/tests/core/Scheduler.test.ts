import { describe, expect, it } from 'vitest';
import { Scheduler } from '../../src/core/Scheduler';
import type { MusicalEvent } from '../../src/core/types';

function ev(id: string, startTime: number): MusicalEvent {
  return { id, type: 'note', startTime, duration: 0.1 };
}

describe('Scheduler (look-ahead)', () => {
  it('dispatches only events due within the look-ahead window', () => {
    let now = 100;
    const dispatched: { id: string; at: number }[] = [];
    const s = new Scheduler(
      {
        now: () => now,
        audioTimeFor: (t) => 100 + t,
        dispatch: (e, at) => dispatched.push({ id: e.id, at }),
        generate: () => {},
      },
      { lookahead: 0.16 },
    );
    s.queue.push([ev('a', 0.05), ev('b', 0.2), ev('c', 0.3)]);
    s.tick();
    expect(dispatched.map((d) => d.id)).toEqual(['a']); // only a < 0.16 ahead
    expect(dispatched[0].at).toBe(100.05);

    now = 100.06;
    s.tick();
    expect(dispatched.map((d) => d.id)).toEqual(['a', 'b']);

    now = 100.2;
    s.tick();
    expect(dispatched.map((d) => d.id)).toEqual(['a', 'b', 'c']);
  });

  it('drops events that are far too late instead of bursting', () => {
    let now = 110;
    const dispatched: string[] = [];
    const s = new Scheduler(
      {
        now: () => now,
        audioTimeFor: (t) => 100 + t,
        dispatch: (e) => dispatched.push(e.id),
        generate: () => {},
      },
      { lookahead: 0.16 },
    );
    s.queue.push([ev('old', 0.0), ev('ok', 10.05)]);
    s.tick();
    expect(dispatched).toEqual(['ok']);
  });

  it('clamps dispatch time to slightly ahead of now', () => {
    let now = 105;
    let seenAt = 0;
    const s = new Scheduler(
      {
        now: () => now,
        audioTimeFor: (t) => 100 + t,
        dispatch: (_e, at) => (seenAt = at),
        generate: () => {},
      },
      { lookahead: 0.16 },
    );
    s.queue.push([ev('x', 4.999)]); // due but a hair late (audio 104.999 < now 105)
    s.tick();
    expect(seenAt).toBeCloseTo(105.003, 3); // clamped to now + 3ms
  });
});
