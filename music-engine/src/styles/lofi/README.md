# Lofi Plugin

Beat-based lofi / chillhop / jazzhop generator.

- Time Model: `beat` (BPM / bar / section)
- Main instruments: `electric-piano`, `bass`, `kick`, `snare`, `hat` (+ optional `pluck`)
- Main FX: `reverb` (required), `tape`, `vinyl`, `delay`, `eq`, `saturation`

## Musical characteristics

- Jazz-flavoured progressions (maj7 / m7 / m9 / maj9 / 7 / sus2 / sus4 / 6) chosen by seed + mood + scale
- Voice-led piano voicings (inversions, rootless variants, octave displacement)
- Motif-based melody with variation (transpose / invert / thin / octave)
- Root/fifth/octave bass with chromatic approach notes, density by energy
- 4 drum kits (boom-bap / lazy / bouncy / busy), swing on offbeat eighths
- Humanization: timing ±15 ms, velocity ±10%, pan ±0.1 (seed controlled)
- Infinite arrangement: Intro → (A / A' / B / A) cycles with seeded variation

## Seed behavior

Same seed + parameters + plugin version → identical event sequence,
independently of how the timeline is chunked into generation windows.
RNG streams are forked per generator (`arrangement`, `bar:N`, `humanize`...),
so tweaks never reshuffle unrelated parts.

## Example

```ts
engine.registerStyle(lofiPlugin);
engine.useStyle('lofi');
await engine.start();
```
