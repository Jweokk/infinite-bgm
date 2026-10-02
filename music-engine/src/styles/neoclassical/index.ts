import { SeededRandom } from '../../core/SeededRandom';
import type {
  GenerationContext,
  MusicalEvent,
  ParamValue,
  StyleContext,
  StyleInstance,
  StylePlugin,
} from '../../core/types';
import { NOTE_NAMES, SCALES, chordMidis, clamp, degreeToMidi, keyRootMidi, nearestIn } from '../../core/music/Theory';
import { BeatTimeModel } from '../../time/BeatTimeModel';
import { MacroArc, parsePurpose, PURPOSE_OPTIONS } from '../../time/MacroArc';
import { VoicingGenerator } from '../lofi/VoicingGenerator';

const PROGRESSIONS: { degree: number; type: string }[][] = [
  [
    { degree: 0, type: 'min9' },
    { degree: 5, type: 'maj9' },
    { degree: 3, type: 'maj7' },
    { degree: 4, type: 'min7' },
  ],
  [
    { degree: 0, type: 'min7' },
    { degree: 3, type: 'maj9' },
    { degree: 5, type: 'maj7' },
    { degree: 1, type: 'm9' },
  ],
  [
    { degree: 0, type: 'add9' },
    { degree: 3, type: 'maj7' },
    { degree: 5, type: 'min7' },
    { degree: 4, type: 'sus2' },
  ],
];

// Broken-chord figures (beat offsets → voicing index).
const FIGURES = [
  [0, 1, 2, 1],
  [0, 2, 1, 2],
  [0, 1, 2, 3, 2, 1],
  [0, 2, 3, 1],
];

/**
 * Neo-Classical (slow beat): felt-piano broken chords and long cantabile
 * melodies over a soft strings pad — Ólafur/Nils territory.
 */
class NeoClassicalStyle implements StyleInstance {
  private p: Record<string, ParamValue>;
  private master: SeededRandom;
  private voicing = new VoicingGenerator();
  private beatModel: BeatTimeModel;
  private arc: MacroArc;

  private origin: number | null = null;
  private cursor = 0;
  private barCounter = 0;
  private chordSpan = 2; // bars per chord
  private progression: { degree: number; type: string }[] = [];
  private prevVoicing: number[] = [];
  private prevMelodyPitch = 76;
  private evCounter = 0;
  private humRng: SeededRandom;

  constructor(seed: string | number, parameters: Record<string, ParamValue>) {
    this.p = { ...parameters };
    this.master = new SeededRandom(`${seed}::neoclassical`);
    this.humRng = this.master.fork('humanize');
    this.beatModel = new BeatTimeModel(() => this.num('bpm', 64));
    this.arc = new MacroArc(
      parsePurpose(this.p.sessionPurpose),
      Number(this.p.sessionLength ?? 30) || 30,
      this.master.fork('arc').next() * Math.PI * 2,
    );
  }

  private num(name: string, fallback: number): number {
    const v = this.p[name];
    const n = typeof v === 'number' ? v : parseFloat(String(v));
    return Number.isFinite(n) ? n : fallback;
  }

  private humanize() {
    const h = this.num('humanization', 0.4);
    return {
      t: clamp(this.humRng.gauss(0, 0.006), -0.015, 0.015) * h,
      v: 1 + clamp(this.humRng.gauss(0, 0.04), -0.12, 0.12) * h,
    };
  }

  start(context: StyleContext): void {
    const fx = context.fx;
    fx.get('eq')?.setParameter('low', 1);
    fx.get('eq')?.setParameter('mid', 0.5);
    fx.get('eq')?.setParameter('high', -1);
    fx.get('reverb')?.setParameter('decay', 6);
    fx.get('reverb')?.setParameter('wet', 0.35 + this.num('space', 0.75) * 0.2);
    fx.get('reverb')?.setParameter('predelay', 0.03);
    fx.get('tape')?.setParameter('wet', 0.12);
    fx.get('tape')?.setParameter('wobble', 1.2);
    fx.get('delay')?.setParameter('wet', 0.06);
    fx.get('shimmer')?.setParameter('wet', 0.08);
    fx.get('saturation')?.setParameter('wet', 0.08);
    fx.get('vinyl')?.setParameter('amount', 0);
    context.spatial.setStereoWidth(0.95);
    context.spatial.setMovement(0.15);
  }

  stop(): void {
    /* nothing to release */
  }

  setParameter(name: string, value: ParamValue): void {
    this.p[name] = value;
    if (name === 'sessionPurpose') this.arc.setPurpose(parsePurpose(value));
    else if (name === 'sessionLength') this.arc.setPurpose(parsePurpose(this.p.sessionPurpose), Number(value) || 30);
  }

  nextBoundary(currentPosition: number): number | null {
    if (this.origin === null) return null;
    const barDur = this.beatModel.barDuration;
    const local = Math.max(0, currentPosition - this.origin);
    return this.origin + Math.ceil(local / barDur + 1e-6) * barDur;
  }

  private currentChord() {
    if (this.progression.length === 0 || this.barCounter % (this.chordSpan * this.progression.length) === 0) {
      const rng = this.master.fork(`prog:${Math.floor(this.barCounter / (this.chordSpan * 4))}`);
      this.progression = PROGRESSIONS[rng.int(0, PROGRESSIONS.length - 1)];
    }
    return this.progression[Math.floor(this.barCounter / this.chordSpan) % this.progression.length];
  }

  generateEvents({ from, to }: GenerationContext): MusicalEvent[] {
    if (this.origin === null) this.origin = from;
    const events: MusicalEvent[] = [];
    let guard = 0;
    while (this.origin + this.cursor < to && guard++ < 256) {
      const barAbs = this.origin + this.cursor;
      events.push(...this.generateBar(barAbs));
      this.cursor += this.beatModel.barDuration;
      this.barCounter++;
    }
    return events;
  }

  private generateBar(barAbs: number): MusicalEvent[] {
    const events: MusicalEvent[] = [];
    const scale = SCALES[String(this.p.scale ?? 'minor')] ?? SCALES.minor;
    const rootMidi = keyRootMidi(String(this.p.key ?? 'C')) + 12;
    const beat = this.beatModel.secPerBeat;
    const barRng = this.master.fork(`bar:${this.barCounter}`);
    const arc = this.arc.value(barAbs - (this.origin ?? barAbs));
    const arcDensity = clamp(arc.density, 0.05, 1.3);

    const chord = this.currentChord();
    const chordChanged = this.barCounter % this.chordSpan === 0;
    const midis = chordMidis(chord.degree, chord.type, rootMidi, scale);
    if (chordChanged) {
      this.prevVoicing = this.voicing.voice(midis, this.prevVoicing);
    }

    // --- felt piano broken chord ---
    if (arcDensity >= 0.15) {
      const figure = FIGURES[this.barCounter % FIGURES.length];
      const eighth = beat / 2;
      const restChance = Math.max(0, 0.3 - this.num('arpeggioSpeed', 0.55) * 0.3);
      for (let i = 0; i < figure.length; i++) {
        if (i > 0 && barRng.chance(restChance)) continue;
        const note = this.prevVoicing[figure[i] % this.prevVoicing.length];
        const h = this.humanize();
        events.push({
          id: `nc:arp:${this.evCounter++}`,
          type: 'note',
          startTime: barAbs + i * 2 * eighth + h.t,
          duration: eighth * 1.8,
          instrument: 'felt-piano',
          pitch: note,
          velocity: clamp((i === 0 ? 0.5 : 0.4) * h.v * clamp(arc.brightness, 0.5, 1.1), 0.05, 1),
          pan: -0.12,
          metadata: { sourcePlugin: 'neoclassical', role: 'arpeggio', section: 'A' },
        });
      }
    }

    // --- strings pad on chord changes ---
    if (chordChanged && this.num('padLevel', 0.5) > 0.05 && arcDensity >= 0.12) {
      const spanDur = this.beatModel.barDuration * this.chordSpan;
      for (const [interval, level] of [[0, 0.45], [7, 0.3]] as const) {
        events.push({
          id: `nc:pad:${this.evCounter++}`,
          type: 'drone',
          startTime: barAbs,
          duration: spanDur * 1.15,
          instrument: 'drone',
          pitch: clamp(degreeToMidi(rootMidi, scale, chord.degree) + interval - 12, 30, 55),
          velocity: clamp(level * this.num('padLevel', 0.5) * 1.5 * (0.6 + arc.brightness * 0.4), 0.02, 1),
          pan: interval === 0 ? -0.2 : 0.2,
          parameters: { warmth: 0.85, movement: 0.18, cutoff: 340 },
          metadata: { sourcePlugin: 'neoclassical', role: 'pad', section: 'A' },
        });
      }
    }

    // --- cantabile melody: long tones every few bars ---
    if (arcDensity >= 0.25 && this.barCounter % 2 === 1 && barRng.chance(this.num('melodyDensity', 0.4))) {
      const tones = midis.map((m) => m + 12);
      let pitch = nearestIn(tones, this.prevMelodyPitch + barRng.pick([-2, -1, 1, 2]));
      while (pitch - this.prevMelodyPitch > 7) pitch -= 12;
      while (this.prevMelodyPitch - pitch > 7) pitch += 12;
      this.prevMelodyPitch = pitch;
      const h = this.humanize();
      events.push({
        id: `nc:mel:${this.evCounter++}`,
        type: 'note',
        startTime: barAbs + (barRng.chance(0.5) ? 0 : beat) + h.t,
        duration: beat * barRng.range(2, 4),
        instrument: 'felt-piano',
        pitch,
        velocity: clamp(0.55 * h.v * clamp(arc.brightness, 0.5, 1.1), 0.05, 1),
        pan: 0.15,
        metadata: { sourcePlugin: 'neoclassical', role: 'melody', section: 'A' },
      });
    }

    return events;
  }
}

function neoClassicalParameters() {
  return [
    { id: 'bpm', name: 'BPM', type: 'range', min: 52, max: 84, step: 1, default: 64, category: 'basic', unit: 'bpm' },
    { id: 'key', name: '调性', type: 'select', default: 'C', options: NOTE_NAMES.map((n) => ({ value: n, label: n })), category: 'basic' },
    {
      id: 'scale',
      name: '音阶',
      type: 'select',
      default: 'minor',
      options: [
        { value: 'minor', label: '自然小调' },
        { value: 'major', label: '大调' },
        { value: 'dorian', label: '多利亚' },
      ],
      category: 'basic',
    },
    { id: 'romance', name: '浪漫度', type: 'range', min: 0, max: 1, step: 0.01, default: 0.6, category: 'basic', percent: true },
    { id: 'arpeggioSpeed', name: '琶音速度', type: 'range', min: 0, max: 1, step: 0.01, default: 0.55, category: 'basic', percent: true },
    { id: 'melodyDensity', name: '旋律密度', type: 'range', min: 0, max: 1, step: 0.01, default: 0.4, category: 'basic', percent: true },
    { id: 'padLevel', name: '弦乐铺底', type: 'range', min: 0, max: 1, step: 0.01, default: 0.5, category: 'basic', percent: true },
    { id: 'sessionPurpose', name: '聆听目的', type: 'select', default: 'flow', options: [...PURPOSE_OPTIONS], category: 'basic' },
    { id: 'space', name: '空间', type: 'range', min: 0, max: 1, step: 0.01, default: 0.75, scope: 'fx', category: 'basic', percent: true },
    { id: 'humanization', name: '人性化', type: 'range', min: 0, max: 1, step: 0.01, default: 0.4, category: 'advanced', percent: true },
    {
      id: 'sessionLength',
      name: '睡眠/冥想时长',
      type: 'select',
      default: '30',
      options: [
        { value: '10', label: '10 分钟' },
        { value: '20', label: '20 分钟' },
        { value: '30', label: '30 分钟' },
        { value: '60', label: '60 分钟' },
      ],
      category: 'advanced',
    },
  ] as import('../../core/types').ParameterDefinition[];
}

export const neoClassicalPlugin: StylePlugin = {
  id: 'neoclassical',
  name: 'Neo-Classical',
  version: '1.0.0',
  description: '新古典：毡感钢琴的分解和弦与如歌长旋律，弦乐铺底在下方缓慢呼吸。',
  timeMode: 'beat',
  tags: ['neoclassical', 'piano', 'strings', 'romantic'],
  color: '#d9c8a9',
  parameters: neoClassicalParameters(),
  presets: [
    { id: 'felt-hours', name: 'Felt Hours', parameters: { bpm: 62, romance: 0.7, melodyDensity: 0.4, padLevel: 0.55 } },
    { id: 'nocturne', name: 'Nocturne', parameters: { bpm: 56, romance: 0.85, melodyDensity: 0.5, padLevel: 0.65, space: 0.85 } },
    { id: 'bright-morning', name: 'Bright Morning', parameters: { bpm: 72, scale: 'major', romance: 0.45, arpeggioSpeed: 0.7, padLevel: 0.4 } },
  ],
  requiredInstruments: ['felt-piano', 'drone'],
  optionalInstruments: [],
  requiredFX: ['reverb'],
  optionalFX: ['tape', 'shimmer', 'stereo', 'eq'],
  create: ({ seed, parameters }) => new NeoClassicalStyle(seed, parameters),
};

export default neoClassicalPlugin;
