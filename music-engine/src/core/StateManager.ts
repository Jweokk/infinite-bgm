import type { EngineStatus } from './types';

const ALLOWED: Record<EngineStatus, EngineStatus[]> = {
  idle: ['playing'],
  playing: ['paused', 'idle'],
  paused: ['playing', 'idle'],
};

export class StateManager {
  private current: EngineStatus = 'idle';
  private onChange: (s: EngineStatus) => void;

  constructor(onChange: (s: EngineStatus) => void) {
    this.onChange = onChange;
  }

  get status(): EngineStatus {
    return this.current;
  }

  set(next: EngineStatus): boolean {
    if (next === this.current) return false;
    if (!ALLOWED[this.current].includes(next)) return false;
    this.current = next;
    this.onChange(next);
    return true;
  }
}
