import { EventQueue } from './EventQueue';
import type { MusicalEvent } from './types';

export interface SchedulerHost {
  /** AudioContext.currentTime. */
  now(): number;
  audioTimeFor(transportTime: number): number;
  dispatch(event: MusicalEvent, audioTime: number): void;
  /** Ask the host to top up the generation horizon. */
  generate(): void;
}

/**
 * Look-ahead scheduler (PRD §38/39).
 *
 * A JS interval only *wakes up* the scheduler; every event is stamped with an
 * exact AudioContext time and dispatched that far ahead, so audio timing never
 * depends on interval jitter.
 */

/**
 * Default look-ahead in seconds.
 *
 * Browsers throttle `setInterval` to ~1 Hz (sometimes worse) in background
 * tabs. With a short look-ahead the scheduler could only cover the next few
 * hundred milliseconds per wake-up, so everything after that was already late
 * by the time the next tick ran and got dropped — measured at ~40% of all
 * notes lost while a tab was hidden. The look-ahead must therefore cover a
 * whole throttled wake-up interval (1 s) plus jitter, not just the 25 ms
 * interval we ask for. Notes are still stamped with exact audio-clock times,
 * so scheduling further ahead costs nothing perceptually.
 */
export const DEFAULT_LOOKAHEAD = 1.5;

/**
 * An event this far behind the audio clock is dropped instead of being
 * dispatched late (a burst of stale notes sounds worse than a gap). Kept
 * comfortably above one throttled tick so ordinary jitter never punches holes.
 */
export const MAX_LATE_SECONDS = 0.75;

export class Scheduler {
  readonly queue = new EventQueue();
  readonly lookahead: number;
  readonly maxLate: number;
  private readonly intervalMs: number;
  private host: SchedulerHost;
  private timer: ReturnType<typeof setInterval> | null = null;

  constructor(
    host: SchedulerHost,
    opts: { lookahead?: number; intervalMs?: number; maxLate?: number } = {},
  ) {
    this.host = host;
    this.lookahead = opts.lookahead ?? DEFAULT_LOOKAHEAD;
    this.intervalMs = opts.intervalMs ?? 25;
    this.maxLate = opts.maxLate ?? MAX_LATE_SECONDS;
  }

  start(): void {
    if (this.timer !== null) return;
    this.tick();
    this.timer = setInterval(() => this.tick(), this.intervalMs);
  }

  stop(): void {
    if (this.timer !== null) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  /** One scheduling pass — public so tests can drive it deterministically. */
  tick(): void {
    const now = this.host.now();
    const dueAudio = now + this.lookahead;
    for (;;) {
      const ev = this.queue.peek();
      if (!ev) break;
      const at = this.host.audioTimeFor(ev.startTime);
      if (at >= dueAudio) break;
      this.queue.shift();
      if (now - at > this.maxLate) continue; // far too late — drop instead of bursting
      this.host.dispatch(ev, Math.max(at, now + 0.003));
    }
    this.host.generate();
  }
}
