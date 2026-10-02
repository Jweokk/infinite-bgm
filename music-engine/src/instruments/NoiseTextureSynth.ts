import type { InstrumentContext, InstrumentInstance, InstrumentPlugin, MusicalEvent } from '../core/types';
import { createStereoMovement } from '../spatial/StereoMovement';
import { applyEnv, safeWhen, VoiceTracker } from './util';

/**
 * Procedural environment textures: air / wind / rain / water / room tone,
 * built entirely from filtered noise (PRD §32) — no samples.
 */
export function createNoiseTextureSynth(ctx: InstrumentContext): InstrumentInstance {
  const tracker = new VoiceTracker();

  return {
    trigger(event: MusicalEvent, when: number) {
      const ac = ctx.audioContext;
      const t = safeWhen(ac, when);
      const dur = Math.max(4, Math.min(300, event.duration ?? 60));
      const vel = event.velocity ?? 0.3;
      const kind = String(event.parameters?.texture ?? 'air');
      const movement = (event.parameters?.movement as number) ?? 0.2;

      const source = ac.createBufferSource();
      source.buffer = ctx.noiseBuffer;
      source.loop = true;

      const filterA = ac.createBiquadFilter();
      const filterB = ac.createBiquadFilter();
      const gain = ac.createGain();
      const movementHandle = createStereoMovement(ac, {
        rate: 1 / (40 + Math.random() * 50),
        depth: movement * 0.4,
        center: event.pan ?? 0,
      });
      source.connect(filterA);
      filterA.connect(filterB);
      filterB.connect(gain);
      gain.connect(movementHandle.pan);
      movementHandle.pan.connect(ctx.output);

      const lfos: OscillatorNode[] = [];
      switch (kind) {
        case 'wind': {
          filterA.type = 'bandpass';
          filterA.frequency.value = 420;
          filterA.Q.value = 1.6;
          filterB.type = 'lowpass';
          filterB.frequency.value = 1400;
          const lfo = ac.createOscillator();
          lfo.type = 'sine';
          lfo.frequency.value = 0.07;
          const lfoG = ac.createGain();
          lfoG.gain.value = 220;
          lfo.connect(lfoG);
          lfoG.connect(filterA.frequency);
          lfo.start(t);
          lfos.push(lfo);
          break;
        }
        case 'rain': {
          filterA.type = 'highpass';
          filterA.frequency.value = 3600;
          filterB.type = 'highpass';
          filterB.frequency.value = 5200;
          // Amplitude flutter.
          const lfo = ac.createOscillator();
          lfo.type = 'sine';
          lfo.frequency.value = 4.5;
          const lfoG = ac.createGain();
          lfoG.gain.value = 0.35;
          lfo.connect(lfoG);
          lfoG.connect(gain.gain);
          lfo.start(t);
          lfos.push(lfo);
          break;
        }
        case 'water': {
          filterA.type = 'bandpass';
          filterA.frequency.value = 1100;
          filterA.Q.value = 3.5;
          filterB.type = 'lowpass';
          filterB.frequency.value = 3200;
          const lfo = ac.createOscillator();
          lfo.type = 'sine';
          lfo.frequency.value = 0.6;
          const lfoG = ac.createGain();
          lfoG.gain.value = 500;
          lfo.connect(lfoG);
          lfoG.connect(filterA.frequency);
          lfo.start(t);
          lfos.push(lfo);
          break;
        }
        case 'room': {
          filterA.type = 'lowpass';
          filterA.frequency.value = 260;
          filterB.type = 'lowpass';
          filterB.frequency.value = 700;
          break;
        }
        default: {
          // 'air' — v1.5: darker bed (was 5.2k+, read as constant hiss)
          filterA.type = 'highpass';
          filterA.frequency.value = 3800;
          filterB.type = 'lowpass';
          filterB.frequency.value = 8500;
          break;
        }
      }

      const end = applyEnv(gain.gain, t, dur, {
        attack: Math.min(12, dur * 0.2),
        release: Math.min(25, dur * 0.3),
        peak: 0.12 * (0.4 + vel * 0.6),
      });
      source.start(t);
      source.stop(end);

      const voice = {
        kill(killWhen: number, fade: number) {
          gain.gain.cancelScheduledValues(killWhen);
          gain.gain.setTargetAtTime(0.0001, killWhen, Math.max(0.01, fade / 2));
          try {
            source.stop(killWhen + fade * 2 + 0.2);
          } catch {
            /* ignore */
          }
          movementHandle.stop(killWhen + fade * 2 + 0.2);
        },
      };
      tracker.add(voice);
      source.onended = () => {
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
          gain.disconnect();
        } catch {
          /* ignore */
        }
      };
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

export const noiseTexturePlugin: InstrumentPlugin = {
  id: 'noise-texture',
  name: 'Noise Texture Synth',
  duck: true,
  create: createNoiseTextureSynth,
};
