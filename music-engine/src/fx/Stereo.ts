import type { FXContext, FXInstance, FXPlugin } from '../core/types';

/**
 * Mid/side stereo width control (PRD §33). width=1 is transparent; <1 narrows,
 * >1 widens. Built from a splitter, M/S gains and a merger.
 */
export function createStereo(ctx: FXContext): FXInstance {
  const ac = ctx.audioContext;
  const input = ac.createGain();
  const output = ac.createGain();
  const splitter = ac.createChannelSplitter(2);
  const merger = ac.createChannelMerger(2);

  const mid = ac.createGain(); // 0.5L + 0.5R
  const side = ac.createGain(); // 0.5L - 0.5R
  const sideWidth = ac.createGain();
  const negSide = ac.createGain(); // -side for the right channel
  const outL = ac.createGain();
  const outR = ac.createGain();

  input.connect(splitter);

  const lMid = ac.createGain();
  lMid.gain.value = 0.5;
  const rMid = ac.createGain();
  rMid.gain.value = 0.5;
  const lSide = ac.createGain();
  lSide.gain.value = 0.5;
  const rSide = ac.createGain();
  rSide.gain.value = -0.5;

  splitter.connect(lMid, 0);
  splitter.connect(rMid, 1);
  lMid.connect(mid);
  rMid.connect(mid);
  splitter.connect(lSide, 0);
  splitter.connect(rSide, 1);
  lSide.connect(side);
  rSide.connect(side);
  side.connect(sideWidth);
  sideWidth.connect(negSide);
  negSide.gain.value = -1;

  mid.connect(outL);
  sideWidth.connect(outL);
  mid.connect(outR);
  negSide.connect(outR);

  outL.connect(merger, 0, 0);
  outR.connect(merger, 0, 1);
  merger.connect(output);

  sideWidth.gain.value = 1;

  return {
    input,
    output,
    setParameter(name, value) {
      if (name === 'width') sideWidth.gain.setTargetAtTime(Math.min(2.5, Math.max(0, value)), ac.currentTime, 0.1);
    },
    reset() {
      sideWidth.gain.setTargetAtTime(1, ac.currentTime, 0.05);
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

export const stereoPlugin: FXPlugin = { id: 'stereo', name: 'Stereo Width', create: createStereo };
