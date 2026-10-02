/**
 * Maps between the engine's musical timeline (transport seconds) and the
 * AudioContext hardware clock. Pausing suspends the AudioContext, which
 * freezes currentTime — so a single anchor stays valid across pause/resume.
 */
export class Transport {
  private anchorAudio = 0;
  private basePos = 0;
  private active = false;

  get isActive(): boolean {
    return this.active;
  }

  start(position: number, now: number): void {
    this.anchorAudio = now;
    this.basePos = position;
    this.active = true;
  }

  positionAt(now: number): number {
    return this.active ? this.basePos + Math.max(0, now - this.anchorAudio) : this.basePos;
  }

  audioTimeFor(transportTime: number): number {
    return this.anchorAudio + (transportTime - this.basePos);
  }

  reset(): void {
    this.active = false;
    this.basePos = 0;
    this.anchorAudio = 0;
  }
}
