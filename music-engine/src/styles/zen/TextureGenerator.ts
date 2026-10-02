import type { SeededRandom } from '../../core/SeededRandom';
import { lerp } from '../../core/music/Theory';
import type { MusicalEvent } from '../../core/types';

export interface TextureParams {
  textureDensity: number;
  nature: number;
  stereoMovement: number;
}

export type TextureKind = 'air' | 'wind' | 'rain' | 'water' | 'room';

/**
 * Procedural environment beds (PRD §32): air / wind / rain / water / room
 * tone built from filtered noise, scheduled as long overlapping events.
 */
export class TextureGenerator {
  private cursor = 0;
  private counter = 0;
  private disabled = false;
  private rng: SeededRandom;

  constructor(master: SeededRandom) {
    this.rng = master.fork('texture');
  }

  generate(origin: number, localTo: number, p: TextureParams): MusicalEvent[] {
    if (this.disabled) return [];
    if (p.textureDensity < 0.02 && p.nature < 0.02) {
      this.disabled = true;
      return [];
    }
    const events: MusicalEvent[] = [];
    let guard = 0;
    while (this.cursor < localTo && guard++ < 64) {
      const dur = lerp(50, 140, this.rng.next()) * (0.4 + p.textureDensity * 0.8);
      const kind = this.pickKind(p);
      // rain belongs to the 'water' event family, air/room to 'texture'.
      const evtType = kind === 'wind' ? 'wind' : kind === 'rain' || kind === 'water' ? 'water' : 'texture';
      events.push({
        id: `zen:tex:${this.counter++}`,
        type: evtType,
        startTime: origin + this.cursor,
        duration: dur,
        instrument: 'noise-texture',
        velocity: 0.18 + p.textureDensity * 0.22,
        pan: this.rng.range(-0.4, 0.4) * p.stereoMovement,
        parameters: { texture: kind, movement: p.stereoMovement * 0.8 },
        metadata: { sourcePlugin: 'zen', role: 'texture' },
      });
      // Overlap proportional to density (more density → more layering).
      this.cursor += dur * lerp(0.95, 0.45, p.textureDensity);
    }
    return events;
  }

  private pickKind(p: TextureParams): TextureKind {
    const n = p.nature;
    const entries: [TextureKind, number][] = [
      ['air', 2.2 * (1 - n) + 0.8],
      ['room', 1.6 * (1 - n) + 0.2],
      ['wind', 0.6 + 2.4 * n],
      ['rain', 0.3 + 2.2 * n],
      ['water', 0.3 + 1.8 * n],
    ];
    return this.rng.weighted(entries);
  }
}
