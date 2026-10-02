import type { FXContext, FXInstance, FXPlugin } from '../core/types';

/** Ping-pong stereo delay. */
export function createDelay(ctx: FXContext): FXInstance {
  const ac = ctx.audioContext;
  const input = ac.createGain();
  const output = ac.createGain();
  const dry = ac.createGain();
  const wet = ac.createGain();
  const merger = ac.createChannelMerger(2);

  const dL = ac.createDelay(2);
  const dR = ac.createDelay(2);
  dL.delayTime.value = 0.34;
  dR.delayTime.value = 0.34;
  const fbL = ac.createGain();
  const fbR = ac.createGain();
  fbL.gain.value = 0.3;
  fbR.gain.value = 0.3;
  const damp = ac.createBiquadFilter();
  damp.type = 'lowpass';
  damp.frequency.value = 2600;

  input.connect(dry);
  dry.connect(output);
  input.connect(dL);
  dL.connect(fbL);
  fbL.connect(damp);
  damp.connect(dR);
  dR.connect(fbR);
  fbR.connect(dL);
  dL.connect(merger, 0, 0);
  dR.connect(merger, 0, 1);
  merger.connect(wet);
  wet.connect(output);

  const setWet = (v: number) => {
    const t = ac.currentTime;
    wet.gain.setTargetAtTime(v, t, 0.08);
    dry.gain.setTargetAtTime(1 - v * 0.4, t, 0.08);
  };
  setWet(0);

  return {
    input,
    output,
    setParameter(name, value) {
      const t = ac.currentTime;
      if (name === 'wet') setWet(Math.min(1, Math.max(0, value)));
      else if (name === 'time') {
        dL.delayTime.setTargetAtTime(Math.min(1.8, value), t, 0.1);
        dR.delayTime.setTargetAtTime(Math.min(1.8, value), t, 0.1);
      } else if (name === 'feedback') {
        const fb = Math.min(0.75, Math.max(0, value));
        fbL.gain.setTargetAtTime(fb, t, 0.1);
        fbR.gain.setTargetAtTime(fb, t, 0.1);
      }
    },
    reset() {
      setWet(0);
      this.setParameter('time', 0.34);
      this.setParameter('feedback', 0.3);
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

export const delayPlugin: FXPlugin = { id: 'delay', name: 'Delay', create: createDelay };
