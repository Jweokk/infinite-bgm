import type { FXContext, FXInstance, FXPlugin } from '../core/types';

/**
 * Vinyl texture: a filtered noise bed plus a looping crackle buffer with
 * sparse random impulses and low thumps. `amount` scales both.
 */
export function createVinyl(ctx: FXContext): FXInstance {
  const ac = ctx.audioContext;
  const output = ac.createGain();
  output.gain.value = 0;

  // Hiss bed
  const hiss = ac.createBufferSource();
  hiss.buffer = ctx.noiseBuffer;
  hiss.loop = true;
  const hissFilter = ac.createBiquadFilter();
  hissFilter.type = 'bandpass';
  hissFilter.frequency.value = 1600;
  hissFilter.Q.value = 0.35;
  const hissGain = ac.createGain();
  hissGain.gain.value = 0.05;
  hiss.connect(hissFilter);
  hissFilter.connect(hissGain);
  hissGain.connect(output);
  hiss.start();

  // Crackle: 4s loop with random impulses.
  const len = Math.floor(ac.sampleRate * 4);
  const crackleBuffer = ac.createBuffer(1, len, ac.sampleRate);
  const data = crackleBuffer.getChannelData(0);
  let i = 0;
  while (i < len) {
    if (Math.random() < 0.00035) {
      const amp = (Math.random() * 2 - 1) * 0.9;
      const decay = 30 + Math.floor(Math.random() * 120);
      for (let k = 0; k < decay && i + k < len; k++) {
        data[i + k] += amp * Math.pow(1 - k / decay, 2);
      }
      i += decay;
    } else {
      i++;
    }
  }
  const crackle = ac.createBufferSource();
  crackle.buffer = crackleBuffer;
  crackle.loop = true;
  const crackleFilter = ac.createBiquadFilter();
  crackleFilter.type = 'lowpass';
  crackleFilter.frequency.value = 7000;
  const crackleGain = ac.createGain();
  crackleGain.gain.value = 0.35;
  crackle.connect(crackleFilter);
  crackleFilter.connect(crackleGain);
  crackleGain.connect(output);
  crackle.start();

  const setAmount = (v: number) => {
    const a = Math.min(1, Math.max(0, v));
    output.gain.setTargetAtTime(a, ac.currentTime, 0.15);
  };
  setAmount(0);

  return {
    // Vinyl ignores its input — it *adds* texture into the chain head.
    input: output,
    output,
    setParameter(name, value) {
      if (name === 'amount') setAmount(value);
      else if (name === 'crackle') crackleGain.gain.setTargetAtTime(Math.min(1, Math.max(0, value)), ac.currentTime, 0.1);
      else if (name === 'hiss') hissGain.gain.setTargetAtTime(Math.min(0.3, Math.max(0, value)), ac.currentTime, 0.1);
    },
    reset() {
      setAmount(0);
      crackleGain.gain.setTargetAtTime(0.35, ac.currentTime, 0.05);
      hissGain.gain.setTargetAtTime(0.05, ac.currentTime, 0.05);
    },
    dispose() {
      try {
        hiss.stop();
        crackle.stop();
        output.disconnect();
      } catch {
        /* ignore */
      }
    },
  };
}

export const vinylPlugin: FXPlugin = { id: 'vinyl', name: 'Vinyl', create: createVinyl };
