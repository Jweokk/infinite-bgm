/**
 * Distance model (PRD §33): maps a 0..1 distance into gain attenuation and
 * lowpass damping for a single voice. Instruments apply it per event.
 */
export function applyDistance(
  gain: AudioParam,
  filterFreq: AudioParam | null,
  when: number,
  distance: number,
): void {
  const d = Math.min(1, Math.max(0, distance));
  const atten = 1 / (1 + d * 2.2);
  gain.setValueAtTime(Math.max(0.0001, atten), when);
  if (filterFreq) {
    const f = 16000 * Math.pow(0.12, d); // 16k → ~2k at max distance
    filterFreq.setValueAtTime(f, when);
  }
}
