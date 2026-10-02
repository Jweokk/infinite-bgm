import { SeededRandom } from '../../core/SeededRandom';
import type {
  GenerationContext,
  MusicalEvent,
  ParamValue,
  StyleContext,
  StyleInstance,
} from '../../core/types';
import {
  CHORD_TYPES,
  SCALES,
  chordMidis,
  clamp,
  degreeToMidi,
  guideToneCandidates,
  keyRootMidi,
  lerp,
  nearestIn,
} from '../../core/music/Theory';
import { BeatTimeModel } from '../../time/BeatTimeModel';
import { MacroArc, parsePurpose } from '../../time/MacroArc';
import { Arrangement } from './Arrangement';
import type { ChordSpec } from './HarmonyGenerator';
import { HarmonyGenerator } from './HarmonyGenerator';
import { VoicingGenerator } from './VoicingGenerator';
import { MelodyGenerator } from './MelodyGenerator';
import { BassGenerator } from './BassGenerator';
import { DrumGenerator, DRUM_KITS } from './DrumGenerator';
import type { SectionSpec } from './Arrangement';

interface ActiveSection {
  spec: SectionSpec;
  barIndex: number;
  progression: ChordSpec[];
  kitId: number;
}

/**
 * Directional micro-timing (v1.1 §76.1): constant per-instrument biases in
 * milliseconds. Zero-mean jitter sounds sloppy; biased offsets feel like a
 * pocket — kick laid back, hats pushing, bass slightly ahead of the kick.
 */
const POCKET_BIAS: Record<string, number> = {
  kick: 9,
  snare: 0,
  hat: -6,
  bass: -5,
  melody: 6,
  harmony: 3,
};

/**
 * Beat-based lofi/chillhop generator (PRD §14–22).
 * All randomness flows through forks of the style seed; generation is driven
 * by a bar cursor, so event output is independent of window chunking.
 */
export class LofiStyle implements StyleInstance {
  private p: Record<string, ParamValue>;
  private master: SeededRandom;
  private harmony = new HarmonyGenerator();
  private voicing = new VoicingGenerator();
  private melody = new MelodyGenerator();
  private bass = new BassGenerator();
  private drums = new DrumGenerator();
  private arrangement: Arrangement;
  private ctx: StyleContext | null = null;

  private origin: number | null = null;
  private cursor = 0; // local seconds of the next bar start
  private section: ActiveSection | null = null;
  private sectionCounter = 0;
  private barCounter = 0;
  private prevVoicing: number[] = [];
  private lastChordKey = '';
  private evCounter = 0;
  private humRng: SeededRandom;
  private beatModel: BeatTimeModel;
  /** Current guide tone (3rd/7th) driving voicing + melody resolution (§76.3). */
  private guideTone: number | null = null;
  /** Per-bar effective BPM for the section tempo envelope (§76.4). */
  private currentBpm = 78;
  private arc: MacroArc;

  constructor(seed: string | number, parameters: Record<string, ParamValue>) {
    this.p = { ...parameters };
    this.master = new SeededRandom(`${seed}::lofi`);
    this.arrangement = new Arrangement(this.master.fork('arrangement'));
    this.humRng = this.master.fork('humanize');
    this.currentBpm = this.num('bpm', 78);
    this.beatModel = new BeatTimeModel(() => this.currentBpm);
    this.arc = new MacroArc(
      parsePurpose(this.p.sessionPurpose),
      Number(this.p.sessionLength ?? 30) || 30,
      this.master.fork('arc').next() * Math.PI * 2,
    );
  }

  // -- utils ---------------------------------------------------------------

  private num(name: string, fallback: number): number {
    const v = this.p[name];
    const n = typeof v === 'number' ? v : parseFloat(String(v));
    return Number.isFinite(n) ? n : fallback;
  }

  private beat(): number {
    return this.beatModel.secPerBeat;
  }

  /**
   * Humanization per PRD §21 + directional pocket (v1.1 §76.1): a constant
   * per-instrument bias plus seeded jitter, the sum still clamped to ±15ms.
   */
  private humanize(biasMs = 0) {
    const h = this.num('humanization', 0.5);
    const bias = (biasMs / 1000) * h;
    const jitter = clamp(this.humRng.gauss(0, 0.005), -0.015, 0.015) * h;
    const v = 1 + clamp(this.humRng.gauss(0, 0.035), -0.1, 0.1) * h;
    const pan = clamp(this.humRng.gauss(0, 0.035), -0.1, 0.1) * h;
    return { t: clamp(bias + jitter, -0.015, 0.015), v, pan };
  }

  /** Swing offset in beats for a beat position (0 / .5 / other fractions). */
  private swingBeats(beatPos: number): number {
    const frac = beatPos % 1;
    if (frac === 0) return 0;
    const swing = this.num('swing', 0.58);
    return frac === 0.5 ? swing - 0.5 : (swing - 0.5) * 0.45;
  }

  private nextId(): string {
    return `lofi:${this.evCounter++}`;
  }

  // -- lifecycle ------------------------------------------------------------

  start(context: StyleContext): void {
    this.ctx = context;
    this.applyFX();
  }

  stop(): void {
    this.ctx = null;
  }

  private applyFX(): void {
    const fx = this.ctx?.fx;
    if (!fx) return;
    fx.get('eq')?.setParameter('low', 1.5);
    fx.get('eq')?.setParameter('mid', -1.2);
    fx.get('eq')?.setParameter('high', -3.5);
    fx.get('reverb')?.setParameter('decay', 2.6);
    fx.get('reverb')?.setParameter('predelay', 0.02);
    fx.get('reverb')?.setParameter('wet', 0.14 + this.num('reverb', 0.35) * 0.4);
    fx.get('tape')?.setParameter('wet', 0.22 + this.num('tape', 0.4) * 0.6);
    fx.get('tape')?.setParameter('bump', this.num('tape', 0.4));
    fx.get('vinyl')?.setParameter('amount', this.num('vinyl', 0.3) * 0.5);
    fx.get('delay')?.setParameter('time', 0.36);
    fx.get('delay')?.setParameter('feedback', 0.28);
    fx.get('delay')?.setParameter('wet', 0.1);
    fx.get('shimmer')?.setParameter('wet', 0.04);
    fx.get('saturation')?.setParameter('wet', 0.18);
    fx.get('saturation')?.setParameter('drive', 0.25);
    this.ctx?.spatial.setStereoWidth(0.85);
    this.ctx?.spatial.setMovement(0.15);
  }

  setParameter(name: string, value: ParamValue): void {
    this.p[name] = value;
    if (name === 'reverb') this.ctx?.fx.get('reverb')?.setParameter('wet', 0.14 + Number(value) * 0.4);
    else if (name === 'tape') {
      this.ctx?.fx.get('tape')?.setParameter('wet', 0.22 + Number(value) * 0.6);
      this.ctx?.fx.get('tape')?.setParameter('bump', Number(value));
    } else if (name === 'vinyl') this.ctx?.fx.get('vinyl')?.setParameter('amount', Number(value) * 0.5);
    else if (name === 'melodyDensity') this.melody.reset();
    else if (name === 'sessionPurpose') this.arc.setPurpose(parsePurpose(value));
    else if (name === 'sessionLength') this.arc.setPurpose(parsePurpose(this.p.sessionPurpose), Number(value) || 30);
  }

  nextBoundary(currentPosition: number): number | null {
    if (this.origin === null) return null;
    const barDur = this.beatModel.barDuration;
    const local = Math.max(0, currentPosition - this.origin);
    const nextBar = Math.ceil(local / barDur + 1e-6) * barDur;
    return this.origin + nextBar;
  }

  // -- generation -----------------------------------------------------------

  generateEvents({ from, to }: GenerationContext): MusicalEvent[] {
    if (this.origin === null) this.origin = from;
    const events: MusicalEvent[] = [];
    let guard = 0;
    while (this.origin + this.cursor < to && guard++ < 256) {
      const barAbs = this.origin + this.cursor;
      this.ensureSection();
      this.updateBarTempo(this.section!);
      events.push(...this.generateBar(barAbs, this.section!));
      this.cursor += this.beatModel.barDuration;
      this.section!.barIndex++;
      this.barCounter++;
    }
    void from;
    return events;
  }

  /**
   * Section tempo envelope (v1.1 §76.4): B lifts, final bars ritard, outro
   * relaxes — all scaled by the `tempoDynamics` parameter.
   */
  private updateBarTempo(section: ActiveSection): void {
    const dyn = this.num('tempoDynamics', 0.5);
    if (dyn <= 0) {
      this.currentBpm = this.num('bpm', 78);
      return;
    }
    let offset = 0;
    if (section.spec.tempoRole === 'b') offset += 2;
    if (section.spec.tempoRole === 'outro') offset -= 3;
    if (section.spec.bars - section.barIndex <= 1) offset -= 3; // ritard into the boundary
    this.currentBpm = this.num('bpm', 78) + offset * dyn;
  }

  private ensureSection(): void {
    if (this.section && this.section.barIndex < this.section.spec.bars) return;
    const spec = this.arrangement.next();
    const rng = this.master.fork(`section:${this.sectionCounter}`);
    const progression = this.harmony.progression(
      rng,
      String(this.p.scale ?? 'minor'),
      this.num('mood', 0.4),
      spec.variant,
    );
    const kitId = this.drums.chooseKit(rng, this.num('energy', 0.45));
    this.section = { spec, barIndex: 0, progression, kitId };
    this.sectionCounter++;
  }

  private generateBar(barAbs: number, section: ActiveSection): MusicalEvent[] {
    const events: MusicalEvent[] = [];
    const mods = section.spec.mods;
    const scale = SCALES[String(this.p.scale ?? 'minor')] ?? SCALES.minor;
    const beat = this.beat();
    const energy = this.num('energy', 0.45);
    const barRng = this.master.fork(`bar:${this.barCounter}`);
    // Macro arc multipliers at this bar's local time (v1.1 §76.8).
    const arc = this.arc.value(barAbs - (this.origin ?? barAbs));
    const arcDensity = clamp(arc.density, 0.05, 1.3);
    const arcBright = clamp(arc.brightness, 0.2, 1.2);
    // Sleep-style dissolving: below ~0.85 density, whole bars start to drop
    // out (rhythm section falls silent, chords thin) — seeded per bar.
    const barActive = arcDensity >= 0.85 || barRng.chance(Math.min(1, arcDensity * 1.15));

    // --- chord selection + turnaround + modulation (v1.1 §76.4) ---
    let keyOffset = section.spec.keyOffset;
    let chord = section.progression[section.barIndex % section.progression.length];
    let nextChord = section.progression[(section.barIndex + 1) % section.progression.length];
    const barsLeft = section.spec.bars - section.barIndex;
    const turnaround = section.spec.name !== 'Intro' && section.spec.bars > 4 && barsLeft <= 2;
    if (turnaround) {
      const nextSpec = this.arrangement.peekNext();
      keyOffset = nextSpec.keyOffset;
      if (barsLeft === 2) {
        chord = { degree: 1, type: 'm7' }; // ii7 of the next key
        nextChord = { degree: 4, type: '7' };
      } else {
        chord = { degree: 4, type: '7' }; // V7 of the next key
        nextChord = { degree: 0, type: 'm9' };
      }
    }
    const rootMidi = keyRootMidi(String(this.p.key ?? 'C')) + keyOffset;
    const chordRootMidi = degreeToMidi(rootMidi, scale, chord.degree);

    // --- voicing + guide tone (updated on chord change, §76.3) ---
    const chordKey = `${this.sectionCounter}:${turnaround ? `t${barsLeft}` : section.barIndex % section.progression.length}`;
    const chordChanged = chordKey !== this.lastChordKey;
    if (chordChanged) {
      const midis = chordMidis(chord.degree, chord.type, rootMidi, scale);
      this.prevVoicing = this.voicing.voice(midis, this.prevVoicing, this.guideTone ?? undefined);
      const guideCands = guideToneCandidates(midis, 72);
      this.guideTone = this.guideTone === null ? guideCands[0] : nearestIn(guideCands, this.guideTone);
      this.lastChordKey = chordKey;
    }

    // --- harmony: electric piano chord hits (with roll, §76.9) ---
    const hDensity = clamp(this.num('harmonyDensity', 0.6) * mods.harmony, 0, 1);
    if (arcDensity >= 0.12 || section.barIndex % 2 === 0) {
      const roll = 0.008 + barRng.range(0, 0.02);
      for (const hit of this.harmonyRhythm(hDensity, barRng)) {
        const h = this.humanize(POCKET_BIAS.harmony);
        events.push({
          id: this.nextId(),
          type: 'chord',
          startTime: barAbs + (hit.t + this.swingBeats(hit.t)) * beat + h.t,
          duration: hit.d * beat * 0.95,
          instrument: 'electric-piano',
          pitch: chordRootMidi,
          notes: this.prevVoicing,
          velocity: clamp((0.4 + hDensity * 0.28) * h.v * arcBright, 0.05, 1),
          pan: clamp(-0.04 + h.pan, -1, 1),
          parameters: { roll },
          metadata: { sourcePlugin: 'lofi', role: 'harmony', section: section.spec.name },
        });
      }
    }

    // --- bass ---
    if (mods.bass > 0.05 && barActive && arcDensity >= 0.15) {
      for (const n of this.bass.generateBar(barAbs, barRng, this.beatModel, chord, rootMidi, scale, nextChord, {
        energy: energy * mods.bass,
        density: clamp(this.num('harmonyDensity', 0.6) * arcDensity, 0, 1),
        swing: this.num('swing', 0.58),
      })) {
        const h = this.humanize(POCKET_BIAS.bass);
        events.push({
          id: this.nextId(),
          type: 'bass',
          startTime: n.time + h.t,
          duration: n.duration,
          instrument: 'bass',
          pitch: n.pitch,
          velocity: clamp(n.velocity * h.v * lerp(1, arcBright, 0.6), 0.05, 1),
          pan: clamp(h.pan * 0.5, -1, 1),
          metadata: { sourcePlugin: 'lofi', role: 'bass', section: section.spec.name },
        });
      }
    }

    // --- drums (kicks carry the sidechain duck trigger, §76.2) ---
    if (mods.drums > 0.05 && barActive && arcDensity >= 0.15) {
      const kit = DRUM_KITS[section.kitId];
      const duckDepth = this.num('sidechain', 0.5) * 0.7;
      for (const hit of this.drums.generateBar(barAbs, barRng, this.beatModel, kit, section.barIndex, {
        density: clamp(this.num('drumDensity', 0.7) * mods.drums * arcDensity, 0, 1),
        energy,
        swing: this.num('swing', 0.58),
      })) {
        const h = this.humanize(POCKET_BIAS[hit.instrument] ?? 0);
        const params: Record<string, number | boolean> = {};
        if (hit.instrument === 'kick' && duckDepth > 0.01) params.duck = duckDepth;
        if (hit.open) params.open = true;
        if (hit.ghost) params.ghost = true;
        events.push({
          id: this.nextId(),
          type: 'drum',
          startTime: hit.time + h.t,
          duration: hit.duration,
          instrument: hit.instrument,
          velocity: clamp(hit.velocity * h.v * lerp(1, arcBright, 0.5), 0.05, 1),
          pan: clamp((hit.instrument === 'hat' ? 0.12 : hit.instrument === 'snare' ? -0.08 : 0) + h.pan, -1, 1),
          parameters: Object.keys(params).length ? params : undefined,
          metadata: { sourcePlugin: 'lofi', role: 'drums', section: section.spec.name },
        });
      }
    }

    // --- melody (guide-tone resolution on chord boundaries, §76.3) ---
    if (mods.melody > 0.05 && barActive) {
      const melodyInstrument = section.spec.melodyInstrument || 'electric-piano';
      for (const n of this.melody.generateBar(barAbs, barRng, this.beatModel, chord, rootMidi, scale, {
        density: clamp(this.num('melodyDensity', 0.5) * mods.melody * arcDensity, 0, 1),
        energy,
        swing: this.num('swing', 0.58),
        guideTone: this.guideTone ?? undefined,
        chordChanged,
      })) {
        const h = this.humanize(POCKET_BIAS.melody);
        events.push({
          id: this.nextId(),
          type: 'note',
          startTime: n.time + h.t,
          duration: n.duration,
          instrument: melodyInstrument,
          pitch: n.pitch,
          velocity: clamp(n.velocity * h.v * arcBright, 0.05, 1),
          pan: clamp(0.05 + h.pan, -1, 1),
          metadata: { sourcePlugin: 'lofi', role: 'melody', section: section.spec.name },
        });
      }
    }

    return events;
  }

  /** Chord comp rhythms by density: whole → halves → syncopations. */
  private harmonyRhythm(density: number, rng: SeededRandom): { t: number; d: number }[] {
    if (density < 0.25) return [{ t: 0, d: 4 }];
    if (density < 0.55) {
      return rng.chance(0.5)
        ? [
            { t: 0, d: 2 },
            { t: 2, d: 2 },
          ]
        : [{ t: 0, d: 3.5 }];
    }
    const pools: { t: number; d: number }[][] = [
      [
        { t: 0, d: 1.5 },
        { t: 2, d: 2 },
      ],
      [
        { t: 0, d: 2 },
        { t: 2.5, d: 1.5 },
      ],
      [
        { t: 0, d: 1 },
        { t: 1.5, d: 0.5 },
        { t: 2, d: 2 },
      ],
      [
        { t: 0, d: 3 },
        { t: 3.5, d: 0.5 },
      ],
    ];
    return rng.pick(pools);
  }
}
