import type { InstrumentContext, InstrumentInstance, InstrumentPlugin, MusicalEvent } from '../core/types';
import { eventFreq, safeWhen, VoiceTracker } from './util';

/**
 * Chiptune voice: pure square wave, instant attack, stepped decay —
 * deliberately dry and quantized-sounding. Arps, leads and bass all live
 * here, distinguished only by register and duration.
 */
export function createChipSynth(ctx: InstrumentContext): InstrumentInstance {
  const tracker = new VoiceTracker();

  return {
    trigger(event: MusicalEvent, when: number) {
      const ac = ctx.audioContext;
      const t = safeWhen(ac, when);
      const vel = event.velocity ?? 0.6;
      const dur = Math.max(0.03, event.duration ?? 0.12);
      const freq = eventFreq(event, 64);
      const duty = Number(event.parameters?.duty ?? 0); // unused hint, square only

      const osc = ac.createOscillator();
      osc.type = 'square';
      osc.frequency.value = freq;
      // Gentle cap so pure squares don't pierce.
      const shelf = ac.createBiquadFilter();
      shelf.type = 'lowpass';
      shelf.frequency.value = 8200;
      const gain = ac.createGain();
      osc.connect(shelf);
      shelf.connect(gain);
      gain.connect(ctx.output);

      const g = gain.gain;
      g.setValueAtTime(0.0001, t);
      g.linearRampToValueAtTime(0.16 * vel, t + 0.002);
      g.setTargetAtTime(0.0001, t + dur, 0.02);
      const end = t + dur + 0.09;
      osc.start(t);
      osc.stop(end);
      void duty;

      const voice = {
        kill(killWhen: number, fade: number) {
          g.cancelScheduledValues(killWhen);
          g.setTargetAtTime(0.0001, killWhen, Math.max(0.004, fade / 3));
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
          shelf.disconnect();
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

export const chipSynthPlugin: InstrumentPlugin = {
  id: 'chip',
  name: 'Chip Synth',
  create: createChipSynth,
};
