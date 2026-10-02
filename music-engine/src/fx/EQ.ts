import type { FXContext, FXInstance, FXPlugin } from '../core/types';

/** 3-band EQ: low shelf / mid peak / high shelf. */
export function createEQ(ctx: FXContext): FXInstance {
  const ac = ctx.audioContext;
  const low = ac.createBiquadFilter();
  low.type = 'lowshelf';
  low.frequency.value = 180;
  const mid = ac.createBiquadFilter();
  mid.type = 'peaking';
  mid.frequency.value = 1000;
  mid.Q.value = 0.8;
  const high = ac.createBiquadFilter();
  high.type = 'highshelf';
  high.frequency.value = 4200;
  low.connect(mid);
  mid.connect(high);

  const set = (node: BiquadFilterNode, db: number) => {
    node.gain.setTargetAtTime(db, ac.currentTime, 0.05);
  };

  return {
    input: low,
    output: high,
    setParameter(name, value) {
      if (name === 'low') set(low, value);
      else if (name === 'mid') set(mid, value);
      else if (name === 'high') set(high, value);
    },
    reset() {
      set(low, 0);
      set(mid, 0);
      set(high, 0);
    },
    dispose() {
      try {
        low.disconnect();
        mid.disconnect();
        high.disconnect();
      } catch {
        /* ignore */
      }
    },
  };
}

export const eqPlugin: FXPlugin = { id: 'eq', name: 'EQ', create: createEQ };
