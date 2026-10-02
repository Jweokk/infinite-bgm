import type { InstrumentContext, InstrumentInstance, InstrumentPlugin, MusicalEvent } from '../core/types';
import { createPanner, safeWhen, VoiceTracker } from './util';

/** Highpassed noise hat; open hats ring longer with a touch of bandpass shine. */
export function createHatSynth(ctx: InstrumentContext): InstrumentInstance {
  const tracker = new VoiceTracker();

  return {
    trigger(event: MusicalEvent, when: number) {
      const ac = ctx.audioContext;
      const t = safeWhen(ac, when);
      const vel = event.velocity ?? 0.5;
      const open = (event.parameters?.open as boolean) === true;
      const decay = open ? Math.max(0.18, Math.min(0.6, event.duration ?? 0.32)) : 0.055;

      const panner = createPanner(ac, event.pan ?? 0);
      panner.connect(ctx.output);

      const noise = ac.createBufferSource();
      noise.buffer = ctx.noiseBuffer;
      noise.playbackRate.value = 1.4;
      const hp = ac.createBiquadFilter();
      hp.type = 'highpass';
      hp.frequency.value = 7200;
      const bp = ac.createBiquadFilter();
      bp.type = 'bandpass';
      bp.frequency.value = open ? 8600 : 9800;
      bp.Q.value = open ? 0.8 : 1.4;
      const gain = ac.createGain();
      gain.gain.setValueAtTime(0.4 * vel, t);
      gain.gain.exponentialRampToValueAtTime(0.0001, t + decay);
      noise.connect(hp);
      hp.connect(bp);
      bp.connect(gain);
      gain.connect(panner);
      noise.start(t, Math.random() * 1.5, decay + 0.05);
      noise.stop(t + decay + 0.06);

      const voice = {
        kill(killWhen: number, fade: number) {
          gain.gain.cancelScheduledValues(killWhen);
          gain.gain.setTargetAtTime(0.0001, killWhen, Math.max(0.004, fade / 3));
          try {
            noise.stop(killWhen + fade + 0.05);
          } catch {
            /* ignore */
          }
        },
      };
      tracker.add(voice);
      noise.onended = () => {
        tracker.remove(voice);
        try {
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

export const hatPlugin: InstrumentPlugin = { id: 'hat', name: 'Hat Synth', create: createHatSynth };
