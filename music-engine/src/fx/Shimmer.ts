import type { FXContext, FXInstance, FXPlugin } from '../core/types';

/**
 * Simplified shimmer (PRD §34 allows a first-version simplification):
 * a high-shelved tail sent through two slowly detuned modulated delays with
 * feedback — an airy, pitch-drifting halo instead of a true +12 pitch shift.
 *
 * v1.5 anti-ring redesign: short-delay feedback combs self-ring as a
 * constant high tone (harmonics of 1/delay above the highpass), which sat
 * behind every style. Now: longer delays (lower ring frequency), a lowpass
 * inside the loop, and gentle feedback so the halo decays instead of singing.
 */
export function createShimmer(ctx: FXContext): FXInstance {
  const ac = ctx.audioContext;
  const input = ac.createGain();
  const output = ac.createGain();

  const hp = ac.createBiquadFilter();
  hp.type = 'highpass';
  hp.frequency.value = 1700;
  const lp = ac.createBiquadFilter();
  lp.type = 'lowpass';
  lp.frequency.value = 5200;
  lp.Q.value = 0.5;

  const dA = ac.createDelay(0.3);
  const dB = ac.createDelay(0.3);
  dA.delayTime.value = 0.083;
  dB.delayTime.value = 0.117;

  const lfoA = ac.createOscillator();
  lfoA.type = 'sine';
  lfoA.frequency.value = 0.07;
  const lfoAG = ac.createGain();
  lfoAG.gain.value = 0.004;
  lfoA.connect(lfoAG);
  lfoAG.connect(dA.delayTime);

  const lfoB = ac.createOscillator();
  lfoB.type = 'sine';
  lfoB.frequency.value = 0.05;
  const lfoBG = ac.createGain();
  lfoBG.gain.value = 0.004;
  lfoB.connect(lfoBG);
  lfoBG.connect(dB.delayTime);
  lfoA.start();
  lfoB.start();

  const mix = ac.createGain();
  dA.connect(mix);
  dB.connect(mix);

  const feedback = ac.createGain();
  feedback.gain.value = 0.26;
  mix.connect(feedback);
  feedback.connect(hp);

  const wet = ac.createGain();
  mix.connect(wet);
  wet.connect(output);

  input.connect(hp);
  hp.connect(lp);
  lp.connect(dA);
  lp.connect(dB);

  const setWet = (v: number) => {
    wet.gain.setTargetAtTime(v, ac.currentTime, 0.15);
  };
  setWet(0);
  return {
    input,
    output,
    setParameter(name, value) {
      if (name === 'wet') setWet(Math.min(1, Math.max(0, value)));
      else if (name === 'feedback') feedback.gain.setTargetAtTime(Math.min(0.4, Math.max(0, value)), ac.currentTime, 0.1);
    },
    reset() {
      setWet(0);
      feedback.gain.setTargetAtTime(0.26, ac.currentTime, 0.05);
    },
    dispose() {
      try {
        lfoA.stop();
        lfoB.stop();
        input.disconnect();
        output.disconnect();
      } catch {
        /* ignore */
      }
    },
  };
}

export const shimmerPlugin: FXPlugin = { id: 'shimmer', name: 'Shimmer', create: createShimmer };
