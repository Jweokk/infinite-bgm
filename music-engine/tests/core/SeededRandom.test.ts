import { describe, expect, it } from 'vitest';
import { SeededRandom } from '../../src/core/SeededRandom';

describe('SeededRandom', () => {
  it('same seed → same sequence', () => {
    const a = new SeededRandom(12345);
    const b = new SeededRandom(12345);
    for (let i = 0; i < 200; i++) expect(a.next()).toBe(b.next());
  });

  it('different seed → different sequence', () => {
    const a = new SeededRandom(12345);
    const b = new SeededRandom(12346);
    const seqA = Array.from({ length: 20 }, () => a.next());
    const seqB = Array.from({ length: 20 }, () => b.next());
    expect(seqA).not.toEqual(seqB);
  });

  it('accepts string seeds deterministically', () => {
    const a = new SeededRandom('hello|world');
    const b = new SeededRandom('hello|world');
    expect(a.int(0, 1000)).toBe(b.int(0, 1000));
  });

  it('fork is isolated from parent call order (PRD §13)', () => {
    const a = new SeededRandom(777);
    const forkA1 = a.fork('melody').next();
    for (let i = 0; i < 50; i++) a.next(); // perturb parent stream
    const forkA2 = new SeededRandom(777).fork('melody').next();
    expect(forkA1).toBe(forkA2);
  });

  it('different fork tags produce different streams', () => {
    const rng = new SeededRandom(42);
    const harmony = rng.fork('harmony');
    const melody = rng.fork('melody');
    const a = Array.from({ length: 10 }, () => harmony.next());
    const b = Array.from({ length: 10 }, () => melody.next());
    expect(a).not.toEqual(b);
  });

  it('next() stays in [0,1) and is roughly uniform', () => {
    const rng = new SeededRandom(9);
    let sum = 0;
    const n = 10000;
    for (let i = 0; i < n; i++) {
      const v = rng.next();
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
      sum += v;
    }
    expect(sum / n).toBeGreaterThan(0.47);
    expect(sum / n).toBeLessThan(0.53);
  });

  it('int() is inclusive within bounds', () => {
    const rng = new SeededRandom(3);
    for (let i = 0; i < 500; i++) {
      const v = rng.int(2, 5);
      expect(v).toBeGreaterThanOrEqual(2);
      expect(v).toBeLessThanOrEqual(5);
      expect(Number.isInteger(v)).toBe(true);
    }
  });
});
