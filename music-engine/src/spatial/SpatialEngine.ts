import type { SpatialController } from '../core/types';

/**
 * Spatial engine (PRD §33). Coordinates global stereo width and the shared
 * "movement depth" that styles/instruments use for slow stereo drift.
 * The actual M/S widening lives in the stereo FX plugin.
 */
export class SpatialControllerImpl implements SpatialController {
  private width = 1;
  private movement = 0;
  private stereoFX: { setParameter(name: string, value: number): void } | null = null;

  bindFX(fx: { getHandle(id: string): { setParameter(name: string, value: number): void } | undefined }): void {
    this.stereoFX = fx.getHandle('stereo') ?? null;
    this.stereoFX?.setParameter('width', this.width);
  }

  setStereoWidth(w: number): void {
    this.width = Math.min(2, Math.max(0, w));
    this.stereoFX?.setParameter('width', this.width);
  }

  setMovement(depth: number): void {
    this.movement = Math.min(1, Math.max(0, depth));
  }

  getMovement(): number {
    return this.movement;
  }

  getStereoWidth(): number {
    return this.width;
  }
}
