import type { InstrumentContext, InstrumentInstance, InstrumentPlugin, MusicalEvent } from '../core/types';
import { applyEnv, createPanner, eventFreq, safeWhen, VoiceTracker } from './util';

/** Plucked string: quick filter sweep decaying into a soft body. */
export function createPluckSynth(ctx: InstrumentContext): InstrumentInstance {
  const tracker = new VoiceTracker();

  return {
    trigger(event: MusicalEvent, when: number) {
      const ac = ctx.audioContext;
      const t = safeWhen(ac, when);
      const vel = event.velocity ?? 0.6;
      const dur = Math.max(0.15, Math.min(8, event.duration ?? 1.2));
      const freq = eventFreq(event, 64);
      const bright = (event.parameters?.bright as number) ?? 0.6;

      const panner = createPanner(ac, event.pan ?? 0);
      panner.connect(ctx.output);

      const osc = ac.createOscillator();
      osc.type = bright > 0.5 ? 'sawtooth' : 'triangle';
      osc.frequency.value = freq;
      const filter = ac.createBiquadFilter();
      filter.type = 'lowpass';
      filter.Q.value = 2.5;
      filter.frequency.setValueAtTime(600 + vel * 4200 * bright, t);
      filter.frequency.exponentialRampToValueAtTime(240, t + Math.min(1.2, dur * 0.8));
      const gain = ac.createGain();
      osc.connect(filter);
      filter.connect(gain);
      gain.connect(panner);

      const end = applyEnv(gain.gain, t, dur, {
        attack: 0.005,
        decay: dur * 0.5,
        sustain: 0.25,
        release: Math.min(2, dur * 0.4),
        peak: 0.4 * (0.35 + vel * 0.65),
      });
      osc.start(t);
      osc.stop(end);

      const voice = {
        kill(killWhen: number, fade: number) {
          gain.gain.cancelScheduledValues(killWhen);
          gain.gain.setTargetAtTime(0.0001, killWhen, Math.max(0.005, fade / 3));
          try {
            osc.stop(killWhen + fade + 0.1);
          } catch {
            /* ignore */
          }
        },
      };
      tracker.add(voice);
      osc.onended = () => {
        tracker.remove(voice);
        try {
          gain.disconnect();
          panner.disconnect();
        } catch {
          /* ignore */
        }
      };
    },
    stopAll(when, fade) {
      tracker.stopAll(when, fade);
    },
    setParameter() {
      /* no-op */
    },
  };
}

export const pluckPlugin: InstrumentPlugin = { id: 'pluck', name: 'Pluck Synth', create: createPluckSynth };
