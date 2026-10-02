import type { InstrumentContext, InstrumentInstance, InstrumentPlugin, MusicalEvent } from '../core/types';
import { createPanner, safeWhen, VoiceTracker } from './util';

/** Noise + tone snare, bandpassed for that dusty lofi crack. */
export function createSnareSynth(ctx: InstrumentContext): InstrumentInstance {
  const tracker = new VoiceTracker();

  return {
    trigger(event: MusicalEvent, when: number) {
      const ac = ctx.audioContext;
      const t = safeWhen(ac, when);
      const vel = event.velocity ?? 0.7;
      const ghost = (event.parameters?.ghost as boolean) === true;
      const decay = ghost ? 0.07 : Math.max(0.08, Math.min(0.25, event.duration ?? 0.16));
      const v = ghost ? vel * 0.35 : vel;

      const panner = createPanner(ac, event.pan ?? 0);
      panner.connect(ctx.output);

      // Noise component
      const noise = ac.createBufferSource();
      noise.buffer = ctx.noiseBuffer;
      noise.playbackRate.value = 1;
      const bp = ac.createBiquadFilter();
      bp.type = 'bandpass';
      bp.frequency.value = ghost ? 2400 : 1750;
      bp.Q.value = 0.9;
      const nGain = ac.createGain();
      nGain.gain.setValueAtTime(0.65 * v, t);
      nGain.gain.exponentialRampToValueAtTime(0.0001, t + decay);
      noise.connect(bp);
      bp.connect(nGain);
      nGain.connect(panner);
      noise.start(t, Math.random() * 1.5, decay + 0.05);
      noise.stop(t + decay + 0.06);

      // Body tone
      const osc = ac.createOscillator();
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(196, t);
      osc.frequency.exponentialRampToValueAtTime(150, t + 0.06);
      const oGain = ac.createGain();
      oGain.gain.setValueAtTime(0.4 * v, t);
      oGain.gain.exponentialRampToValueAtTime(0.0001, t + decay * 0.6);
      osc.connect(oGain);
      oGain.connect(panner);
      osc.start(t);
      osc.stop(t + decay + 0.05);

      const voice = {
        kill(killWhen: number, fade: number) {
          for (const g of [nGain, oGain]) {
            g.gain.cancelScheduledValues(killWhen);
            g.gain.setTargetAtTime(0.0001, killWhen, Math.max(0.004, fade / 3));
          }
          try {
            noise.stop(killWhen + fade + 0.05);
            osc.stop(killWhen + fade + 0.05);
          } catch {
            /* ignore */
          }
        },
      };
      tracker.add(voice);
      osc.onended = () => {
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

export const snarePlugin: InstrumentPlugin = { id: 'snare', name: 'Snare Synth', create: createSnareSynth };
