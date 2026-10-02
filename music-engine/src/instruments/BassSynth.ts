import type { InstrumentContext, InstrumentInstance, InstrumentPlugin, MusicalEvent } from '../core/types';
import { applyEnv, eventFreq, safeWhen, VoiceTracker } from './util';

/** Warm sine/triangle bass with a soft pluck envelope. */
export function createBassSynth(ctx: InstrumentContext): InstrumentInstance {
  const tracker = new VoiceTracker();

  return {
    trigger(event: MusicalEvent, when: number) {
      const ac = ctx.audioContext;
      const t = safeWhen(ac, when);
      const vel = event.velocity ?? 0.7;
      const dur = Math.max(0.1, event.duration ?? 0.5);
      const freq = eventFreq(event, 40);

      const voiceGain = ac.createGain();
      const filter = ac.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.value = 180 + vel * 500;
      filter.Q.value = 1.1;
      voiceGain.connect(filter);
      filter.connect(ctx.output);

      const oscs: OscillatorNode[] = [];
      const sub = ac.createOscillator();
      sub.type = 'sine';
      sub.frequency.value = freq;
      const subG = ac.createGain();
      subG.gain.value = 0.9;
      sub.connect(subG);
      subG.connect(voiceGain);

      const tri = ac.createOscillator();
      tri.type = 'triangle';
      tri.frequency.value = freq * 2;
      tri.detune.value = 4;
      const triG = ac.createGain();
      triG.gain.value = 0.28;
      tri.connect(triG);
      triG.connect(voiceGain);
      oscs.push(sub, tri);

      const end = applyEnv(voiceGain.gain, t, dur, {
        attack: 0.008,
        decay: 0.22,
        sustain: 0.6,
        release: 0.12,
        peak: 0.55 * (0.4 + vel * 0.6),
      });
      for (const o of oscs) o.start(t);

      const voice = {
        kill(killWhen: number, fade: number) {
          voiceGain.gain.cancelScheduledValues(killWhen);
          voiceGain.gain.setTargetAtTime(0.0001, killWhen, Math.max(0.005, fade / 3));
          for (const o of oscs) {
            try {
              o.stop(killWhen + fade + 0.08);
            } catch {
              /* ignore */
            }
          }
        },
      };
      tracker.add(voice);
      sub.onended = () => {
        tracker.remove(voice);
        try {
          voiceGain.disconnect();
          filter.disconnect();
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
      /* no-op */
    },
  };
}

export const bassPlugin: InstrumentPlugin = { id: 'bass', name: 'Bass Synth', duck: true, create: createBassSynth };
