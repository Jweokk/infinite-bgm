import type { InstrumentContext, InstrumentInstance, InstrumentPlugin, MusicalEvent } from '../core/types';
import { midiToFreq } from '../core/music/Theory';
import { createStereoMovement } from '../spatial/StereoMovement';
import { applyEnv, safeWhen, VoiceTracker } from './util';

/**
 * Long evolving drone voice: sine + fifth + octave (optionally soft saw),
 * slow detune/filter/pan LFOs with 20–180s periods (PRD §30).
 */
export function createDroneSynth(ctx: InstrumentContext): InstrumentInstance {
  const tracker = new VoiceTracker();

  return {
    trigger(event: MusicalEvent, when: number) {
      const ac = ctx.audioContext;
      const t = safeWhen(ac, when);
      const dur = Math.max(8, Math.min(240, event.duration ?? 45));
      const freq = midiToFreq(Math.min(60, Math.max(24, event.pitch ?? 38)));
      const vel = event.velocity ?? 0.5;
      const warmth = (event.parameters?.warmth as number) ?? 0.6;
      const movement = (event.parameters?.movement as number) ?? 0.3;
      const cutoff = (event.parameters?.cutoff as number) ?? 420 + warmth * 380;

      const voiceGain = ac.createGain();
      const filter = ac.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.value = cutoff;
      filter.Q.value = 0.6;
      const movementHandle = createStereoMovement(ac, {
        rate: 1 / (30 + Math.random() * 60),
        depth: movement * 0.55,
        center: (event.pan ?? 0) * 0.5,
      });
      voiceGain.connect(filter);
      filter.connect(movementHandle.pan);
      movementHandle.pan.connect(ctx.output);

      const lfos: OscillatorNode[] = [];
      // Slow filter breathing.
      const fLfo = ac.createOscillator();
      fLfo.type = 'sine';
      fLfo.frequency.value = 1 / (45 + Math.random() * 60);
      const fLfoG = ac.createGain();
      fLfoG.gain.value = cutoff * 0.4;
      fLfo.connect(fLfoG);
      fLfoG.connect(filter.frequency);
      fLfo.start(t);
      lfos.push(fLfo);

      const oscs: OscillatorNode[] = [];
      const layers: [number, number, OscillatorType][] = [
        [1, 0.5, 'sine'],
        [1.5, 0.22, 'sine'],
        [2, 0.16, 'triangle'],
      ];
      if (warmth > 0.55) layers.push([1, 0.1 * warmth, 'sawtooth']);
      for (const [ratio, g, type] of layers) {
        const osc = ac.createOscillator();
        osc.type = type;
        osc.frequency.value = freq * ratio;
        const lg = ac.createGain();
        lg.gain.value = g;
        osc.connect(lg);
        lg.connect(voiceGain);

        // Slow detune drift, independent per layer.
        const dLfo = ac.createOscillator();
        dLfo.type = 'sine';
        dLfo.frequency.value = 1 / (25 + Math.random() * 100);
        const dLfoG = ac.createGain();
        dLfoG.gain.value = 3.5;
        dLfo.connect(dLfoG);
        dLfoG.connect(osc.detune);
        dLfo.start(t);
        lfos.push(dLfo);

        osc.start(t);
        oscs.push(osc);
      }

      const attack = Math.min(8, dur * 0.18);
      const release = Math.min(12, dur * 0.22);
      const end = applyEnv(voiceGain.gain, t, dur, {
        attack,
        release,
        peak: 0.4 * (0.5 + vel * 0.5),
      });

      const voice = {
        kill(killWhen: number, fade: number) {
          voiceGain.gain.cancelScheduledValues(killWhen);
          voiceGain.gain.setTargetAtTime(0.0001, killWhen, Math.max(0.01, fade / 3));
          for (const o of [...oscs, ...lfos]) {
            try {
              o.stop(killWhen + fade + 0.2);
            } catch {
              /* ignore */
            }
          }
          movementHandle.stop(killWhen + fade + 0.2);
        },
      };
      tracker.add(voice);
      oscs[0].onended = () => {
        tracker.remove(voice);
        movementHandle.stop(ac.currentTime);
        for (const o of lfos) {
          try {
            o.stop(ac.currentTime);
          } catch {
            /* ignore */
          }
        }
        try {
          voiceGain.disconnect();
          filter.disconnect();
        } catch {
          /* ignore */
        }
      };
      for (const o of oscs) o.stop(end);
      for (const o of lfos) o.stop(end);
    },
    stopAll(when, fade) {
      tracker.stopAll(when, fade);
    },
    setParameter() {
      /* no-op */
    },
  };
}

export const dronePlugin: InstrumentPlugin = { id: 'drone', name: 'Drone Synth', create: createDroneSynth };
