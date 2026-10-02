import type { FXContext, FXInstance, FXPlugin } from '../core/types';

/** Bus compressor (glue). */
export function createCompressor(ctx: FXContext): FXInstance {
  const ac = ctx.audioContext;
  const comp = ac.createDynamicsCompressor();
  comp.threshold.value = -18;
  comp.knee.value = 14;
  comp.ratio.value = 3;
  comp.attack.value = 0.012;
  comp.release.value = 0.2;
  const makeup = ac.createGain();
  makeup.gain.value = 1.15;
  comp.connect(makeup);

  return {
    input: comp,
    output: makeup,
    setParameter(name, value) {
      if (name === 'threshold') comp.threshold.setTargetAtTime(value, ac.currentTime, 0.05);
      else if (name === 'ratio') comp.ratio.setTargetAtTime(value, ac.currentTime, 0.05);
    },
    reset() {
      comp.threshold.setTargetAtTime(-18, ac.currentTime, 0.05);
      comp.ratio.setTargetAtTime(3, ac.currentTime, 0.05);
    },
    dispose() {
      try {
        comp.disconnect();
        makeup.disconnect();
      } catch {
        /* ignore */
      }
    },
  };
}

export const compressorPlugin: FXPlugin = { id: 'compressor', name: 'Compressor', create: createCompressor };

/** Safety limiter at the end of the master chain. */
export function createLimiter(ctx: FXContext): FXInstance {
  const ac = ctx.audioContext;
  const limiter = ac.createDynamicsCompressor();
  limiter.threshold.value = -2;
  limiter.knee.value = 0;
  limiter.ratio.value = 20;
  limiter.attack.value = 0.002;
  limiter.release.value = 0.12;

  return {
    input: limiter,
    output: limiter,
    setParameter(name, value) {
      if (name === 'ceiling') limiter.threshold.setTargetAtTime(value, ac.currentTime, 0.05);
    },
    reset() {
      limiter.threshold.setTargetAtTime(-2, ac.currentTime, 0.05);
    },
    dispose() {
      try {
        limiter.disconnect();
      } catch {
        /* ignore */
      }
    },
  };
}

export const limiterPlugin: FXPlugin = { id: 'limiter', name: 'Limiter', create: createLimiter };
