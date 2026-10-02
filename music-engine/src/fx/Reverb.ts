import type { FXContext, FXInstance, FXPlugin } from '../core/types';

/**
 * Convolution reverb with procedurally generated impulse responses
 * (exponentially decaying filtered noise). Decay is bucketed to avoid
 * regenerating the IR on every tweak.
 */
export function createReverb(ctx: FXContext): FXInstance {
  const ac = ctx.audioContext;
  const input = ac.createGain();
  const output = ac.createGain();
  const dry = ac.createGain();
  const wet = ac.createGain();
  const predelay = ac.createDelay(0.2);
  predelay.delayTime.value = 0.02;
  const convolver = ac.createConvolver();

  input.connect(dry);
  dry.connect(output);
  input.connect(predelay);
  predelay.connect(convolver);
  convolver.connect(wet);
  wet.connect(output);

  const buckets = [1.5, 3, 5, 8, 12];
  let currentBucket = -1;

  function buildIR(decaySeconds: number, damping: number): AudioBuffer {
    const rate = ac.sampleRate;
    const len = Math.max(1, Math.floor(rate * decaySeconds));
    const buf = ac.createBuffer(2, len, rate);
    for (let ch = 0; ch < 2; ch++) {
      const data = buf.getChannelData(ch);
      let lp = 0;
      const damp = 0.2 + damping * 0.75; // one-pole coefficient
      for (let i = 0; i < len; i++) {
        const t = i / len;
        const envelope = Math.pow(1 - t, 2.1);
        const white = Math.random() * 2 - 1;
        lp += damp * (white - lp);
        data[i] = lp * envelope * (i < rate * 0.01 ? 0.4 + (i / (rate * 0.01)) * 0.6 : 1);
      }
    }
    return buf;
  }

  function setDecay(seconds: number, damping = 0.5) {
    const clamped = Math.min(12, Math.max(0.3, seconds));
    let bucket = buckets[0];
    for (const b of buckets) {
      if (clamped <= b) {
        bucket = b;
        break;
      }
      bucket = b;
    }
    if (bucket !== currentBucket) {
      currentBucket = bucket;
      convolver.buffer = buildIR(bucket, damping);
    }
  }
  setDecay(3);

  const setWet = (v: number) => {
    const t = ac.currentTime;
    wet.gain.setTargetAtTime(v, t, 0.1);
    dry.gain.setTargetAtTime(1 - v * 0.35, t, 0.1);
  };
  setWet(0.2);

  return {
    input,
    output,
    setParameter(name, value) {
      if (name === 'wet') setWet(Math.min(1.2, Math.max(0, value)));
      else if (name === 'decay') setDecay(value);
      else if (name === 'predelay') predelay.delayTime.setTargetAtTime(Math.min(0.15, Math.max(0, value)), ac.currentTime, 0.1);
    },
    reset() {
      setWet(0.2);
      setDecay(3);
      predelay.delayTime.setTargetAtTime(0.02, ac.currentTime, 0.05);
    },
    dispose() {
      try {
        input.disconnect();
        output.disconnect();
      } catch {
        /* ignore */
      }
    },
  };
}

export const reverbPlugin: FXPlugin = { id: 'reverb', name: 'Reverb', create: createReverb };
