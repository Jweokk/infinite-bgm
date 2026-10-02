/**
 * Builds a slow LFO-modulated StereoPanner for sustained voices (drones,
 * textures) — the "space itself is music" ingredient of Zen (PRD §30/§33).
 */
export interface MovementHandle {
  pan: StereoPannerNode;
  stop(atTime: number): void;
}

export function createStereoMovement(
  ctx: AudioContext,
  opts: { rate: number; depth: number; center?: number },
): MovementHandle {
  const pan = ctx.createStereoPanner();
  pan.pan.value = opts.center ?? 0;
  const lfo = ctx.createOscillator();
  lfo.type = 'sine';
  lfo.frequency.value = opts.rate;
  const lfoGain = ctx.createGain();
  lfoGain.gain.value = opts.depth;
  lfo.connect(lfoGain);
  lfoGain.connect(pan.pan);
  lfo.start();
  return {
    pan,
    stop(atTime: number) {
      try {
        lfoGain.disconnect();
        lfo.stop(atTime);
      } catch {
        /* already stopped */
      }
    },
  };
}
