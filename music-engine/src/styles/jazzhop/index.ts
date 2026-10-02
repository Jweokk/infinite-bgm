import { SeededRandom } from '../../core/SeededRandom';
import type {
  GenerationContext,
  MusicalEvent,
  ParamValue,
  StyleContext,
  StyleInstance,
  StylePlugin,
} from '../../core/types';
import { SCALES, chordMidis, clamp, degreeToMidi, keyRootMidi, nearestIn } from '../../core/music/Theory';
import { BeatTimeModel } from '../../time/BeatTimeModel';
import { MacroArc, parsePurpose } from '../../time/MacroArc';
import { HarmonyGenerator } from '../lofi/HarmonyGenerator';
import type { ChordSpec } from '../lofi/HarmonyGenerator';
import { VoicingGenerator } from '../lofi/VoicingGenerator';
import { MelodyGenerator } from '../lofi/MelodyGenerator';
import { NOTE_NAMES } from '../../core/music/Theory';
import { PURPOSE_OPTIONS } from '../../time/MacroArc';

/**
 * Jazzhop (beat): swung ride pattern, walking bass, rootless jazz voicings.
 * Reuses the lofi harmony/voicing/melody generators (unchanged) with its own
 * walking bass and ride-kit drum logic.
 */
class JazzhopStyle implements StyleInstance {
  private p: Record<string, ParamValue>;
  private master: SeededRandom;
  private harmony = new HarmonyGenerator();
  private voicing = new VoicingGenerator();
  private melody = new MelodyGenerator();
  private beatModel: BeatTimeModel;
  private arc: MacroArc;

  private origin: number | null = null;
  private cursor = 0;
  private barCounter = 0;
  private sectionCounter = 0;
  private barInSection = 0;
  private sectionBars = 0;
  private progression: ChordSpec[] = [];
  private prevVoicing: number[] = [];
  private lastChordKey = '';
  private evCounter = 0;
  private humRng: SeededRandom;

  constructor(seed: string | number, parameters: Record<string, ParamValue>) {
    this.p = { ...parameters };
    this.master = new SeededRandom(`${seed}::jazzhop`);
    this.humRng = this.master.fork('humanize');
    this.beatModel = new BeatTimeModel(() => this.num('bpm', 88));
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

  private humanize(biasMs = 0) {
    const h = this.num('humanization', 0.6);
    const bias = (biasMs / 1000) * h;
    const jitter = clamp(this.humRng.gauss(0, 0.005), -0.015, 0.015) * h;
    const v = 1 + clamp(this.humRng.gauss(0, 0.035), -0.1, 0.1) * h;
    const pan = clamp(this.humRng.gauss(0, 0.035), -0.1, 0.1) * h;
    return { t: clamp(bias + jitter, -0.015, 0.015), v, pan };
  }

  private swingBeats(beatPos: number): number {
    const frac = beatPos % 1;
    if (frac === 0) return 0;
    const swing = this.num('swing', 0.63);
    return frac === 0.5 ? swing - 0.5 : (swing - 0.5) * 0.45;
  }

  start(context: StyleContext): void {
    const fx = context.fx;
    fx.get('eq')?.setParameter('low', 1);
    fx.get('eq')?.setParameter('mid', -0.5);
    fx.get('eq')?.setParameter('high', -1.5);
    fx.get('reverb')?.setParameter('decay', 2.2);
    fx.get('reverb')?.setParameter('wet', 0.12 + this.num('reverb', 0.3) * 0.3);
    fx.get('tape')?.setParameter('wet', 0.15 + this.num('tape', 0.35) * 0.5);
    fx.get('vinyl')?.setParameter('amount', this.num('vinyl', 0.12) * 0.4);
    fx.get('delay')?.setParameter('wet', 0.08);
    fx.get('delay')?.setParameter('time', 0.3);
    fx.get('shimmer')?.setParameter('wet', 0.03);
    fx.get('saturation')?.setParameter('wet', 0.15);
    context.spatial.setStereoWidth(0.95);
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

  private ensureSection(): void {
    if (this.barInSection < this.sectionBars) return;
    const rng = this.master.fork(`section:${this.sectionCounter}`);
    // Intro once, then alternating A (16) / B (12) sections.
    if (this.sectionCounter === 0) this.sectionBars = 4;
    else this.sectionBars = this.sectionCounter % 2 === 1 ? rng.int(12, 16) : rng.int(10, 14);
    this.progression = this.harmony.progression(
      rng,
      String(this.p.scale ?? 'dorian'),
      this.num('mood', 0.65),
      this.sectionCounter,
    );
    this.barInSection = 0;
    this.sectionCounter++;
  }

  private generateBar(barAbs: number): MusicalEvent[] {
    this.ensureSection();
    const events: MusicalEvent[] = [];
    const scale = SCALES[String(this.p.scale ?? 'dorian')] ?? SCALES.dorian;
    const rootMidi = keyRootMidi(String(this.p.key ?? 'C'));
    const beat = this.beatModel.secPerBeat;
    const swing = this.num('swing', 0.63);
    const energy = this.num('energy', 0.5);
    const barRng = this.master.fork(`bar:${this.barCounter}`);
    const arc = this.arc.value(barAbs - (this.origin ?? barAbs));
    const arcDensity = clamp(arc.density, 0.05, 1.3);
    const arcBright = clamp(arc.brightness, 0.2, 1.2);
    const sectionName = this.sectionCounter === 1 ? 'Intro' : this.sectionCounter % 2 === 1 ? 'A' : 'B';

    const chordIdx = this.barInSection % this.progression.length;
    const chord = this.progression[chordIdx];
    const nextChord = this.progression[(chordIdx + 1) % this.progression.length];
    const chordKey = `${this.sectionCounter}:${chordIdx}`;
    const chordChanged = chordKey !== this.lastChordKey;
    if (chordChanged) {
      const midis = chordMidis(chord.degree, chord.type, rootMidi, scale);
      this.prevVoicing = this.voicing.voice(midis, this.prevVoicing);
      this.lastChordKey = chordKey;
    }

    // --- comping: rootless jazz voicings on the off-beats ---
    const hDensity = clamp(this.num('harmonyDensity', 0.55) * arcDensity, 0, 1);
    if (arcDensity >= 0.15) {
      const hits = hDensity < 0.35 ? [0] : hDensity < 0.65 ? [0, 8] : barRng.pick([[0, 6, 8], [0, 8, 14], [2, 8]]);
      const roll = 0.006 + barRng.range(0, 0.015);
      for (const step of hits) {
        const h = this.humanize(3);
        events.push({
          id: `jh:${this.evCounter++}`,
          type: 'chord',
          startTime: this.beatModel.stepTime(barAbs, step, swing) + h.t,
          duration: beat * 1.4,
          instrument: 'electric-piano',
          pitch: degreeToMidi(rootMidi, scale, chord.degree),
          notes: this.prevVoicing,
          velocity: clamp((0.34 + hDensity * 0.22) * h.v * arcBright, 0.05, 1),
          pan: clamp(-0.1 + h.pan, -1, 1),
          parameters: { roll },
          metadata: { sourcePlugin: 'jazzhop', role: 'harmony', section: sectionName },
        });
      }
    }

    // --- walking bass: quarter notes through chord tones + approach ---
    if (arcDensity >= 0.15) {
      const tones = chordMidis(chord.degree, chord.type, rootMidi, scale);
      const reg = (m: number) => {
        let x = m - 12;
        while (x > 47) x -= 12;
        while (x < 33) x += 12;
        return x;
      };
      const pool = tones.map(reg);
      const nextRoot = reg(degreeToMidi(rootMidi, scale, nextChord.degree));
      const walk = [pool[0]];
      if (pool.length > 1) walk.push(nearestIn(pool.filter((x) => x !== walk[0]), walk[0]));
      const third = pool.length > 2 ? nearestIn(pool, walk[1] + 2) : walk[0] + 7;
      walk.push(clamp(third, 30, 50));
      walk.push(nextRoot + (nextRoot >= walk[2] ? -1 : 1)); // chromatic approach
      for (let b = 0; b < 4; b++) {
        const h = this.humanize(-5);
        events.push({
          id: `jh:${this.evCounter++}`,
          type: 'bass',
          startTime: barAbs + b * beat + h.t,
          duration: beat * 0.92,
          instrument: 'bass',
          pitch: walk[b],
          velocity: clamp((0.48 + energy * 0.12) * h.v * clamp(arcBright, 0.4, 1.1), 0.05, 1),
          pan: 0,
          metadata: { sourcePlugin: 'jazzhop', role: 'bass', section: sectionName },
        });
      }
    }

    // --- ride kit: swung ride, feathered kick, ghost snare, hat foot ---
    if (arcDensity >= 0.15) {
      const duckDepth = this.num('sidechain', 0.3) * 0.55;
      const ride = [0, 4, 6, 8, 12, 14];
      for (const step of ride) {
        if (step !== 0 && barRng.chance(0.12)) continue; // human dropped hits
        const accent = step % 8 === 0 ? 0.5 : 0.36;
        const h = this.humanize(-6);
        events.push({
          id: `jh:${this.evCounter++}`,
          type: 'drum',
          startTime: this.beatModel.stepTime(barAbs, step, swing) + h.t,
          duration: 0.06,
          instrument: 'hat',
          velocity: clamp(accent * h.v * arcBright, 0.05, 1),
          pan: clamp(0.22 + h.pan, -1, 1),
          metadata: { sourcePlugin: 'jazzhop', role: 'drums', section: sectionName },
        });
      }
      for (const step of [4, 12]) {
        // hi-hat foot on 2 & 4
        const h = this.humanize(0);
        events.push({
          id: `jh:${this.evCounter++}`,
          type: 'drum',
          startTime: this.beatModel.stepTime(barAbs, step, swing) + h.t,
          duration: 0.05,
          instrument: 'hat',
          velocity: clamp(0.16 * h.v, 0.05, 1),
          pan: -0.2,
          metadata: { sourcePlugin: 'jazzhop', role: 'drums', section: sectionName },
        });
      }
      if (barRng.chance(0.85)) {
        const h = this.humanize(9);
        const params: Record<string, number> = {};
        if (duckDepth > 0.01) params.duck = duckDepth;
        events.push({
          id: `jh:${this.evCounter++}`,
          type: 'drum',
          startTime: this.beatModel.stepTime(barAbs, 0, swing) + h.t,
          duration: 0.25,
          instrument: 'kick',
          velocity: clamp(0.42 * h.v, 0.05, 1),
          pan: 0,
          parameters: params.duck ? params : undefined,
          metadata: { sourcePlugin: 'jazzhop', role: 'drums', section: sectionName },
        });
      }
      if (energy > 0.55 && barRng.chance(this.num('drumDensity', 0.6) * 0.4)) {
        const h = this.humanize(0);
        events.push({
          id: `jh:${this.evCounter++}`,
          type: 'drum',
          startTime: this.beatModel.stepTime(barAbs, 7, swing) + h.t,
          duration: 0.08,
          instrument: 'snare',
          velocity: clamp(0.22 * h.v, 0.05, 1),
          pan: 0.05,
          parameters: { ghost: true },
          metadata: { sourcePlugin: 'jazzhop', role: 'drums', section: sectionName },
        });
      }
    }

    // --- melody: swung lines over the changes ---
    if (this.sectionCounter > 1) {
      for (const n of this.melody.generateBar(barAbs, barRng, this.beatModel, chord, rootMidi, scale, {
        density: clamp(this.num('melodyDensity', 0.5) * arcDensity, 0, 1),
        energy,
        swing,
      })) {
        const h = this.humanize(6);
        events.push({
          id: `jh:${this.evCounter++}`,
          type: 'note',
          startTime: n.time + h.t,
          duration: n.duration,
          instrument: 'electric-piano',
          pitch: n.pitch,
          velocity: clamp(n.velocity * h.v * arcBright, 0.05, 1),
          pan: clamp(0.08 + h.pan, -1, 1),
          metadata: { sourcePlugin: 'jazzhop', role: 'melody', section: sectionName },
        });
      }
    }

    return events;
  }
}

function jazzhopParameters() {
  return [
    { id: 'bpm', name: 'BPM', type: 'range', min: 70, max: 104, step: 1, default: 88, category: 'basic', unit: 'bpm' },
    { id: 'key', name: '调性', type: 'select', default: 'C', options: NOTE_NAMES.map((n) => ({ value: n, label: n })), category: 'basic' },
    {
      id: 'scale',
      name: '音阶',
      type: 'select',
      default: 'dorian',
      options: [
        { value: 'dorian', label: '多利亚' },
        { value: 'minor', label: '自然小调' },
        { value: 'major', label: '大调' },
        { value: 'mixolydian', label: '混合利亚' },
      ],
      category: 'basic',
    },
    { id: 'swing', name: '摇摆', type: 'range', min: 0.56, max: 0.7, step: 0.005, default: 0.63, category: 'basic' },
    { id: 'energy', name: '能量', type: 'range', min: 0, max: 1, step: 0.01, default: 0.5, category: 'basic', percent: true },
    { id: 'mood', name: '爵士度', type: 'range', min: 0, max: 1, step: 0.01, default: 0.65, category: 'basic', percent: true },
    { id: 'sidechain', name: '侧链泵动', type: 'range', min: 0, max: 1, step: 0.01, default: 0.3, category: 'basic', percent: true },
    { id: 'sessionPurpose', name: '聆听目的', type: 'select', default: 'flow', options: [...PURPOSE_OPTIONS], category: 'basic' },
    { id: 'harmonyDensity', name: '和声密度', type: 'range', min: 0, max: 1, step: 0.01, default: 0.55, category: 'basic', percent: true },
    { id: 'melodyDensity', name: '旋律密度', type: 'range', min: 0, max: 1, step: 0.01, default: 0.5, category: 'basic', percent: true },
    { id: 'drumDensity', name: '鼓密度', type: 'range', min: 0, max: 1, step: 0.01, default: 0.6, category: 'basic', percent: true },
    { id: 'reverb', scope: 'fx', name: '混响', type: 'range', min: 0, max: 1, step: 0.01, default: 0.3, category: 'basic', percent: true },
    { id: 'tape', scope: 'fx', name: '磁带', type: 'range', min: 0, max: 1, step: 0.01, default: 0.35, category: 'basic', percent: true },
    { id: 'vinyl', scope: 'fx', name: '黑胶', type: 'range', min: 0, max: 1, step: 0.01, default: 0.12, category: 'basic', percent: true },
    { id: 'humanization', name: '人性化', type: 'range', min: 0, max: 1, step: 0.01, default: 0.6, category: 'advanced', percent: true },
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

export const jazzhopPlugin: StylePlugin = {
  id: 'jazzhop',
  name: 'Jazzhop',
  version: '1.0.0',
  description: '爵士嘻哈：行走贝斯、摇摆 ride 鼓刷与根音省略爵士和声。',
  timeMode: 'beat',
  tags: ['jazzhop', 'jazz', 'swing', 'beats'],
  color: '#c94f6d',
  parameters: jazzhopParameters(),
  presets: [
    { id: 'blue-note', name: 'Blue Note', parameters: { bpm: 92, scale: 'dorian', swing: 0.64, energy: 0.55, mood: 0.7, melodyDensity: 0.55 } },
    { id: 'late-set', name: 'Late Set', parameters: { bpm: 80, scale: 'minor', swing: 0.66, energy: 0.35, mood: 0.6, reverb: 0.42, tape: 0.45 } },
    { id: 'cafe-gig', name: 'Cafe Gig', parameters: { bpm: 96, scale: 'major', swing: 0.61, energy: 0.65, mood: 0.75, melodyDensity: 0.6, drumDensity: 0.7 } },
  ],
  requiredInstruments: ['electric-piano', 'bass', 'hat', 'kick', 'snare'],
  optionalInstruments: ['pluck'],
  requiredFX: ['reverb'],
  optionalFX: ['tape', 'vinyl', 'eq', 'saturation', 'delay', 'stereo'],
  create: ({ seed, parameters }) => new JazzhopStyle(seed, parameters),
};

export default jazzhopPlugin;
