import type { MusicalEvent } from './types';

/** Priority queue of musical events ordered by startTime. */
export class EventQueue {
  private items: MusicalEvent[] = [];

  get size(): number {
    return this.items.length;
  }

  push(events: Iterable<MusicalEvent>): void {
    for (const e of events) {
      const i = this.lowerBound(e.startTime);
      this.items.splice(i, 0, e);
    }
  }

  peek(): MusicalEvent | undefined {
    return this.items[0];
  }

  shift(): MusicalEvent | undefined {
    return this.items.shift();
  }

  /** Drop every event scheduled at or after `from` (transition support). */
  clearFrom(from: number): void {
    this.items = this.items.filter((e) => e.startTime < from);
  }

  clear(): void {
    this.items.length = 0;
  }

  private lowerBound(time: number): number {
    let lo = 0;
    let hi = this.items.length;
    while (lo < hi) {
      const mid = (lo + hi) >>> 1;
      if (this.items[mid].startTime < time) lo = mid + 1;
      else hi = mid;
    }
    return lo;
  }
}
