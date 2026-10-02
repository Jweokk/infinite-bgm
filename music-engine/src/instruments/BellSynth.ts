import type { InstrumentContext, InstrumentInstance, InstrumentPlugin, MusicalEvent } from '../core/types';
import { midiToFreq } from '../core/music/Theory';
import { applyEnv, createPanner, safeWhen, VoiceTracker } from './util';

/**
 * Additive bell with inharmonic partials, slight detune and slow amplitude
 * modulation — long, soft decays for Zen (PRD §29).
 */
function createAdditiveBell(ctx: InstrumentContext, partials: [number, number][]) {
  const tracker = new VoiceTracker();
  return {
    trigger(event: MusicalEvent, when: number) {
      const ac = ctx.audioContext;
      const t = safeWhen(ac, when);
      const vel = event.velocity ?? 0.6;
      const dur = Math.max(2, Math.min(24, event.duration ?? 10));
      const freq = midiToFreq(Math.min(96, Math.max(36, event.pitch ?? 72)));
      // v1.5 softness: never allow razor attacks; bells should bloom.
      const attack = Math.max(0.05, (event.parameters?.attack as number) ?? 0.09);
      const detune = (event.parameters?.detune as number) ?? 3;
      const pan = event.pan ?? 0;

      const voiceGain = ac.createGain();
      // Darken the top of each strike — the inharmonic partials above ~3kHz
      // were what made bells pierce through quiet passages.
      const voiceLp = ac.createBiquadFilter();
      voiceLp.type = 'lowpass';
      voiceLp.frequency.value = Math.min(4200, 1100 + freq * 1.6);
      voiceLp.Q.value = 0.4;
      const panner = createPanner(ac, pan);
      voiceGain.connect(voiceLp);
      voiceLp.connect(panner);
      panner.connect(ctx.output);

      // Slow amplitude modulation for a breathing, metallic shimmer.
      const am = ac.createOscillator();
      am.type = 'sine';
      am.frequency.value = 0.12 + Math.random() * 0.25;
      const amGain = ac.createGain();
      amGain.gain.value = 0.06;
      am.connect(amGain);
      amGain.connect(voiceGain.gain);
      am.start(t);

      const oscs: OscillatorNode[] = [];
      partials.forEach(([ratio, g], i) => {
        const osc = ac.createOscillator();
        osc.type = 'sine';
        osc.frequency.value = freq * ratio;
        osc.detune.value = ((i % 2 === 0 ? 1 : -1) * detune) / (1 + i * 0.5);
        const pg = ac.createGain();
        // Higher partials fade faster.
        const partialDecay = dur * (1 / (1 + i * 0.8));
        pg.gain.setValueAtTime(g * vel, t + attack * (1 + i * 0.3));
        pg.gain.setTargetAtTime(g * vel * 0.02, t + attack + 0.01, partialDecay / 3);
        osc.connect(pg);
        pg.connect(voiceGain);
        osc.start(t);
        oscs.push(osc);
      });

      const end = applyEnv(voiceGain.gain, t, dur, {
        attack,
        release: Math.min(8, dur * 0.5),
        peak: 0.2,
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
          try {
            am.stop(killWhen + fade + 0.1);
          } catch {
            /* ignore */
          }
        },
      };
      tracker.add(voice);
      oscs[0].onended = () => {
        tracker.remove(voice);
        try {
          am.stop(end);
        } catch {
          /* ignore */
        }
        try {
          voiceGain.disconnect();
          voiceLp.disconnect();
          panner.disconnect();
        } catch {
          /* ignore */
        }
      };
      for (const o of oscs) o.stop(end);
      am.stop(end);
    },
    stopAll(when: number, fade: number) {
      tracker.stopAll(when, fade);
    },
    setParameter() {
      /* no-op */
    },
  } satisfies InstrumentInstance;
}

export function createBellSynth(ctx: InstrumentContext): InstrumentInstance {
  // Bell: brighter, church-bell-ish inharmonic stack.
  return createAdditiveBell(ctx, [
    [1, 1],
    [2.4, 0.3],
    [3.97, 0.12],
    [5.07, 0.05],
    [6.9, 0.02],
  ]);
}

export function createBowlSynth(ctx: InstrumentContext): InstrumentInstance {
  // Singing bowl partials straight from the PRD (§29).
  return createAdditiveBell(ctx, [
    [1, 1],
    [2.01, 0.42],
    [2.71, 0.2],
    [4.13, 0.09],
    [5.73, 0.035],
  ]);
}

export const bellPlugin: InstrumentPlugin = { id: 'bell', name: 'Bell Synth', create: createBellSynth };
export const bowlPlugin: InstrumentPlugin = { id: 'bowl', name: 'Singing Bowl Synth', create: createBowlSynth };
