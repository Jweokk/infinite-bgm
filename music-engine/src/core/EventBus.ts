import type { EngineErrorCode } from './types';

/** Minimal typed pub/sub used for UI updates, visualizer pulses and errors. */
export type EngineEventMap = {
  state: { status: string };
  style: { styleId: string };
  /** `pending` = accepted but queued for the next transition boundary. */
  seed: { seed: string; pending?: boolean };
  parameter: { styleId: string; name: string; value: number | string | boolean };
  preset: { styleId: string; presetId: string };
  error: { scope: string; message: string; code?: EngineErrorCode; params?: Record<string, string> };
  /** Fired when an event is dispatched to an instrument (visualizer food). */
  note: {
    event: {
      type: string;
      instrument?: string;
      pitch?: number;
      velocity?: number;
      pan?: number;
      metadata?: { section?: string; role?: string };
    };
  };
  /** `queued` = request accepted mid-transition, applied at the boundary. */
  transition: { phase: 'begin' | 'end' | 'queued' };
  /** A style switch was accepted mid-transition and queued. */
  'style-pending': { styleId: string };
};

type Listener = (payload: any) => void;

export class EventBus {
  private listeners = new Map<string, Set<Listener>>();

  on<K extends keyof EngineEventMap>(kind: K, cb: (payload: EngineEventMap[K]) => void): () => void {
    let set = this.listeners.get(kind as string);
    if (!set) {
      set = new Set();
      this.listeners.set(kind as string, set);
    }
    set.add(cb as Listener);
    return () => set!.delete(cb as Listener);
  }

  emit<K extends keyof EngineEventMap>(kind: K, payload: EngineEventMap[K]): void {
    const set = this.listeners.get(kind as string);
    if (!set) return;
    for (const cb of [...set]) {
      try {
        cb(payload);
      } catch (err) {
        // A broken UI listener must never take down the audio engine.
        console.error('[EventBus] listener error', err);
      }
    }
  }
}
