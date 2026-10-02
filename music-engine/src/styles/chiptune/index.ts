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
    { degree: 0, type: 'maj' },
    { degree: 5, type: 'min' },
    { degree: 3, type: 'maj' },
    { degree: 4, type: 'maj' },
  ],
  [
    { degree: 0, type: 'min' },
    { degree: 5, type: 'maj' },
    { degree: 3, type: 'maj' },
    { degree: 6, type: 'maj' },
  ],
  [
    { degree: 0, type: 'maj' },
    { degree: 4, type: 'min' },
    { degree: 5, type: 'min' },
    { degree: 3, type: 'maj' },
  ],
];

/**
 * Chiptune (beat): pure square waves running fast arpeggios over simple
 * triads, noise-channel percussion, and an almost dry mix. Constant
 * velocities on purpose — that's the 8-bit honesty.
 */
class ChiptuneStyle implements StyleInstance {
  private p: Record<string, ParamValue>;
  private master: SeededRandom;
  private beatModel: BeatTimeModel;
  private arc: MacroArc;

  private origin: number | null = null;
  private cursor = 0;
  private barCounter = 0;
  private progression: { degree: number; type: string }[] = [];
  private evCounter = 0;

  constructor(seed: string | number, parameters: Record<string, ParamValue>) {
    this.p = { ...parameters };
    this.master = new SeededRandom(`${seed}::chiptune`);
    this.beatModel = new BeatTimeModel(() => this.num('bpm', 140));
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

  start(context: StyleContext): void {
    const fx = context.fx;
    // Deliberately dry and bright: the console-speaker aesthetic.
    fx.get('eq')?.setParameter('low', -1);
    fx.get('eq')?.setParameter('mid', 1);
    fx.get('eq')?.setParameter('high', 2.5);
    fx.get('reverb')?.setParameter('decay', 1.2);
    fx.get('reverb')?.setParameter('wet', 0.08);
    fx.get('delay')?.setParameter('wet', 0.12);
    fx.get('delay')?.setParameter('time', 0.24);
    fx.get('delay')?.setParameter('feedback', 0.3);
    fx.get('tape')?.setParameter('wet', 0);
    fx.get('vinyl')?.setParameter('amount', 0);
    fx.get('shimmer')?.setParameter('wet', 0);
    fx.get('saturation')?.setParameter('wet', 0.1);
    context.spatial.setStereoWidth(0.8);
    context.spatial.setMovement(0.05);
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
    if (this.progression.length === 0 || this.barCounter % (this.progression.length * 2) === 0) {
      const rng = this.master.fork(`prog:${Math.floor(this.barCounter / 8)}`);
      this.progression = PROGRESSIONS[rng.int(0, PROGRESSIONS.length - 1)];
    }
    return this.progression[Math.floor(this.barCounter / 2) % this.progression.length];
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
    const scale = SCALES[String(this.p.scale ?? 'major')] ?? SCALES.major;
    const rootMidi = keyRootMidi(String(this.p.key ?? 'C'));
    const beat = this.beatModel.secPerBeat;
    const barRng = this.master.fork(`bar:${this.barCounter}`);
    const arc = this.arc.value(barAbs - (this.origin ?? barAbs));
    const arcDensity = clamp(arc.density, 0.05, 1.3);
    const energy = this.num('energy', 0.65);

    const chord = this.currentChord();
    const midis = chordMidis(chord.degree, chord.type, rootMidi, scale);
    const sixteenth = this.num('arpRate', 0.7) > 0.5;
    const steps = sixteenth ? 16 : 8;
    const stepDur = this.beatModel.barDuration / steps;

    // --- square arpeggio: up-down over the triad, octave jumps for sparkle ---
    if (arcDensity >= 0.15) {
      const arp = [midis[0] + 12, midis[1] + 12, midis[2] + 12, midis[0] + 24];
      const contour = [0, 1, 2, 3, 2, 1];
      for (let s = 0; s < steps; s++) {
        const idx = contour[s % contour.length];
        const octaveJump = s % 8 === 7 && barRng.chance(0.5) ? 12 : 0;
        events.push({
          id: `ct:arp:${this.evCounter++}`,
          type: 'note',
          startTime: barAbs + s * stepDur,
          duration: stepDur * 0.9,
          instrument: 'chip',
          pitch: arp[idx] + octaveJump,
          velocity: 0.55, // constant — 8-bit honesty
          pan: 0,
          metadata: { sourcePlugin: 'chiptune', role: 'arp', section: 'A' },
        });
      }
    }

    // --- square bass on 8ths ---
    if (arcDensity >= 0.15) {
      for (let s = 0; s < 8; s++) {
        if (s % 2 === 1 && barRng.chance(0.5 - energy * 0.3)) continue;
        events.push({
          id: `ct:bass:${this.evCounter++}`,
          type: 'bass',
          startTime: barAbs + s * (beat / 2),
          duration: (beat / 2) * 0.85,
          instrument: 'chip',
          pitch: degreeToMidi(rootMidi, scale, chord.degree) - 12,
          velocity: 0.6,
          pan: 0,
          metadata: { sourcePlugin: 'chiptune', role: 'bass', section: 'A' },
        });
      }
    }

    // --- noise channel drums ---
    if (arcDensity >= 0.2) {
      const kicks = energy > 0.5 ? [0, 4, 8, 12] : [0, 8];
      for (const step of kicks) {
        events.push({
          id: `ct:kick:${this.evCounter++}`,
          type: 'drum',
          startTime: barAbs + step * (beat / 4),
          duration: 0.12,
          instrument: 'kick',
          velocity: 0.7,
          pan: 0,
          parameters: { startFreq: 200 },
          metadata: { sourcePlugin: 'chiptune', role: 'drums', section: 'A' },
        });
      }
      for (const step of [4, 12]) {
        events.push({
          id: `ct:snare:${this.evCounter++}`,
          type: 'drum',
          startTime: barAbs + step * (beat / 4),
          duration: 0.1,
          instrument: 'snare',
          velocity: 0.55 * this.num('noiseLevel', 0.7),
          pan: 0,
          metadata: { sourcePlugin: 'chiptune', role: 'drums', section: 'A' },
        });
      }
      if (energy > 0.4) {
        for (let s = 2; s < 16; s += 4) {
          events.push({
            id: `ct:hat:${this.evCounter++}`,
            type: 'drum',
            startTime: barAbs + s * (beat / 4),
            duration: 0.03,
            instrument: 'hat',
            velocity: 0.35 * this.num('noiseLevel', 0.7),
            pan: 0,
            metadata: { sourcePlugin: 'chiptune', role: 'drums', section: 'A' },
          });
        }
      }
    }

    // --- lead: a square melody every other bar ---
    if (arcDensity >= 0.25 && this.barCounter % 2 === 1 && barRng.chance(this.num('leadDensity', 0.45))) {
      let s = barRng.int(0, 2);
      while (s < 8) {
        const tone = midis[barRng.int(0, midis.length - 1)] + 24;
        const len = barRng.pick([1, 1, 2]);
        events.push({
          id: `ct:lead:${this.evCounter++}`,
          type: 'note',
          startTime: barAbs + s * (beat / 2),
          duration: (beat / 2) * len * 0.92,
          instrument: 'chip',
          pitch: tone,
          velocity: 0.62,
          pan: 0,
          metadata: { sourcePlugin: 'chiptune', role: 'lead', section: 'A' },
        });
        s += len + (barRng.chance(0.4) ? 1 : 0);
      }
    }

    return events;
  }
}

function chiptuneParameters() {
  return [
    { id: 'bpm', name: 'BPM', type: 'range', min: 110, max: 172, step: 1, default: 140, category: 'basic', unit: 'bpm' },
    { id: 'key', name: '调性', type: 'select', default: 'C', options: NOTE_NAMES.map((n) => ({ value: n, label: n })), category: 'basic' },
    {
      id: 'scale',
      name: '音阶',
      type: 'select',
      default: 'major',
      options: [
        { value: 'major', label: '大调' },
        { value: 'minor', label: '自然小调' },
        { value: 'mixolydian', label: '混合利亚' },
      ],
      category: 'basic',
    },
    { id: 'energy', name: '能量', type: 'range', min: 0, max: 1, step: 0.01, default: 0.65, category: 'basic', percent: true },
    { id: 'arpRate', name: '琶音速率', type: 'range', min: 0, max: 1, step: 0.01, default: 0.7, category: 'basic', percent: true },
    { id: 'leadDensity', name: '主奏密度', type: 'range', min: 0, max: 1, step: 0.01, default: 0.45, category: 'basic', percent: true },
    { id: 'noiseLevel', name: '噪声通道', type: 'range', min: 0, max: 1, step: 0.01, default: 0.7, category: 'basic', percent: true },
    { id: 'sessionPurpose', name: '聆听目的', type: 'select', default: 'flow', options: [...PURPOSE_OPTIONS], category: 'basic' },
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

export const chiptunePlugin: StylePlugin = {
  id: 'chiptune',
  name: 'Chiptune',
  version: '1.0.0',
  description: '芯片音乐：纯正方波琶音与低音、噪声通道鼓组、近乎干燥的混音——8-bit 的诚实。',
  timeMode: 'beat',
  tags: ['chiptune', '8bit', 'game', 'square'],
  color: '#e8e26e',
  parameters: chiptuneParameters(),
  presets: [
    { id: 'overworld', name: 'Overworld', parameters: { bpm: 140, scale: 'major', energy: 0.65, arpRate: 0.7 } },
    { id: 'boss-rush', name: 'Boss Rush', parameters: { bpm: 160, scale: 'minor', energy: 0.9, arpRate: 1, leadDensity: 0.6 } },
    { id: 'menu-theme', name: 'Menu Theme', parameters: { bpm: 120, scale: 'major', energy: 0.35, arpRate: 0.4, leadDensity: 0.55 } },
  ],
  requiredInstruments: ['chip', 'kick', 'snare', 'hat'],
  optionalInstruments: [],
  requiredFX: ['reverb'],
  optionalFX: ['delay', 'eq'],
  create: ({ seed, parameters }) => new ChiptuneStyle(seed, parameters),
};

export default chiptunePlugin;
