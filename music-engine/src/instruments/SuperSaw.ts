import type { InstrumentContext, InstrumentInstance, InstrumentPlugin, MusicalEvent } from '../core/types';
import { applyEnv, createPanner, eventFreq, safeWhen, VoiceTracker } from './util';

/**
 * Detuned sawtooth stack (supersaw): 6 oscillators spread across a detune
 * window through a shared lowpass. Pads (long, dark) and leads/stabs
 * (short, bright) both live here, steered by event parameters.
 */
export function createSuperSaw(ctx: InstrumentContext): InstrumentInstance {
  const tracker = new VoiceTracker();

  return {
    trigger(event: MusicalEvent, when: number) {
      const ac = ctx.audioContext;
      const t = safeWhen(ac, when);
      const vel = event.velocity ?? 0.5;
      const dur = Math.max(0.05, event.duration ?? 0.3);
      const freq = eventFreq(event, 55);
      const width = Number(event.parameters?.width ?? 16); // detune cents
      const cutoff = Number(event.parameters?.cutoff ?? 900 + vel * 2200);
      const attack = Number(event.parameters?.attack ?? 0.04);

      const voiceGain = ac.createGain();
      const filter = ac.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.value = cutoff;
      filter.Q.value = 0.7;
      const panner = createPanner(ac, event.pan ?? 0);
      voiceGain.connect(filter);
      filter.connect(panner);
      panner.connect(ctx.output);

      const oscs: OscillatorNode[] = [];
      const VOICES = 6;
      for (let i = 0; i < VOICES; i++) {
        const osc = ac.createOscillator();
        osc.type = 'sawtooth';
        osc.frequency.value = freq;
        osc.detune.value = ((i / (VOICES - 1)) - 0.5) * 2 * width;
        const g = ac.createGain();
        g.gain.value = 0.16;
        osc.connect(g);
        g.connect(voiceGain);
        osc.start(t);
        oscs.push(osc);
      }

      const release = Math.min(2.5, 0.12 + dur * 0.35);
      const end = applyEnv(voiceGain.gain, t, dur, {
        attack,
        release,
        peak: 0.32 * (0.4 + vel * 0.6),
      });

      const voice = {
        kill(killWhen: number, fade: number) {
          voiceGain.gain.cancelScheduledValues(killWhen);
          voiceGain.gain.setTargetAtTime(0.0001, killWhen, Math.max(0.005, fade / 3));
          for (const o of oscs) {
            try {
              o.stop(killWhen + fade + 0.1);
            } catch {
              /* ignore */
            }
          }
        },
      };
      tracker.add(voice);
      oscs[0].onended = () => {
        tracker.remove(voice);
        try {
          voiceGain.disconnect();
          filter.disconnect();
          panner.disconnect();
        } catch {
          /* ignore */
        }
      };
      for (const o of oscs) o.stop(end);
    },
    stopAll(when, fade) {
      tracker.stopAll(when, fade);
    },
    setParameter() {
      /* steered per event */
    },
  };
}

export const superSawPlugin: InstrumentPlugin = {
  id: 'supersaw',
  name: 'Super Saw',
  duck: true,
  create: createSuperSaw,
};
