import { SeededRandom } from '../../core/SeededRandom';
import type {
  GenerationContext,
  MusicalEvent,
  ParamValue,
  StyleContext,
  StyleInstance,
  StylePlugin,
} from '../../core/types';
import { NOTE_NAMES, SCALES, chordMidis, clamp, degreeToMidi, keyRootMidi, lerp } from '../../core/music/Theory';
import { BeatTimeModel } from '../../time/BeatTimeModel';
import { MacroArc, parsePurpose, PURPOSE_OPTIONS } from '../../time/MacroArc';
import { VoicingGenerator } from '../lofi/VoicingGenerator';

// Classic minimal arpeggio contours over a 4-voice stack.
const CONTOURS = [
  [0, 1, 2, 3, 2, 1],
  [3, 2, 1, 0, 1, 2],
  [0, 2, 1, 3, 0, 2],
  [0, 1, 0, 2, 0, 3],
];

/**
 * Minimal (beat): Glass/Reich-flavoured repeating arpeggio cells over slow
 * chord changes, with phase-shifting accents and an occasional long melody
 * tone. Straight time, tiny humanization, optional soft four-on-the-floor.
 */
class MinimalStyle implements StyleInstance {
  private p: Record<string, ParamValue>;
  private master: SeededRandom;
  private voicing = new VoicingGenerator();
  private beatModel: BeatTimeModel;
  private arc: MacroArc;

  private origin: number | null = null;
  private cursor = 0;
  private barCounter = 0;
  private chordSpan = 4; // bars per chord
  private progression: { degree: number; type: string }[] = [];
  private prevVoicing: number[] = [];
  private lastVoicingKey = '';
  private contour: number[];
  private contourOffset = 0;
  private evCounter = 0;

  constructor(seed: string | number, parameters: Record<string, ParamValue>) {
    this.p = { ...parameters };
    this.master = new SeededRandom(`${seed}::minimal`);
    this.beatModel = new BeatTimeModel(() => this.num('bpm', 118));
    const rng = this.master.fork('contour');
    this.contour = CONTOURS[rng.int(0, CONTOURS.length - 1)];
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
    fx.get('eq')?.setParameter('low', 0.5);
    fx.get('eq')?.setParameter('mid', -0.5);
    fx.get('eq')?.setParameter('high', 0.5);
    fx.get('reverb')?.setParameter('decay', 3.2);
    fx.get('reverb')?.setParameter('wet', 0.18 + this.num('space', 0.7) * 0.25);
    fx.get('delay')?.setParameter('wet', 0.14);
    fx.get('delay')?.setParameter('time', 0.32);
    fx.get('delay')?.setParameter('feedback', 0.35);
    fx.get('tape')?.setParameter('wet', 0.08);
    fx.get('vinyl')?.setParameter('amount', 0);
    fx.get('shimmer')?.setParameter('wet', 0.08);
    fx.get('saturation')?.setParameter('wet', 0.12);
    context.spatial.setStereoWidth(1.0);
    context.spatial.setMovement(0.1);
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

  private ensureProgression(): { degree: number; type: string } {
    if (this.progression.length === 0 || this.barCounter % (this.chordSpan * this.progression.length) === 0) {
      const rng = this.master.fork(`prog:${Math.floor(this.barCounter / (this.chordSpan * 4))}`);
      if (this.progression.length === 0) {
        // Minimal harmony: two alternating colors, seeded.
        const a = { degree: 0, type: rng.pick(['m9', 'sus2', 'add9']) };
        const b = { degree: rng.pick([3, 5, 1]), type: rng.pick(['maj9', 'm7', 'sus4']) };
        this.progression = rng.chance(0.5) ? [a, b] : [a, b, { ...a }];
      }
    }
    const idx = Math.floor(this.barCounter / this.chordSpan) % this.progression.length;
    return this.progression[idx];
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
    const rootMidi = keyRootMidi(String(this.p.key ?? 'C'));
    const beat = this.beatModel.secPerBeat;
    const arc = this.arc.value(barAbs - (this.origin ?? barAbs));
    const arcDensity = clamp(arc.density, 0.05, 1.3);
    const arcBright = clamp(arc.brightness, 0.3, 1.1);
    const barRng = this.master.fork(`bar:${this.barCounter}`);

    const chord = this.ensureProgression();
    const voicingKey = `${chord.degree}:${chord.type}`;
    if (voicingKey !== this.lastVoicingKey) {
      this.prevVoicing = this.voicing.voice(chordMidis(chord.degree, chord.type, rootMidi, scale), this.prevVoicing);
      this.lastVoicingKey = voicingKey;
    }
    if (this.prevVoicing.length < 2) return events;

    // Phase shift: every few bars the contour start rotates (Reich feel).
    const motion = this.num('motion', 0.5);
    if (motion > 0.04 && this.barCounter > 0 && this.barCounter % Math.max(2, Math.round(lerp(12, 3, motion))) === 0) {
      this.contourOffset = (this.contourOffset + 1) % this.contour.length;
    }

    const sixteenths = this.num('patternSpeed', 0.35) > 0.5;
    const steps = sixteenths ? 16 : 8;
    const stepDur = (this.beatModel.barDuration) / steps;
    const bright = 0.35 + this.num('brightness', 0.5) * 0.5;

    if (arcDensity >= 0.12) {
      for (let s = 0; s < steps; s++) {
        // Occasional rests keep the pattern breathing (density 1 = none).
        if (s > 0 && barRng.chance(0.4 * (1 - this.num('density', 0.6)))) continue;
        const idx = (s + this.contourOffset) % this.contour.length;
        const voiceIdx = this.contour[idx] % this.prevVoicing.length;
        const accent = s % steps === 0 ? 0.55 : s % (steps / 4) === 0 ? 0.46 : 0.38;
        events.push({
          id: `min:${this.evCounter++}`,
          type: 'note',
          startTime: barAbs + s * stepDur + (barRng.gauss(0, 0.003) * this.num('humanization', 0.35)),
          duration: stepDur * 0.92,
          instrument: 'pluck',
          pitch: this.prevVoicing[voiceIdx],
          velocity: clamp(accent * arcBright * (0.8 + barRng.next() * 0.2), 0.05, 1),
          pan: clamp((voiceIdx - this.prevVoicing.length / 2) * 0.12, -0.5, 0.5),
          parameters: { bright },
          metadata: { sourcePlugin: 'minimal', role: 'arpeggio', section: 'A' },
        });
      }
    }

    // Pad: the current chord sustained under each new chord span.
    if (this.barCounter % this.chordSpan === 0 && arcDensity >= 0.15) {
      events.push({
        id: `min:${this.evCounter++}`,
        type: 'chord',
        startTime: barAbs,
        duration: this.beatModel.barDuration * this.chordSpan,
        instrument: 'electric-piano',
        pitch: degreeToMidi(rootMidi, scale, chord.degree),
        notes: this.prevVoicing,
        velocity: clamp(0.22 * arcBright, 0.05, 1),
        pan: 0,
        parameters: { roll: 0.04 },
        metadata: { sourcePlugin: 'minimal', role: 'pad', section: 'A' },
      });
    }

    // Long melody tone every 8 bars — the human line above the machine.
    if (this.barCounter % 8 === 3 && arcDensity >= 0.25) {
      events.push({
        id: `min:${this.evCounter++}`,
        type: 'note',
        startTime: barAbs,
        duration: this.beatModel.barDuration * 1.5,
        instrument: 'electric-piano',
        pitch: this.prevVoicing[this.prevVoicing.length - 1] + 12,
        velocity: clamp(0.32 * arcBright, 0.05, 1),
        pan: 0.1,
        metadata: { sourcePlugin: 'minimal', role: 'melody', section: 'A' },
      });
    }

    // Optional soft four-on-the-floor.
    const pulse = this.num('pulse', 0);
    if (pulse > 0.04 && arcDensity >= 0.3) {
      for (let b = 0; b < 4; b++) {
        events.push({
          id: `min:${this.evCounter++}`,
          type: 'drum',
          startTime: barAbs + b * beat,
          duration: 0.22,
          instrument: 'kick',
          velocity: clamp((0.25 + pulse * 0.25) * arcBright, 0.05, 1),
          pan: 0,
          parameters: { duck: pulse * 0.4 },
          metadata: { sourcePlugin: 'minimal', role: 'pulse', section: 'A' },
        });
      }
    }

    return events;
  }
}

function minimalParameters() {
  return [
    { id: 'bpm', name: 'BPM', type: 'range', min: 96, max: 132, step: 1, default: 118, category: 'basic', unit: 'bpm' },
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
    { id: 'patternSpeed', name: '音符密度', type: 'range', min: 0, max: 1, step: 0.01, default: 0.35, category: 'basic', percent: true },
    { id: 'motion', name: '相位移动', type: 'range', min: 0, max: 1, step: 0.01, default: 0.5, category: 'basic', percent: true },
    { id: 'brightness', name: '亮度', type: 'range', min: 0, max: 1, step: 0.01, default: 0.5, category: 'basic', percent: true },
    { id: 'pulse', name: '四拍底鼓', type: 'range', min: 0, max: 1, step: 0.01, default: 0, category: 'basic', percent: true },
    { id: 'sessionPurpose', name: '聆听目的', type: 'select', default: 'focus', options: [...PURPOSE_OPTIONS], category: 'basic' },
    { id: 'density', name: '休止', type: 'range', min: 0, max: 1, step: 0.01, default: 0.6, category: 'advanced', percent: true },
    { id: 'space', scope: 'fx', name: '空间', type: 'range', min: 0, max: 1, step: 0.01, default: 0.7, category: 'advanced', percent: true },
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

export const minimalPlugin: StylePlugin = {
  id: 'minimal',
  name: 'Minimal',
  version: '1.0.0',
  description: '极简主义：循环琶音细胞在缓慢和声上流动，相位移动与稀疏长音，如玻璃般清晰。',
  timeMode: 'beat',
  tags: ['minimalism', 'arpeggio', 'phase', 'glass'],
  color: '#c9cdd6',
  parameters: minimalParameters(),
  presets: [
    { id: 'glass-frames', name: 'Glass Frames', parameters: { bpm: 116, patternSpeed: 0.35, motion: 0.5, brightness: 0.55 } },
    { id: 'phase-drift', name: 'Phase Drift', parameters: { bpm: 112, patternSpeed: 0.6, motion: 0.85, pulse: 0 } },
    { id: 'night-drive', name: 'Night Drive', parameters: { bpm: 122, patternSpeed: 0.35, motion: 0.4, pulse: 0.45, brightness: 0.6 } },
  ],
  requiredInstruments: ['pluck', 'electric-piano'],
  optionalInstruments: ['kick'],
  requiredFX: ['reverb'],
  optionalFX: ['delay', 'eq', 'stereo', 'saturation'],
  create: ({ seed, parameters }) => new MinimalStyle(seed, parameters),
};

export default minimalPlugin;
