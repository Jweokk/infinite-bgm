import type { InstrumentContext, InstrumentInstance, InstrumentPlugin, MusicalEvent } from '../core/types';
import { safeWhen, VoiceTracker } from './util';

/** Classic pitched-down sine kick with a tiny click transient. */
export function createKickSynth(ctx: InstrumentContext): InstrumentInstance {
  const tracker = new VoiceTracker();

  return {
    trigger(event: MusicalEvent, when: number) {
      const ac = ctx.audioContext;
      const t = safeWhen(ac, when);
      const vel = event.velocity ?? 0.9;
      const decay = Math.max(0.15, Math.min(0.6, event.duration ?? 0.32));
      const startFreq = (event.parameters?.startFreq as number) ?? 130;

      const osc = ac.createOscillator();
      osc.type = 'sine';
      const gain = ac.createGain();
      osc.connect(gain);
      gain.connect(ctx.output);

      osc.frequency.setValueAtTime(startFreq, t);
      osc.frequency.exponentialRampToValueAtTime(44, t + Math.min(0.12, decay * 0.5));
      gain.gain.setValueAtTime(0.0001, t);
      gain.gain.linearRampToValueAtTime(1.05 * vel, t + 0.003);
      gain.gain.exponentialRampToValueAtTime(0.0001, t + decay);

      // Click layer
      const click = ac.createBufferSource();
      click.buffer = ctx.noiseBuffer;
      const clickF = ac.createBiquadFilter();
      clickF.type = 'highpass';
      clickF.frequency.value = 2500;
      const clickG = ac.createGain();
      clickG.gain.setValueAtTime(0.12 * vel, t);
      clickG.gain.exponentialRampToValueAtTime(0.0001, t + 0.012);
      click.connect(clickF);
      clickF.connect(clickG);
      clickG.connect(ctx.output);
      click.start(t, Math.random() * 1.5, 0.03);
      click.stop(t + 0.05);

      const end = t + decay + 0.05;
      osc.start(t);
      osc.stop(end);
      const voice = {
        kill(killWhen: number, fade: number) {
          gain.gain.cancelScheduledValues(killWhen);
          gain.gain.setTargetAtTime(0.0001, killWhen, Math.max(0.004, fade / 3));
          clickG.gain.cancelScheduledValues(killWhen);
          clickG.gain.setTargetAtTime(0.0001, killWhen, Math.max(0.004, fade / 3));
          try {
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
          gain.disconnect();
          clickG.disconnect();
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

export const kickPlugin: InstrumentPlugin = { id: 'kick', name: 'Kick Synth', create: createKickSynth };
