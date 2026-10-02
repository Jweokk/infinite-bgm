/**
 * Macro arc + purpose profiles (PRD v1.1 §76.8).
 *
 * Steady-state generation makes minute 5 statistically identical to minute
 * 25. MacroArc turns "what the music is for" into a minutes-scale envelope
 * of density / brightness / space multipliers that styles apply at
 * generation time — without touching the event model.
 */

export type PurposeId = 'flow' | 'focus' | 'sleep' | 'meditation';

export interface MacroMultipliers {
  /** Event density scale (lower = sparser). */
  density: number;
  /** Velocity / brightness scale. */
  brightness: number;
  /** Spatial openness scale. */
  space: number;
}

const FLAT: MacroMultipliers = { density: 1, brightness: 1, space: 1 };

export class MacroArc {
  constructor(
    private purpose: PurposeId,
    private sessionMinutes = 30,
    private phase = 0,
  ) {}

  setPurpose(purpose: PurposeId, sessionMinutes?: number): void {
    this.purpose = purpose;
    if (sessionMinutes !== undefined) this.sessionMinutes = sessionMinutes;
  }

  /** Multipliers at local time t (seconds since style start). */
  value(tSec: number): MacroMultipliers {
    const t = Math.max(0, tSec) / 60;
    switch (this.purpose) {
      case 'focus':
        return { density: 0.9, brightness: 0.88, space: 1 };
      case 'sleep': {
        const L = Math.max(4, this.sessionMinutes);
        let density: number;
        if (t < L * 0.6) density = 1 - (t / (L * 0.6)) * 0.6; // 1 → 0.4
        else if (t < L - 2) density = 0.4;
        else density = Math.max(0.05, 0.4 * (1 - (t - (L - 2)) / 2)); // fade tail
        return { density, brightness: Math.max(0.25, density), space: 1.05 };
      }
      case 'meditation':
        return { density: 0.85, brightness: 0.85, space: 1.12 };
      default: {
        // flow: a gentle 8-minute arc, never a mechanical loop feel.
        const s = Math.sin((2 * Math.PI * t) / 8 + this.phase);
        return { density: 1 + s * 0.12, brightness: 1 + s * 0.08, space: 1 };
      }
    }
  }
}

export const PURPOSE_OPTIONS = [
  { value: 'flow', label: '漂流 · 无尽' },
  { value: 'focus', label: '专注' },
  { value: 'sleep', label: '睡眠' },
  { value: 'meditation', label: '冥想' },
] as const;

export function parsePurpose(v: unknown): PurposeId {
  const s = String(v ?? 'flow');
  return (['flow', 'focus', 'sleep', 'meditation'] as const).includes(s as PurposeId) ? (s as PurposeId) : 'flow';
}

export { FLAT as NO_ARC };
