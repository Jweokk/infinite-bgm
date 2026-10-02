/**
 * Unified type system shared by Core, Style/Instrument/FX plugins and the UI.
 * Core never knows anything about concrete styles — only these contracts.
 */
import type { SeededRandom } from './SeededRandom';

export type TimeMode = 'beat' | 'free' | 'breath';

export type EventType =
  | 'note'
  | 'chord'
  | 'drum'
  | 'bass'
  | 'drone'
  | 'bell'
  | 'texture'
  | 'wind'
  | 'water'
  | 'harmonic'
  | 'silence';

/** The single unified musical event every style plugin must emit. */
export interface MusicalEvent {
  id: string;
  type: EventType;
  /** Transport time in seconds. */
  startTime: number;
  /** Duration in seconds. */
  duration: number;
  /** Instrument plugin id, resolved by the scheduler via the InstrumentRegistry. */
  instrument?: string;
  /** Base pitch as MIDI note number (drums ignore this). */
  pitch?: number;
  /** Chord voicing as absolute MIDI notes (for chord events). */
  notes?: number[];
  /** 0..1 */
  velocity?: number;
  /** -1..1 stereo position */
  pan?: number;
  /** Free-form, instrument/FX specific controls. */
  parameters?: Record<string, number | string | boolean>;
  metadata?: {
    sourcePlugin?: string;
    role?: string;
    section?: string;
  };
}

export type ParamValue = number | string | boolean;
export type ParameterType = 'number' | 'boolean' | 'select' | 'range';

export interface ParameterDefinition {
  id: string;
  name: string;
  type: ParameterType;
  default: ParamValue;
  min?: number;
  max?: number;
  step?: number;
  options?: { value: string; label: string }[];
  /** 'basic' parameters are always shown; 'advanced' only in advanced mode. */
  category?: 'basic' | 'advanced';
  /**
   * How fast a change is audible (v1.3): 'fx' params drive audio nodes
   * directly (instant); generation params blend in as the generation
   * buffer (~10–25s) is consumed. Default 'generation'.
   */
  scope?: 'fx' | 'generation';
  unit?: string;
  /** Show as percentage 0..100 instead of the raw value. */
  percent?: boolean;
}

export interface Preset {
  id: string;
  name: string;
  parameters: Record<string, ParamValue>;
}

export interface StyleInfo {
  id: string;
  name: string;
  version: string;
  description: string;
  timeMode: TimeMode;
  tags: string[];
  parameters: ParameterDefinition[];
  presets: Preset[];
  requiredInstruments: string[];
  optionalInstruments: string[];
  requiredFX: string[];
  optionalFX: string[];
  /** UI accent color (metadata driven, Core stays agnostic). */
  color: string;
}

// ---------------------------------------------------------------------------
// Style plugin contracts
// ---------------------------------------------------------------------------

export interface StyleConfig {
  seed: string | number;
  parameters: Record<string, ParamValue>;
}

export interface StyleContext {
  audioContext: AudioContext;
  random: SeededRandom;
  instruments: { get(id: string): unknown };
  fx: { get(id: string): FXInstanceHandle | undefined; has(id: string): boolean };
  spatial: SpatialController;
  eventBus: { emit(kind: string, payload?: unknown): void };
}

/** Minimal handle a style may use to drive a shared FX instance. */
export interface FXInstanceHandle {
  setParameter(name: string, value: number): void;
}

export interface SpatialController {
  setStereoWidth(w: number): void;
  setMovement(depth: number): void;
  getMovement(): number;
}

export interface GenerationContext {
  random: SeededRandom;
  from: number;
  to: number;
}

export interface StyleInstance {
  start(context: StyleContext): void;
  stop(): void;
  /**
   * Generate events covering the transport window [from, to).
   * Must be deterministic for a fixed seed + parameters + plugin version,
   * independently of how the timeline is chunked into windows.
   */
  generateEvents(context: GenerationContext): MusicalEvent[];
  setParameter(name: string, value: ParamValue): void;
  /**
   * Optional: transport time of the next musically safe transition point
   * (bar line, phrase end...) after `currentPosition`. Used by engine.next()
   * and style switching to avoid abrupt cutoffs. Null means "any time".
   */
  nextBoundary?(currentPosition: number): number | null;
}

export interface StylePlugin {
  id: string;
  name: string;
  version: string;
  description: string;
  timeMode: TimeMode;
  tags: string[];
  color: string;
  parameters: ParameterDefinition[];
  presets: Preset[];
  requiredInstruments?: string[];
  optionalInstruments?: string[];
  requiredFX?: string[];
  optionalFX?: string[];
  create(config: StyleConfig): StyleInstance;
}

// ---------------------------------------------------------------------------
// Instrument plugin contracts
// ---------------------------------------------------------------------------

export interface InstrumentContext {
  audioContext: AudioContext;
  output: GainNode;
  noiseBuffer: AudioBuffer;
}

export interface InstrumentInstance {
  trigger(event: MusicalEvent, audioContextTime: number): void;
  stopAll(audioContextTime: number, fade: number): void;
  setParameter(name: string, value: number): void;
  dispose?(): void;
}

export interface InstrumentPlugin {
  id: string;
  name: string;
  /**
   * Route this instrument's bus through the sidechain duck gain
   * (v1.1 §76.2) — data-driven, styles still control it via event params.
   */
  duck?: boolean;
  create(context: InstrumentContext): InstrumentInstance;
}

// ---------------------------------------------------------------------------
// FX plugin contracts
// ---------------------------------------------------------------------------

export interface FXContext {
  audioContext: AudioContext;
  noiseBuffer: AudioBuffer;
}

export interface FXInstance {
  input: AudioNode;
  output: AudioNode;
  setParameter(name: string, value: number): void;
  /** Restore neutral defaults (called when styles are switched). */
  reset(): void;
  dispose(): void;
}

export interface FXPlugin {
  id: string;
  name: string;
  create(context: FXContext): FXInstance;
}

// ---------------------------------------------------------------------------
// Engine level
// ---------------------------------------------------------------------------

export type EngineStatus = 'idle' | 'playing' | 'paused';

export interface EngineState {
  status: EngineStatus;
  styleId: string | null;
  seed: string;
  position: number;
  masterVolume: number;
}

export interface EngineConfig {
  sampleRate?: number;
  masterVolume?: number;
  seed?: number | string;
  style?: string;
  autoStart?: boolean;
  /** Scheduler look-ahead in seconds (audio clock). */
  lookAhead?: number;
  /** Scheduler wake-up interval in ms. */
  scheduleInterval?: number;
  /** How far ahead of the transport position events are generated (seconds). */
  generationHorizon?: number;
  /** Size of one generation chunk in seconds (30–60 per PRD). */
  generationChunk?: number;
  /** Test seam — avoids touching the real Web Audio API in unit tests. */
  audioContextFactory?: () => AudioContext;
}

/**
 * Machine-readable codes for the errors a *user* can act on. Core stays free of
 * UI wording: it emits a code plus parameters, and the UI (i18n) turns that into
 * a localized sentence. `message` remains as a developer-facing fallback.
 */
export type EngineErrorCode =
  | 'audioUnlockFailed'
  | 'audioResumeFailed'
  | 'audioInterrupted'
  | 'noStyle'
  | 'unknownStyle'
  | 'styleUnavailable'
  | 'styleFallback';

/** Raised for user-facing engine errors (missing deps, plugin failures...). */
export class EngineError extends Error {
  readonly code?: EngineErrorCode;
  readonly params?: Record<string, string>;

  constructor(message: string, code?: EngineErrorCode, params?: Record<string, string>) {
    super(message);
    this.name = 'EngineError';
    this.code = code;
    this.params = params;
  }
}
