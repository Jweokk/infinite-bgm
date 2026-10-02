import { SeededRandom } from '../../core/SeededRandom';
import type {
  GenerationContext,
  MusicalEvent,
  ParamValue,
  StyleContext,
  StyleInstance,
  StylePlugin,
} from '../../core/types';
import { NOTE_NAMES, SCALES, chordMidis, clamp, degreeToMidi, keyRootMidi } from '../../core/music/Theory';
import { BeatTimeModel } from '../../time/BeatTimeModel';
import { MacroArc, parsePurpose, PURPOSE_OPTIONS } from '../../time/MacroArc';

const PROGRESSIONS: { degree: number; type: string }[][] = [
  [
    { degree: 0, type: 'm9' },
    { degree: 3, type: 'maj9' },
    { degree: 1, type: 'm7' },
    { degree: 4, type: 'm7' },
  ],
  [
    { degree: 0, type: 'm7' },
    { degree: 5, type: 'maj7' },
    { degree: 1, type: 'm9' },
    { degree: 4, type: '7' },
  ],
  [
    { degree: 0, type: 'm9' },
    { degree: 2, type: 'm7' },
    { degree: 5, type: 'maj9' },
    { degree: 4, type: 'sus4' },
  ],
];

type Phase = 'intro' | 'groove' | 'break' | 'drop';
const PHASES: { name: Phase; bars: number }[] = [
  { name: 'intro', bars: 8 },
  { name: 'groove', bars: 16 },
  { name: 'break', bars: 8 },
  { name: 'drop', bars: 16 },
];

/**
 * Deep House (beat): four-on-the-floor, offbeat open hats, filtered chord
 * stabs riding a heavy sidechain pump, and an intro/groove/break/drop arc.
 */
class DeepHouseStyle implements StyleInstance {
  private p: Record<string, ParamValue>;
  private master: SeededRandom;
  private beatModel: BeatTimeModel;
  private arc: MacroArc;

  private origin: number | null = null;
  private cursor = 0;
  private barCounter = 0;
  private phaseIdx = 0;
  private phaseStartBar = 0;
  private barInPhase = 0;
  private progression: { degree: number; type: string }[] = [];
  private evCounter = 0;
  private humRng: SeededRandom;

  constructor(seed: string | number, parameters: Record<string, ParamValue>) {
    this.p = { ...parameters };
    this.master = new SeededRandom(`${seed}::deephouse`);
    this.humRng = this.master.fork('humanize');
    this.beatModel = new BeatTimeModel(() => this.num('bpm', 121));
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
    const h = this.num('humanization', 0.35);
    return {
      t: clamp(this.humRng.gauss(0, 0.003), -0.008, 0.008) * h,
      v: 1 + clamp(this.humRng.gauss(0, 0.025), -0.06, 0.06) * h,
    };
  }

  start(context: StyleContext): void {
    const fx = context.fx;
    fx.get('eq')?.setParameter('low', 2);
    fx.get('eq')?.setParameter('mid', -0.5);
    fx.get('eq')?.setParameter('high', 0.5);
    fx.get('reverb')?.setParameter('decay', 2.8);
    fx.get('reverb')?.setParameter('wet', 0.16 + this.num('space', 0.6) * 0.2);
    fx.get('delay')?.setParameter('wet', 0.12);
    fx.get('delay')?.setParameter('time', 0.3);
    fx.get('delay')?.setParameter('feedback', 0.35);
    fx.get('tape')?.setParameter('wet', 0.1);
    fx.get('shimmer')?.setParameter('wet', 0.08);
    fx.get('saturation')?.setParameter('wet', 0.3);
    fx.get('saturation')?.setParameter('drive', 0.5);
    fx.get('vinyl')?.setParameter('amount', 0);
    context.spatial.setStereoWidth(1.1);
    context.spatial.setMovement(0.12);
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

  private phase(): Phase {
    if (this.progression.length === 0) {
      const rng = this.master.fork('phase:0');
      this.progression = PROGRESSIONS[rng.int(0, PROGRESSIONS.length - 1)];
      return PHASES[0].name;
    }
    if (this.barCounter - this.phaseStartBar >= PHASES[this.phaseIdx].bars) {
      this.phaseIdx = (this.phaseIdx + 1) % PHASES.length;
      this.phaseStartBar = this.barCounter;
      this.barInPhase = 0;
      const rng = this.master.fork(`phase:${this.phaseIdx}`);
      this.progression = PROGRESSIONS[rng.int(0, PROGRESSIONS.length - 1)];
    }
    return PHASES[this.phaseIdx].name;
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
      this.barInPhase++;
    }
    return events;
  }

  private generateBar(barAbs: number): MusicalEvent[] {
    const events: MusicalEvent[] = [];
    const phase = this.phase();
    const scale = SCALES[String(this.p.scale ?? 'minor')] ?? SCALES.minor;
    const rootMidi = keyRootMidi(String(this.p.key ?? 'C'));
    const beat = this.beatModel.secPerBeat;
    const energy = this.num('energy', 0.6);
    const swing = 0.5;
    const barRng = this.master.fork(`bar:${this.barCounter}`);
    const arc = this.arc.value(barAbs - (this.origin ?? barAbs));
    const arcDensity = clamp(arc.density, 0.05, 1.3);
    const openness = this.num('openness', 0.55);

    const chord = this.progression[this.barInPhase % this.progression.length];
    const midis = chordMidis(chord.degree, chord.type, rootMidi, scale);
    const rootBass = degreeToMidi(rootMidi, scale, chord.degree) - 12;
    const drumsOn = phase !== 'break' && phase !== 'intro' ? true : phase === 'intro' && this.barInPhase >= 4;

    // --- four on the floor + heavy pump ---
    if (drumsOn && arcDensity >= 0.2) {
      const duckDepth = this.num('sidechain', 0.65) * 0.8;
      for (let b = 0; b < 4; b++) {
        const h = this.humanize();
        events.push({
          id: `dh:kick:${this.evCounter++}`,
          type: 'drum',
          startTime: barAbs + b * beat + h.t,
          duration: 0.28,
          instrument: 'kick',
          velocity: clamp(0.9 * h.v, 0.05, 1),
          pan: 0,
          parameters: { duck: duckDepth, startFreq: 140 },
          metadata: { sourcePlugin: 'deephouse', role: 'drums', section: phase },
        });
      }
      // offbeat open hats — the house heartbeat
      for (const step of [2, 6, 10, 14]) {
        const h = this.humanize();
        events.push({
          id: `dh:ohh:${this.evCounter++}`,
          type: 'drum',
          startTime: this.beatModel.stepTime(barAbs, step, swing) + h.t,
          duration: 0.16,
          instrument: 'hat',
          velocity: clamp(0.42 * h.v, 0.05, 1),
          pan: 0.18,
          parameters: { open: true },
          metadata: { sourcePlugin: 'deephouse', role: 'drums', section: phase },
        });
      }
      for (const step of [4, 12]) {
        const h = this.humanize();
        events.push({
          id: `dh:clap:${this.evCounter++}`,
          type: 'drum',
          startTime: this.beatModel.stepTime(barAbs, step, swing) + h.t,
          duration: 0.14,
          instrument: 'snare',
          velocity: clamp(0.45 * h.v, 0.05, 1),
          pan: -0.05,
          metadata: { sourcePlugin: 'deephouse', role: 'drums', section: phase },
        });
      }
      if (energy > 0.55) {
        for (let s = 1; s < 16; s += 2) {
          if (!barRng.chance(0.35 * this.num('drumDensity', 0.6))) continue;
          const h = this.humanize();
          events.push({
            id: `dh:chh:${this.evCounter++}`,
            type: 'drum',
            startTime: this.beatModel.stepTime(barAbs, s, swing) + h.t,
            duration: 0.04,
            instrument: 'hat',
            velocity: clamp(0.2 * h.v, 0.05, 1),
            pan: 0.18,
            metadata: { sourcePlugin: 'deephouse', role: 'drums', section: phase },
          });
        }
      }
    }

    // --- offbeat bass ---
    if (phase !== 'intro' && arcDensity >= 0.15) {
      for (const step of [2, 6, 10, 14]) {
        if (barRng.chance(0.15)) continue;
        const h = this.humanize();
        events.push({
          id: `dh:bass:${this.evCounter++}`,
          type: 'bass',
          startTime: this.beatModel.stepTime(barAbs, step, swing) + h.t,
          duration: (beat / 2) * 0.8,
          instrument: 'bass',
          pitch: rootBass,
          velocity: clamp((0.5 + energy * 0.2) * h.v * clamp(arc.brightness, 0.4, 1.1), 0.05, 1),
          pan: 0,
          metadata: { sourcePlugin: 'deephouse', role: 'bass', section: phase },
        });
      }
    }

    // --- filtered chord stabs / break pad ---
    const stabPatterns = [[2, 10], [2, 6, 10, 14], [3, 11], [2, 7, 10, 15]];
    if (phase === 'break') {
      // Held pad chord through the break.
      events.push({
        id: `dh:pad:${this.evCounter++}`,
        type: 'chord',
        startTime: barAbs,
        duration: this.beatModel.barDuration,
        instrument: 'supersaw',
        pitch: degreeToMidi(rootMidi, scale, chord.degree),
        notes: midis.map((m) => m + 12),
        velocity: clamp((0.2 + this.num('stabDensity', 0.55) * 0.15) * arc.brightness, 0.05, 1),
        pan: 0,
        parameters: { cutoff: 500 + openness * 1400, width: 20, attack: 0.5 },
        metadata: { sourcePlugin: 'deephouse', role: 'pad', section: phase },
      });
    } else if (arcDensity >= 0.15) {
      // Slow filter breathing across 8-bar phrases.
      const sweep = 0.5 + 0.5 * Math.sin((this.barCounter / 8) * Math.PI * 2);
      const cutoff = 420 + openness * 2200 * sweep;
      const pattern = stabPatterns[this.barCounter % stabPatterns.length];
      for (const step of pattern) {
        if (barRng.chance(0.6 - this.num('stabDensity', 0.55) * 0.4)) continue;
        const h = this.humanize();
        events.push({
          id: `dh:stab:${this.evCounter++}`,
          type: 'chord',
          startTime: this.beatModel.stepTime(barAbs, step, swing) + h.t,
          duration: beat * 0.45,
          instrument: 'supersaw',
          pitch: degreeToMidi(rootMidi, scale, chord.degree),
          notes: midis.map((m) => m + 12),
          velocity: clamp(0.4 * h.v, 0.05, 1),
          pan: barRng.range(-0.15, 0.15),
          parameters: { cutoff, width: 14, attack: 0.01 },
          metadata: { sourcePlugin: 'deephouse', role: 'stab', section: phase },
        });
      }
    }

    return events;
  }
}

function deepHouseParameters() {
  return [
    { id: 'bpm', name: 'BPM', type: 'range', min: 116, max: 126, step: 1, default: 121, category: 'basic', unit: 'bpm' },
    { id: 'key', name: '调性', type: 'select', default: 'F', options: NOTE_NAMES.map((n) => ({ value: n, label: n })), category: 'basic' },
    {
      id: 'scale',
      name: '音阶',
      type: 'select',
      default: 'minor',
      options: [
        { value: 'minor', label: '自然小调' },
        { value: 'dorian', label: '多利亚' },
      ],
      category: 'basic',
    },
    { id: 'energy', name: '能量', type: 'range', min: 0, max: 1, step: 0.01, default: 0.6, category: 'basic', percent: true },
    { id: 'openness', name: '滤波开度', type: 'range', min: 0, max: 1, step: 0.01, default: 0.55, category: 'basic', percent: true },
    { id: 'stabDensity', name: '切分密度', type: 'range', min: 0, max: 1, step: 0.01, default: 0.55, category: 'basic', percent: true },
    { id: 'sidechain', name: '侧链泵动', type: 'range', min: 0, max: 1, step: 0.01, default: 0.65, category: 'basic', percent: true },
    { id: 'sessionPurpose', name: '聆听目的', type: 'select', default: 'flow', options: [...PURPOSE_OPTIONS], category: 'basic' },
    { id: 'drumDensity', name: '镲片密度', type: 'range', min: 0, max: 1, step: 0.01, default: 0.6, category: 'basic', percent: true },
    { id: 'space', name: '空间', type: 'range', min: 0, max: 1, step: 0.01, default: 0.6, scope: 'fx', category: 'basic', percent: true },
    { id: 'humanization', name: '人性化', type: 'range', min: 0, max: 1, step: 0.01, default: 0.35, category: 'advanced', percent: true },
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

export const deepHousePlugin: StylePlugin = {
  id: 'deephouse',
  name: 'Deep House',
  version: '1.0.0',
  description: '深浩室：四拍底鼓、反拍开镲、随呼吸开合的滤波和弦切分与深侧链泵动。',
  timeMode: 'beat',
  tags: ['house', 'dance', 'groove', 'club'],
  color: '#4fc3e8',
  parameters: deepHouseParameters(),
  presets: [
    { id: 'late-set', name: 'Late Set', parameters: { bpm: 120, energy: 0.5, openness: 0.45, stabDensity: 0.5 } },
    { id: 'warehouse', name: 'Warehouse', parameters: { bpm: 124, energy: 0.8, openness: 0.75, stabDensity: 0.7, sidechain: 0.75 } },
    { id: 'sunset-roof', name: 'Sunset Roof', parameters: { bpm: 118, energy: 0.4, openness: 0.5, stabDensity: 0.45, space: 0.75 } },
  ],
  requiredInstruments: ['supersaw', 'bass', 'kick', 'hat', 'snare'],
  optionalInstruments: ['electric-piano'],
  requiredFX: ['reverb'],
  optionalFX: ['delay', 'saturation', 'stereo', 'eq'],
  create: ({ seed, parameters }) => new DeepHouseStyle(seed, parameters),
};

export default deepHousePlugin;
