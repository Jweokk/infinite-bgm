import type { FXContext, FXInstance, FXPlugin } from '../core/types';

const BASE_WOW = 0.0011;
const BASE_FLUTTER = 0.00016;

/**
 * Tape emulation: wow (slow) + flutter (fast) delay modulation, head bump and
 * a slightly dark top end, with dry/wet mix. The `wobble` param scales the
 * pitch-drift depth (Dream uses it as an identity feature, v1.4).
 */
export function createTape(ctx: FXContext): FXInstance {
  const ac = ctx.audioContext;
  const input = ac.createGain();
  const output = ac.createGain();
  const dry = ac.createGain();
  const wet = ac.createGain();

  const hp = ac.createBiquadFilter();
  hp.type = 'highpass';
  hp.frequency.value = 32;
  const lp = ac.createBiquadFilter();
  lp.type = 'lowpass';
  lp.frequency.value = 10500;
  const delay = ac.createDelay(0.1);
  delay.delayTime.value = 0.012;
  const bump = ac.createBiquadFilter();
  bump.type = 'peaking';
  bump.frequency.value = 110;
  bump.Q.value = 0.9;
  bump.gain.value = 2.5;

  input.connect(dry);
  dry.connect(output);
  input.connect(hp);
  hp.connect(lp);
  lp.connect(delay);
  delay.connect(bump);
  bump.connect(wet);
  wet.connect(output);

  const wow = ac.createOscillator();
  wow.type = 'sine';
  wow.frequency.value = 0.45;
  const wowG = ac.createGain();
  wowG.gain.value = BASE_WOW;
  wow.connect(wowG);
  wowG.connect(delay.delayTime);
  const flutter = ac.createOscillator();
  flutter.type = 'sine';
  flutter.frequency.value = 5.6;
  const flutterG = ac.createGain();
  flutterG.gain.value = BASE_FLUTTER;
  flutter.connect(flutterG);
  flutterG.connect(delay.delayTime);
  wow.start();
  flutter.start();

  const setWet = (v: number) => {
    const t = ac.currentTime;
    wet.gain.setTargetAtTime(v, t, 0.08);
    dry.gain.setTargetAtTime(1 - v * 0.55, t, 0.08);
  };
  setWet(0);

  return {
    input,
    output,
    setParameter(name, value) {
      const t = ac.currentTime;
      if (name === 'wet') setWet(Math.min(1, Math.max(0, value)));
      else if (name === 'bump') bump.gain.setTargetAtTime(value * 4, t, 0.1);
      else if (name === 'wobble') {
        const w = Math.min(4, Math.max(0.1, value));
        wowG.gain.setTargetAtTime(BASE_WOW * w, t, 0.1);
        flutterG.gain.setTargetAtTime(BASE_FLUTTER * w, t, 0.1);
      }
    },
    reset() {
      setWet(0);
      this.setParameter('wobble', 1);
    },
    dispose() {
      try {
        wow.stop();
        flutter.stop();
        input.disconnect();
        output.disconnect();
      } catch {
        /* ignore */
      }
    },
  };
}

export const tapePlugin: FXPlugin = { id: 'tape', name: 'Tape', create: createTape };
