# Zen Plugin

Free-time ambient / meditation soundscape generator — deliberately **not**
"Lofi with BPM = 30" (PRD §23).

- Time Model: `free` (no BPM, no bar grid)
- Main instruments: `drone`, `bell`, `bowl`, `noise-texture` (+ optional `pluck`)
- Main FX: `reverb` (required, long decay), `shimmer`, `stereo`

## Musical characteristics

- Four independent lanes, each on its own cursor: drones / bells / harmonic
  plucks / texture beds
- Harmonic fields (root + open fifth + octave + sus2/sus4 + add9) that drift
  every 32–90s by ±2/±5 semitones — never traditional progressions
- Long silences as explicit first-class events (silenceDensity, stillness)
- Breath engine: 43s/71s/109s multi-period curve modulating density,
  brightness and drone cutoffs without a mechanical loop
- Drones: 22–70s overlapping voices with slow detune / filter / pan LFOs
- Bells & singing bowls: additive synthesis with the PRD's bowl partials
  (f, 2.01f, 2.71f, 4.13f, 5.73f)
- Textures: procedural air / wind / rain / water / room tone from filtered
  noise — no samples

## Seed behavior

Same seed + parameters + plugin version → identical event sequence,
independently of window chunking (lane cursors advance strictly by time).

## Example

```ts
engine.registerStyle(zenPlugin);
engine.useStyle('zen');
await engine.start();
```
