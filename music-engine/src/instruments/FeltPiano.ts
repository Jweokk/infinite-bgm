import type { InstrumentContext, InstrumentInstance, InstrumentPlugin, MusicalEvent } from '../core/types';
import { applyEnv, createPanner, eventFreq, safeWhen, VoiceTracker } from './util';

/**
 * Felt piano: a darker, softer sibling of the electric piano with a
 * mechanical felt-thump layer on the attack — the neo-classical voice.
 */
export function createFeltPiano(ctx: InstrumentContext): InstrumentInstance {
  const tracker = new VoiceTracker();

  function triggerNote(when: number, midi: number, velocity: number, duration: number, pan: number): void {
    const ac = ctx.audioContext;
    const freq = eventFreq({ pitch: midi } as MusicalEvent, 60);
    const vel = 0.12 + velocity * 0.88;

    const voiceGain = ac.createGain();
    const filter = ac.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 550 + velocity * 1100; // much darker than the EP
    filter.Q.value = 0.3;
    const panner = createPanner(ac, pan);
    voiceGain.connect(filter);
    filter.connect(panner);
    panner.connect(ctx.output);

    const oscs: OscillatorNode[] = [];
    const partials: [number, number, OscillatorType, number][] = [
      [1, 1.0, 'sine', 0],
      [1.002, 0.4, 'triangle', 0],
      [2, 0.14, 'sine', 0.9],
      [3, 0.05, 'sine', 0.3],
    ];
    for (const [ratio, g, type, extraDecay] of partials) {
      const osc = ac.createOscillator();
      osc.type = type;
      osc.frequency.value = freq * ratio;
      const pg = ac.createGain();
      pg.gain.setValueAtTime(g * vel, when);
      if (extraDecay > 0) {
        pg.gain.setTargetAtTime(g * vel * 0.08, when + 0.01, extraDecay / 3);
      }
      osc.connect(pg);
      pg.connect(voiceGain);
      osc.start(when);
      oscs.push(osc);
    }

    // Felt thump: a soft broadband knock under the attack.
    const thump = ac.createBufferSource();
    thump.buffer = ctx.noiseBuffer;
    const thumpF = ac.createBiquadFilter();
    thumpF.type = 'lowpass';
    thumpF.frequency.value = 850;
    const thumpG = ac.createGain();
    thumpG.gain.setValueAtTime(0.05 * vel, when);
    thumpG.gain.exponentialRampToValueAtTime(0.0001, when + 0.05);
    thump.connect(thumpF);
    thumpF.connect(thumpG);
    thumpG.connect(panner);
    thump.start(when, Math.random() * 1.5, 0.06);
    thump.stop(when + 0.09);

    const release = Math.min(3.2, 0.4 + duration * 0.8);
    const end = applyEnv(voiceGain.gain, when, duration, {
      attack: 0.012,
      decay: 0.9,
      sustain: 0.35,
      release,
      peak: 0.3,
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
      for (const n of [voiceGain, filter, panner]) {
        try {
          n.disconnect();
        } catch {
          /* ignore */
        }
      }
    };
    for (const o of oscs) o.stop(end);
  }

  return {
    trigger(event: MusicalEvent, when: number) {
      const t = safeWhen(ctx.audioContext, when);
      const vel = event.velocity ?? 0.6;
      const dur = Math.max(0.15, event.duration ?? 1);
      const pan = event.pan ?? 0;
      const notes = event.notes?.length ? event.notes : [event.pitch ?? 60];
      const roll = Math.min(0.06, Math.max(0, Number(event.parameters?.roll ?? 0)));
      notes.forEach((n, i) => triggerNote(t + Math.min(i * roll, 0.06), n, vel, dur, pan));
    },
    stopAll(when, fade) {
      tracker.stopAll(when, fade);
    },
    setParameter() {
      /* no-op */
    },
  };
}

export const feltPianoPlugin: InstrumentPlugin = {
  id: 'felt-piano',
  name: 'Felt Piano',
  create: createFeltPiano,
};
