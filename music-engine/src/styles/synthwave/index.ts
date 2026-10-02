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

// Classic retro progressions (minor: i–VI–III–VII family).
const PROGRESSIONS: { degree: number; type: string }[][] = [
  [
    { degree: 0, type: 'min' },
    { degree: 5, type: 'maj' },
    { degree: 2, type: 'maj' },
    { degree: 6, type: 'maj' },
  ],
  [
    { degree: 0, type: 'min' },
    { degree: 6, type: 'maj' },
    { degree: 5, type: 'maj' },
    { degree: 0, type: 'min' },
  ],
  [
    { degree: 0, type: 'min' },
    { degree: 3, type: 'maj' },
    { degree: 5, type: 'maj' },
    { degree: 4, type: 'min' },
  ],
  [
    { degree: 0, type: 'min' },
    { degree: 2, type: 'maj' },
    { degree: 5, type: 'maj' },
    { degree: 6, type: 'maj' },
  ],
];

/**
 * Synthwave (beat): supersaw pads over i–VI–III–VII progressions, 16th-note
 * analog arpeggios, gated drums and a strong sidechain pump — the 1985 that
 * never happened.
 */
class SynthwaveStyle implements StyleInstance {
  private p: Record<string, ParamValue>;
  private master: SeededRandom;
  private beatModel: BeatTimeModel;
  private arc: MacroArc;

  private origin: number | null = null;
  private cursor = 0;
  private barCounter = 0;
  private sectionCounter = 0;
  private barInSection = 0;
  private sectionBars = 4;
  private progression: { degree: number; type: string }[] = [];
  private evCounter = 0;
  private humRng: SeededRandom;

  constructor(seed: string | number, parameters: Record<string, ParamValue>) {
    this.p = { ...parameters };
    this.master = new SeededRandom(`${seed}::synthwave`);
    this.humRng = this.master.fork('humanize');
    this.beatModel = new BeatTimeModel(() => this.num('bpm', 100));
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
    const h = this.num('humanization', 0.3);
    return {
      t: clamp(this.humRng.gauss(0, 0.004), -0.01, 0.01) * h,
      v: 1 + clamp(this.humRng.gauss(0, 0.03), -0.08, 0.08) * h,
    };
  }

  start(context: StyleContext): void {
    const fx = context.fx;
    fx.get('eq')?.setParameter('low', 1.5);
    fx.get('eq')?.setParameter('mid', -0.5);
    fx.get('eq')?.setParameter('high', 1.5);
    fx.get('reverb')?.setParameter('decay', 4.2);
    fx.get('reverb')?.setParameter('wet', 0.28 + this.num('space', 0.7) * 0.25);
    fx.get('delay')?.setParameter('wet', 0.18);
    fx.get('delay')?.setParameter('time', 0.38);
    fx.get('delay')?.setParameter('feedback', 0.4);
    fx.get('tape')?.setParameter('wet', 0.18);
    fx.get('tape')?.setParameter('wobble', 1.4);
    fx.get('shimmer')?.setParameter('wet', 0.16);
    fx.get('saturation')?.setParameter('wet', 0.25);
    fx.get('saturation')?.setParameter('drive', 0.45);
    fx.get('vinyl')?.setParameter('amount', 0);
    context.spatial.setStereoWidth(1.25);
    context.spatial.setMovement(0.2);
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

  private ensureSection(): string {
    if (this.progression.length === 0 || this.barInSection >= this.sectionBars) {
      const rng = this.master.fork(`section:${this.sectionCounter}`);
      this.sectionBars = this.sectionCounter === 0 ? 4 : rng.int(12, 18);
      this.progression = PROGRESSIONS[rng.int(0, PROGRESSIONS.length - 1)];
      this.barInSection = 0;
      this.sectionCounter++;
    }
    return this.sectionCounter === 1 ? 'Intro' : this.sectionCounter % 2 === 0 ? 'A' : 'B';
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
      this.barInSection++;
    }
    return events;
  }

  private generateBar(barAbs: number): MusicalEvent[] {
    const events: MusicalEvent[] = [];
    const sectionName = this.ensureSection();
    const isIntro = sectionName === 'Intro';
    const scale = SCALES[String(this.p.scale ?? 'minor')] ?? SCALES.minor;
    const rootMidi = keyRootMidi(String(this.p.key ?? 'C')) + 12;
    const beat = this.beatModel.secPerBeat;
    const energy = this.num('energy', 0.55);
    const swing = 0.5; // straight time
    const barRng = this.master.fork(`bar:${this.barCounter}`);
    const arc = this.arc.value(barAbs - (this.origin ?? barAbs));
    const arcDensity = clamp(arc.density, 0.05, 1.3);
    const brightness = this.num('brightness', 0.6);

    const chord = this.progression[this.barInSection % this.progression.length];
    const midis = chordMidis(chord.degree, chord.type, rootMidi, scale);
    const section = { name: sectionName, isIntro };

    // --- supersaw pad: the signature wall ---
    events.push({
      id: `sw:pad:${this.evCounter++}`,
      type: 'chord',
      startTime: barAbs,
      duration: this.beatModel.barDuration * 0.99,
      instrument: 'supersaw',
      pitch: degreeToMidi(rootMidi, scale, chord.degree),
      notes: [...midis, midis[0] + 12],
      velocity: clamp((0.18 + this.num('padLevel', 0.65) * 0.22) * arc.brightness, 0.05, 1),
      pan: 0,
      parameters: { cutoff: 600 + brightness * 1900, width: 18, attack: 0.08 },
      metadata: { sourcePlugin: 'synthwave', role: 'pad', section: section.name },
    });

    // --- 16th analog arpeggio (pluck bright) ---
    if (!isIntro && arcDensity >= 0.15) {
      const arpNotes = [midis[0] + 12, midis[1] + 12, midis[2] + 12, midis[0] + 24];
      const contour = [0, 1, 2, 3, 2, 1, 2, 3];
      const gate = this.num('arpDensity', 0.6);
      for (let s = 0; s < 16; s++) {
        if (barRng.chance(0.35 - gate * 0.3)) continue;
        const note = arpNotes[contour[s % contour.length] % arpNotes.length];
        const h = this.humanize();
        events.push({
          id: `sw:arp:${this.evCounter++}`,
          type: 'note',
          startTime: this.beatModel.stepTime(barAbs, s, swing) + h.t,
          duration: (beat / 4) * 0.85,
          instrument: 'pluck',
          pitch: note,
          velocity: clamp((s % 4 === 0 ? 0.42 : 0.3) * h.v, 0.05, 1),
          pan: s % 2 === 0 ? -0.08 : 0.08,
          parameters: { bright: 0.9 },
          metadata: { sourcePlugin: 'synthwave', role: 'arp', section: section.name },
        });
      }
    }

    // --- gated drums ---
    if (!isIntro && arcDensity >= 0.2) {
      const duckDepth = this.num('sidechain', 0.6) * 0.75;
      const kicks = energy > 0.5 ? [0, 4, 8, 12] : [0, 8];
      for (const step of kicks) {
        const h = this.humanize();
        events.push({
          id: `sw:kick:${this.evCounter++}`,
          type: 'drum',
          startTime: this.beatModel.stepTime(barAbs, step, swing) + h.t,
          duration: 0.3,
          instrument: 'kick',
          velocity: clamp(0.85 * h.v, 0.05, 1),
          pan: 0,
          parameters: { duck: duckDepth, startFreq: 160 },
          metadata: { sourcePlugin: 'synthwave', role: 'drums', section: section.name },
        });
      }
      for (const step of [4, 12]) {
        const h = this.humanize();
        events.push({
          id: `sw:snare:${this.evCounter++}`,
          type: 'drum',
          startTime: this.beatModel.stepTime(barAbs, step, swing) + h.t,
          duration: 0.22,
          instrument: 'snare',
          velocity: clamp(0.7 * h.v, 0.05, 1),
          pan: 0,
          metadata: { sourcePlugin: 'synthwave', role: 'drums', section: section.name },
        });
      }
      for (let s = 0; s < 16; s += 2) {
        if (s === 14 && barRng.chance(0.5)) {
          const h = this.humanize();
          events.push({
            id: `sw:hat:${this.evCounter++}`,
            type: 'drum',
            startTime: this.beatModel.stepTime(barAbs, s, swing) + h.t,
            duration: 0.24,
            instrument: 'hat',
            velocity: clamp(0.4 * h.v, 0.05, 1),
            pan: 0.15,
            parameters: { open: true },
            metadata: { sourcePlugin: 'synthwave', role: 'drums', section: section.name },
          });
        } else {
          const h = this.humanize();
          events.push({
            id: `sw:hat:${this.evCounter++}`,
            type: 'drum',
            startTime: this.beatModel.stepTime(barAbs, s, swing) + h.t,
            duration: 0.05,
            instrument: 'hat',
            velocity: clamp((s % 4 === 0 ? 0.4 : 0.28) * h.v, 0.05, 1),
            pan: 0.15,
            metadata: { sourcePlugin: 'synthwave', role: 'drums', section: section.name },
          });
        }
      }
    }

    // --- sparse supersaw lead on strong beats ---
    if (!isIntro && barRng.chance(this.num('leadDensity', 0.35))) {
      const leadNotes = 1 + Math.floor(barRng.next() * 2);
      let t = 0;
      for (let i = 0; i < leadNotes; i++) {
        const tone = midis[barRng.int(0, midis.length - 1)] + 12;
        events.push({
          id: `sw:lead:${this.evCounter++}`,
          type: 'note',
          startTime: barAbs + t * beat,
          duration: beat * barRng.range(0.6, 1.5),
          instrument: 'supersaw',
          pitch: tone,
          velocity: clamp(0.4 * arc.brightness, 0.05, 1),
          pan: 0,
          parameters: { cutoff: 1400 + brightness * 2600, width: 10, attack: 0.02 },
          metadata: { sourcePlugin: 'synthwave', role: 'lead', section: section.name },
        });
        t += barRng.int(2, 3);
        if (t >= 4) break;
      }
    }

    return events;
  }
}

function synthwaveParameters() {
  return [
    { id: 'bpm', name: 'BPM', type: 'range', min: 78, max: 118, step: 1, default: 100, category: 'basic', unit: 'bpm' },
    { id: 'key', name: '调性', type: 'select', default: 'A', options: NOTE_NAMES.map((n) => ({ value: n, label: n })), category: 'basic' },
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
    { id: 'energy', name: '能量', type: 'range', min: 0, max: 1, step: 0.01, default: 0.55, category: 'basic', percent: true },
    { id: 'brightness', name: '亮度', type: 'range', min: 0, max: 1, step: 0.01, default: 0.6, category: 'basic', percent: true },
    { id: 'padLevel', name: '铺底音量', type: 'range', min: 0, max: 1, step: 0.01, default: 0.65, category: 'basic', percent: true },
    { id: 'arpDensity', name: '琶音密度', type: 'range', min: 0, max: 1, step: 0.01, default: 0.6, category: 'basic', percent: true },
    { id: 'leadDensity', name: '主奏密度', type: 'range', min: 0, max: 1, step: 0.01, default: 0.35, category: 'basic', percent: true },
    { id: 'sidechain', name: '侧链泵动', type: 'range', min: 0, max: 1, step: 0.01, default: 0.6, category: 'basic', percent: true },
    { id: 'sessionPurpose', name: '聆听目的', type: 'select', default: 'flow', options: [...PURPOSE_OPTIONS], category: 'basic' },
    { id: 'space', name: '空间', type: 'range', min: 0, max: 1, step: 0.01, default: 0.7, scope: 'fx', category: 'basic', percent: true },
    { id: 'humanization', name: '人性化', type: 'range', min: 0, max: 1, step: 0.01, default: 0.3, category: 'advanced', percent: true },
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

export const synthwavePlugin: StylePlugin = {
  id: 'synthwave',
  name: 'Synthwave',
  version: '1.0.0',
  description: '合成器浪潮：超锯齿铺底、16 分模拟琶音、门限鼓与强侧链——1985 年的霓虹夜。',
  timeMode: 'beat',
  tags: ['synthwave', 'retro', '80s', 'neon'],
  color: '#e15ad7',
  parameters: synthwaveParameters(),
  presets: [
    { id: 'night-drive', name: 'Night Drive', parameters: { bpm: 96, energy: 0.45, brightness: 0.55, padLevel: 0.75, arpDensity: 0.65 } },
    { id: 'outrun', name: 'Outrun', parameters: { bpm: 108, energy: 0.75, brightness: 0.75, arpDensity: 0.75, leadDensity: 0.5, sidechain: 0.7 } },
    { id: 'sunset-grid', name: 'Sunset Grid', parameters: { bpm: 88, energy: 0.35, brightness: 0.45, padLevel: 0.8, leadDensity: 0.25, space: 0.85 } },
  ],
  requiredInstruments: ['supersaw', 'pluck', 'kick', 'snare', 'hat'],
  optionalInstruments: [],
  requiredFX: ['reverb'],
  optionalFX: ['delay', 'tape', 'shimmer', 'stereo', 'saturation', 'eq'],
  create: ({ seed, parameters }) => new SynthwaveStyle(seed, parameters),
};

export default synthwavePlugin;
