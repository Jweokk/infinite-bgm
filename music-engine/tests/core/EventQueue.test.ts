import { describe, expect, it } from 'vitest';
import { EventQueue } from '../../src/core/EventQueue';
import type { MusicalEvent } from '../../src/core/types';

function ev(id: string, startTime: number): MusicalEvent {
  return { id, type: 'note', startTime, duration: 0.1 };
}

describe('EventQueue', () => {
  it('keeps events sorted by startTime regardless of push order', () => {
    const q = new EventQueue();
    q.push([ev('c', 3), ev('a', 1)]);
    q.push([ev('b', 2)]);
    expect([q.shift()!.id, q.shift()!.id, q.shift()!.id]).toEqual(['a', 'b', 'c']);
  });

  it('peek does not remove', () => {
    const q = new EventQueue();
    q.push([ev('a', 1)]);
    expect(q.peek()!.id).toBe('a');
    expect(q.size).toBe(1);
  });

  it('clearFrom drops events at or after the boundary', () => {
    const q = new EventQueue();
    q.push([ev('a', 1), ev('b', 2), ev('c', 3), ev('d', 4)]);
    q.clearFrom(3);
    expect(q.size).toBe(2);
    expect(q.peek()!.id).toBe('a');
  });

  it('clear removes everything', () => {
    const q = new EventQueue();
    q.push([ev('a', 1), ev('b', 2)]);
    q.clear();
    expect(q.size).toBe(0);
    expect(q.peek()).toBeUndefined();
  });
});
