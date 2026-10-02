import type { InstrumentContext, InstrumentInstance, InstrumentPlugin, MusicalEvent } from '../core/types';
import { midiToFreq } from '../core/music/Theory';
import { applyEnv, createPanner, eventFreq, safeWhen, VoiceTracker } from './util';

/**
 * FM-flavoured electric piano (Rhodes-ish): sine fundamental + tine partial
 * with a fast-decaying bright component, per-voice lowpass and tremolo-free
 * clean tail. Used for lofi chords and melodies.
 */
export function createElectricPiano(ctx: InstrumentContext): InstrumentInstance {
  const tracker = new VoiceTracker();

  function triggerNote(when: number, midi: number, velocity: number, duration: number, pan: number): void {
    const ac = ctx.audioContext;
    const freq = midiToFreq(midi);
    const vel = 0.15 + velocity * 0.85;

    const voiceGain = ac.createGain();
    const filter = ac.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 900 + velocity * 3200;
    filter.Q.value = 0.4;
    const panner = createPanner(ac, pan);
    voiceGain.connect(filter);
    filter.connect(panner);
    panner.connect(ctx.output);

    const oscs: OscillatorNode[] = [];
    const partials: [number, number, OscillatorType, number][] = [
      // [ratio, gain, type, extra decay seconds]
      [1, 1.0, 'sine', 0],
      [1.0015, 0.35, 'triangle', 0],
      [2, 0.28, 'sine', 1.2],
      [4, 0.1, 'sine', 0.35],
    ];
    for (const [ratio, g, type, extraDecay] of partials) {
      const osc = ac.createOscillator();
      osc.type = type;
      osc.frequency.value = freq * ratio;
      const pg = ac.createGain();
      pg.gain.setValueAtTime(g * vel, when);
      if (extraDecay > 0) {
        pg.gain.setTargetAtTime(g * vel * 0.12, when + 0.005, extraDecay / 3);
      }
      osc.connect(pg);
      pg.connect(voiceGain);
      osc.start(when);
      oscs.push(osc);
    }

    const release = Math.min(2.2, 0.25 + duration * 0.6);
    const end = applyEnv(voiceGain.gain, when, duration, {
      attack: 0.004,
      decay: 0.5,
      sustain: 0.45,
      release,
      peak: 0.32,
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
      const vel = event.velocity ?? 0.7;
      const dur = Math.max(0.08, event.duration ?? 0.5);
      const pan = event.pan ?? 0;
      const notes = event.notes?.length ? event.notes : [event.pitch ?? 60];
      // Roll (§76.9): stagger the keys instead of hitting a block chord.
      const roll = Math.min(0.09, Math.max(0, Number(event.parameters?.roll ?? 0)));
      notes.forEach((n, i) => triggerNote(t + Math.min(i * roll, 0.09), n, vel, dur, pan));
    },
    stopAll(when, fade) {
      tracker.stopAll(when, fade);
    },
    setParameter() {
      /* no live parameters yet */
    },
  };
}

export const electricPianoPlugin: InstrumentPlugin = {
  id: 'electric-piano',
  name: 'Electric Piano',
  duck: true,
  create: createElectricPiano,
};
