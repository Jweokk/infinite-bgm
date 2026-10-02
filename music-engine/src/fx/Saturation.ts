import type { FXContext, FXInstance, FXPlugin } from '../core/types';

function makeCurve(drive: number) {
  const n = 1024;
  const curve = new Float32Array(n);
  const k = drive;
  const norm = Math.tanh(k);
  for (let i = 0; i < n; i++) {
    const x = (i / (n - 1)) * 2 - 1;
    curve[i] = Math.tanh(k * x) / (norm || 1);
  }
  return curve;
}

/** Gentle tanh saturation with dry/wet mix. */
export function createSaturation(ctx: FXContext): FXInstance {
  const ac = ctx.audioContext;
  const input = ac.createGain();
  const output = ac.createGain();
  const dry = ac.createGain();
  const wet = ac.createGain();
  const shaper = ac.createWaveShaper();
  shaper.oversample = '2x';
  shaper.curve = makeCurve(1.6);

  input.connect(dry);
  dry.connect(output);
  input.connect(shaper);
  shaper.connect(wet);
  wet.connect(output);

  const setWet = (v: number) => {
    const t = ac.currentTime;
    wet.gain.setTargetAtTime(v, t, 0.05);
    dry.gain.setTargetAtTime(1 - v * 0.6, t, 0.05);
  };
  setWet(0);

  return {
    input,
    output,
    setParameter(name, value) {
      if (name === 'wet') setWet(Math.min(1, Math.max(0, value)));
      else if (name === 'drive') {
        shaper.curve = makeCurve(1 + value * 5);
      }
    },
    reset() {
      setWet(0);
    },
    dispose() {
      try {
        input.disconnect();
        shaper.disconnect();
        wet.disconnect();
        dry.disconnect();
        output.disconnect();
      } catch {
        /* ignore */
      }
    },
  };
}

export const saturationPlugin: FXPlugin = { id: 'saturation', name: 'Saturation', create: createSaturation };
