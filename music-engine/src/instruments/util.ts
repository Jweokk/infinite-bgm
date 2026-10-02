import type { MusicalEvent } from '../core/types';
import { midiToFreq } from '../core/music/Theory';

/** A scheduled voice that can be faded out and hard-killed. */
export interface Voice {
  kill(when: number, fade: number): void;
}

/** Tracks live voices so pause/stop/transition can release them cleanly. */
export class VoiceTracker {
  private voices = new Set<Voice>();

  add(v: Voice): void {
    this.voices.add(v);
  }

  remove(v: Voice): void {
    this.voices.delete(v);
  }

  stopAll(when: number, fade: number): void {
    for (const v of [...this.voices]) {
      try {
        v.kill(when, fade);
      } catch {
        /* ignore */
      }
    }
    this.voices.clear();
  }
}

export interface EnvOpts {
  attack: number;
  /** Decay time to the sustain level (0 = none). */
  decay?: number;
  /** Sustain level 0..1 relative to peak. */
  sustain?: number;
  /** Release time in seconds. */
  release: number;
  peak: number;
}

/**
 * Standard ADSR-ish envelope written with exact audio-clock times.
 * Returns the time at which the voice is fully finished.
 */
export function applyEnv(p: AudioParam, when: number, dur: number, o: EnvOpts): number {
  const a = Math.max(0.002, o.attack);
  const d = Math.max(0, o.decay ?? 0);
  const s = Math.max(0.0001, o.sustain ?? 1);
  p.setValueAtTime(0.0001, when);
  p.linearRampToValueAtTime(Math.max(0.0001, o.peak), when + a);
  if (d > 0) p.linearRampToValueAtTime(Math.max(0.0001, o.peak * s), when + a + d);
  const relStart = Math.max(when + a + d, when + dur);
  if (relStart > when + a + d + 0.001) {
    p.setValueAtTime(Math.max(0.0001, o.peak * s), relStart);
  }
  p.setTargetAtTime(0.0001, relStart, Math.max(0.008, o.release / 3.5));
  return relStart + o.release + 0.2;
}

export function safeWhen(ctx: AudioContext, when: number): number {
  return Math.max(when, ctx.currentTime + 0.003);
}

export function eventFreq(event: MusicalEvent, fallback = 60): number {
  const midi = event.pitch ?? fallback;
  return midiToFreq(Math.min(108, Math.max(21, midi)));
}

/** Panner with graceful fallback for very old browsers. */
export function createPanner(ctx: AudioContext, pan: number): AudioNode {
  if (typeof ctx.createStereoPanner === 'function') {
    const p = ctx.createStereoPanner();
    p.pan.value = Math.min(1, Math.max(-1, pan));
    return p;
  }
  return ctx.createGain();
}

/** Clamp helper shared by instruments. */
export function clamp01(v: number): number {
  return v < 0 ? 0 : v > 1 ? 1 : v;
}
