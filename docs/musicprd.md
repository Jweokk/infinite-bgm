# Plugin-based Generative Music Engine — PRD

## 1. 项目概述

### 1.1 项目名称

**Plugin Music Engine**

一个运行在浏览器端的、实时程序化生成音乐引擎。

核心目标不是制作一个固定的 Lofi 或 Zen 音乐播放器，而是建立一个：

> **Core Music Engine + Style Plugin + Instrument Plugin + FX Plugin**

的可扩展音乐生成平台。

第一版本必须支持：

- `Lofi` 风格插件
- `Zen` 风格插件

未来可以在不修改 Core Engine 的情况下增加：

- Jazzhop
- Ambient
- Meditation
- Cinematic
- Nature
- Focus
- Sleep
- Retro
- Synthwave
- Game
- Horror
- 其他用户自定义风格

### 1.2 核心设计原则

必须遵循以下原则：

1. **Core 不知道具体音乐风格**
2. Lofi、Zen 都是 Plugin
3. Style Plugin 负责“如何生成音乐”
4. Instrument Plugin 负责“声音如何产生”
5. FX Plugin 负责“声音如何处理”
6. Scheduler 只负责“什么时候播放”
7. Event 是所有模块之间的统一接口
8. 所有随机性必须支持 Seed
9. 相同 Seed + 相同配置必须产生确定性的音乐事件序列
10. 音乐必须实时生成，不依赖预先生成的完整音频文件
11. 第一版本不依赖后端
12. 第一版本不使用 AI 音频生成模型
13. 新增风格时，原则上只新增 Plugin，不修改 Core
14. 允许未来增加外部环境输入，使音乐可以实时响应空间、人物、时间和传感器

---

# 2. 产品目标

## 2.1 MVP 目标

用户打开 Web App 后，可以：

- 选择 Lofi
- 选择 Zen
- 点击 Play
- 实时生成音乐
- 无限播放
- 调节风格参数
- 更换 Seed
- 更换音乐状态
- 调节空间/声音效果
- 不需要下载完整音频
- 不需要连接服务器

音乐由浏览器 Web Audio API 实时生成。

---

# 3. 产品定位

本项目不是传统 DAW，也不是传统音乐播放器。

它更接近：

```text
Generative Music Runtime
+
Style Plugin System
+
Procedural Synthesizer
+
Real-time Audio Scheduler
```

用户不是选择一首固定歌曲，而是选择：

```text
Style
   +
Mood
   +
Energy
   +
Seed
   +
Environment
```

Engine 根据这些参数持续生成音乐。

---

# 4. 总体架构

```text
                         ┌──────────────────────┐
                         │       Web UI         │
                         └──────────┬───────────┘
                                    │
                                    ▼
                         ┌──────────────────────┐
                         │    Music Engine      │
                         │       Core           │
                         └──────────┬───────────┘
                                    │
                  ┌─────────────────┼─────────────────┐
                  │                 │                 │
                  ▼                 ▼                 ▼
          ┌──────────────┐  ┌──────────────┐  ┌──────────────┐
          │ Style Plugin │  │ Instrument   │  │  FX Plugin   │
          │              │  │   Plugins    │  │              │
          └──────┬───────┘  └──────┬───────┘  └──────┬───────┘
                 │                 │                 │
                 ▼                 │                 │
          ┌──────────────┐         │                 │
          │ Event        │         │                 │
          │ Generator    │         │                 │
          └──────┬───────┘         │                 │
                 │                 │                 │
                 ▼                 ▼                 │
          ┌──────────────────────────────────┐       │
          │        Unified Event Bus          │       │
          └────────────────┬─────────────────┘       │
                           │                         │
                           ▼                         │
                    ┌──────────────┐                 │
                    │  Scheduler   │                 │
                    └──────┬───────┘                 │
                           │                         │
                           ▼                         │
                    ┌──────────────┐                 │
                    │ Synth /      │─────────────────┘
                    │ Instrument   │
                    └──────┬───────┘
                           │
                           ▼
                    ┌──────────────┐
                    │ Spatial / FX │
                    └──────┬───────┘
                           │
                           ▼
                    ┌──────────────┐
                    │ Master Bus   │
                    └──────┬───────┘
                           │
                           ▼
                    AudioContext
```

---

# 5. Core 与 Plugin 的边界

这是整个项目最重要的设计要求。

## 5.1 Core Engine 负责

Core 只负责：

- AudioContext 生命周期
- Plugin 注册
- Plugin 生命周期
- Seed 管理
- 全局配置
- Event Bus
- Scheduler
- Transport
- Instrument Registry
- FX Registry
- Master Bus
- 音量
- 状态管理
- 参数更新
- Plugin 切换
- 错误处理
- 性能监控

Core **不能包含**：

```text
if style === "lofi"
if style === "zen"
if style === "jazzhop"
```

不得在 Core 中写风格专用逻辑。

---

# 6. Plugin 系统

## 6.1 Plugin 类型

至少定义三类 Plugin：

```text
StylePlugin
InstrumentPlugin
FXPlugin
```

未来可以增加：

```text
EnvironmentPlugin
VisualizerPlugin
InputPlugin
PresetPlugin
```

---

# 7. Style Plugin

Style Plugin 决定：

> 音乐“怎么生成”。

例如：

```text
Lofi Plugin
Zen Plugin
Jazzhop Plugin
Ambient Plugin
```

Style Plugin 不直接操作 AudioNode。

它主要负责生成：

```text
MusicalEvent
```

---

# 8. Style Plugin 接口

建议定义：

```ts
interface StylePlugin {
  id: string;
  name: string;
  version: string;

  create(config: StyleConfig): StyleInstance;
}

interface StyleInstance {
  start(context: StyleContext): void;
  stop(): void;

  generateEvents(
    context: GenerationContext
  ): MusicalEvent[];

  onBar?(context: GenerationContext): MusicalEvent[];
  onSection?(context: GenerationContext): MusicalEvent[];

  setParameter(name: string, value: number): void;

  getParameters(): ParameterDefinition[];

  getPresetList(): Preset[];
}
```

对于 Zen 这种非 Beat 风格，不要求实现 `onBar()`。

因此 Plugin API 必须允许：

```text
Beat-based
Free-time
Breath-based
```

三种生成模式。

---

# 9. Time Model

Core 不应该假定所有音乐都有 BPM。

定义：

```ts
type TimeMode =
  | "beat"
  | "free"
  | "breath";
```

## 9.1 beat

适用于：

- Lofi
- Jazzhop
- Hip-hop
- EDM

时间由：

```text
BPM
Beat
Bar
Section
```

控制。

---

## 9.2 free

适用于：

- Zen
- Ambient
- Soundscape

事件不严格绑定 Beat。

例如：

```text
Bell at 13.2 sec
Drone at 22.5 sec
Texture at 31.7 sec
```

---

## 9.3 breath

用于更加自然的动态音乐。

例如：

```text
Density
Volume
Filter
Pan
Harmony
Texture
```

在几十秒到几分钟的时间尺度上缓慢变化。

---

# 10. Unified Musical Event

所有 Plugin 最终必须转换成统一 Event。

```ts
interface MusicalEvent {
  id: string;

  type: EventType;

  startTime: number;
  duration: number;

  instrument?: string;

  pitch?: number;
  velocity?: number;

  pan?: number;

  parameters?: Record<string, number | string | boolean>;

  metadata?: {
    sourcePlugin?: string;
    role?: string;
    section?: string;
  };
}
```

Event 类型：

```ts
type EventType =
  | "note"
  | "chord"
  | "drum"
  | "bass"
  | "drone"
  | "bell"
  | "texture"
  | "wind"
  | "water"
  | "harmonic"
  | "silence";
```

Core 不需要理解每种 Event 的音乐意义。

它只负责：

```text
Event
→ Scheduler
→ Instrument
→ Audio
```

---

# 11. Seed 系统

必须使用确定性随机数。

禁止直接大量使用：

```js
Math.random()
```

应使用：

```ts
SeededRandom
```

例如：

```ts
const rng = new SeededRandom(seed);
```

所有 Plugin 都必须通过自己的 RNG：

```ts
const rng = context.random;
```

产生随机结果。

---

# 12. Seed Determinism

必须保证：

```text
Seed A
+
Config A
+
Plugin Version A
=
相同 Event Sequence
```

例如：

```text
seed = 12345
style = lofi
bpm = 78
energy = 0.5
```

重新播放时应该得到一致的音乐结构。

不同 Seed：

```text
12345
12346
12347
```

应该产生不同音乐。

---

# 13. Plugin Seed Isolation

为了避免一个 Plugin 的随机调用影响其他 Plugin：

```text
Master Seed
      │
      ├── Harmony RNG
      ├── Melody RNG
      ├── Drum RNG
      ├── Texture RNG
      └── Arrangement RNG
```

建议：

```ts
rng.fork("harmony")
rng.fork("melody")
rng.fork("drums")
```

这样增加一个随机算法不会导致整个音乐结果不可预测地变化。

---

# 14. Lofi Plugin

## 14.1 定位

Lofi Plugin 是第一种 Beat-based Style Plugin。

目标：

```text
Lofi
Jazzhop
Chillhop
```

第一版重点实现 Lofi。

---

# 15. Lofi 参数

```ts
interface LofiParameters {
  bpm: number;
  key: string;
  scale: string;

  mood: number;
  energy: number;

  harmonyDensity: number;
  melodyDensity: number;
  drumDensity: number;

  swing: number;

  humanization: number;

  reverb: number;
  tape: number;
  vinyl: number;
}
```

默认：

```text
BPM: 78
Swing: 0.58
Energy: 0.45
```

---

# 16. Lofi Harmony Generator

必须支持：

- Major
- Minor
- Dorian
- Mixolydian

Chord 类型至少：

```text
maj7
m7
m9
maj9
7
sus2
sus4
6
```

生成：

```text
ChordProgression
```

例如：

```text
ii7 → V7 → Imaj7
```

但不能固定重复同一组 progression。

通过：

```text
Seed
+
Mood
+
Energy
```

选择不同 progression。

---

# 17. Lofi Voicing

支持：

- Inversion
- Rootless voicing
- Octave displacement
- Voice leading

目标：

避免：

```text
每个 Chord 都从根音重新排列
```

而应该让：

```text
上一和弦
     ↓
尽量小距离
     ↓
下一和弦
```

---

# 18. Lofi Melody Generator

Melody 必须使用：

```text
Motif
+
Scale
+
Chord tones
+
Passing tones
+
Rest
```

而不是完全随机音符。

支持：

```text
Motif A
Motif A'
Motif B
Motif A''
```

允许：

- transpose
- rhythm variation
- octave variation
- note omission
- ending variation

---

# 19. Lofi Bass Generator

Bass 基于：

```text
Root
Third
Fifth
Octave
Passing note
```

并根据：

```text
Energy
```

控制密度。

---

# 20. Lofi Drum Generator

至少支持：

```text
Kick
Snare
Closed Hat
Open Hat
```

第一版准备至少 4 套 Pattern。

通过：

```text
Seed
+
Energy
+
Drum Density
```

组合 Pattern。

---

# 21. Lofi Humanization

允许：

```text
Timing ±15ms
Velocity ±10%
Pan ±0.1
```

Humanization 必须由 Seed 控制。

---

# 22. Lofi Arrangement

第一版支持：

```text
Intro
A
A'
B
A
Outro
```

每个 Section：

```text
8–32 bars
```

不同 Section 调整：

```text
Melody density
Drum density
Bass density
Chord voicing
FX
```

避免无限循环听起来完全一样。

---

# 23. Zen Plugin

Zen 不应该被实现为：

```text
Lofi + BPM = 30
```

Zen 必须使用不同的音乐生成模型。

---

# 24. Zen 的核心特征

Zen Plugin 默认：

```text
TimeMode = free
```

特点：

- 大量留白
- 极少事件
- 长声音
- 缓慢变化
- Drone
- Bell
- Singing Bowl
- Soft Pluck
- Breath
- Texture
- 长混响
- 空间移动
- 非严格节奏
- 非传统 Chord Progression

---

# 25. Zen 参数

```ts
interface ZenParameters {
  stillness: number;
  presence: number;

  warmth: number;
  space: number;

  nature: number;

  harmonicDensity: number;
  melodicDensity: number;
  textureDensity: number;

  breath: number;

  eventDuration: number;
  silenceDensity: number;

  reverbDecay: number;
  shimmer: number;

  stereoMovement: number;
}
```

UI 不应该只显示技术参数。

可以显示：

```text
Stillness
Presence
Warmth
Space
Nature
Breath
```

高级模式再显示技术参数。

---

# 26. Zen Harmony

Zen 不使用传统的：

```text
I → V → vi → IV
```

作为核心结构。

优先使用：

```text
Drone
+
Open Fifth
+
Octave
+
Sus2
+
Sus4
+
Add9
+
Slow harmonic change
```

例如：

```text
D drone
+
A
+
E
```

持续几十秒。

然后缓慢进入：

```text
G
+
D
+
A
```

---

# 27. Zen Event Generator

Zen 主要生成：

```text
BellEvent
DroneEvent
HarmonicEvent
TextureEvent
SilenceEvent
```

示例：

```text
0s       Drone
8.7s     Bell
21.3s    Harmonic
37.8s    Bell
55.2s    Texture
71.5s    Bell
```

事件之间可以有几十秒的空白。

---

# 28. Zen Silence Generator

Silence 必须是一级音乐元素。

不能简单理解成：

```text
没有 Event
```

需要显式控制：

```ts
silenceDensity
minSilence
maxSilence
```

例如：

```text
Bell
↓
8–25 sec silence
↓
Bell
↓
15–40 sec silence
```

---

# 29. Zen Bell / Singing Bowl

第一版不依赖音频 Sample。

使用 Web Audio 合成。

Singing Bowl 可以使用多个谐波：

```text
f
2.01f
2.71f
4.13f
5.73f
```

每个 Oscillator：

```text
Attack: 0.01–0.3 sec
Release: 5–20 sec
```

并加入：

```text
slight detune
slow amplitude modulation
long reverb
```

---

# 30. Zen Drone

Drone 是 Zen 的重要基础层。

支持：

```text
Sine
Triangle
Soft Saw
Noise
```

并允许：

```text
slow filter movement
slow volume movement
slow detune
slow stereo movement
```

LFO 周期：

```text
20 sec
~
180 sec
```

---

# 31. Breath Engine

Zen 必须拥有一个独立的 Breath Engine。

Breath 可以同时影响：

```text
Volume
Filter
Stereo
Texture
Event Density
Harmonic Brightness
```

例如：

```text
Breath cycle = 60 sec
```

则：

```text
0–30 sec
逐渐增强

30–60 sec
逐渐减弱
```

但不能形成明显机械循环。

应叠加不同周期：

```text
43 sec
71 sec
109 sec
```

形成自然变化。

---

# 32. Zen Texture Engine

Texture 不是普通音乐音符。

支持：

```text
Air
Wind
Rain-like noise
Water
Room tone
Soft noise
Vinyl-like texture
```

第一版可以完全使用程序化 Noise。

例如：

```text
White Noise
Pink Noise
Filtered Noise
Brown Noise
```

再通过：

```text
Bandpass
Lowpass
Envelope
Reverb
Stereo movement
```

生成环境声音。

---

# 33. Spatial Engine

对于 Zen：

> Space 本身就是音乐的一部分。

因此 Spatial Engine 必须是 Core 的正式模块，而不是简单的 Reverb Effect。

至少支持：

```text
Stereo Width
Pan
Pre-delay
Early Reflection
Reverb
Diffusion
Shimmer
Distance
```

---

# 34. Shimmer Reverb

第一版可以实现：

```text
Input
 ↓
Reverb
 ↓
Pitch Shift +12
 ↓
Feedback
 ↓
Reverb
```

形成：

```text
Bell
→
高频空气
→
空间尾音
```

第一版如果浏览器能力限制较大，可以先使用简化版本。

---

# 35. Instrument Plugin

Instrument Plugin 负责：

> 如何把 Event 转成 AudioNode。

例如：

```text
ElectricPiano
Bass
Kick
Snare
Hat
Bell
SingingBowl
Drone
Pluck
NoiseTexture
Wind
Water
```

---

# 36. Instrument Plugin API

```ts
interface InstrumentPlugin {
  id: string;
  name: string;

  create(context: InstrumentContext): InstrumentInstance;
}

interface InstrumentInstance {
  trigger(
    event: MusicalEvent,
    audioContextTime: number
  ): void;

  stop(): void;

  setParameter(
    name: string,
    value: number
  ): void;
}
```

---

# 37. FX Plugin

FX Plugin 负责：

```text
AudioNode → AudioNode
```

例如：

```text
Compressor
Limiter
EQ
Saturation
Tape
Delay
Reverb
Shimmer
Chorus
Stereo
Vinyl
```

接口：

```ts
interface FXPlugin {
  id: string;
  name: string;

  create(
    context: FXContext
  ): FXInstance;
}
```

---

# 38. Scheduler

Scheduler 必须使用 Web Audio 的高精度时间系统。

禁止：

```js
setInterval(() => playNote(), 100);
```

作为实际音频调度机制。

应该采用：

```text
Look-ahead Scheduler
```

例如：

```text
Current Audio Time
       ↓
+ 100ms
       ↓
Schedule Events
```

---

# 39. Scheduler 工作方式

```text
Style Plugin
      ↓
Generate Events
      ↓
Event Queue
      ↓
Scheduler
      ↓
AudioContext.currentTime
      ↓
Instrument.trigger()
```

Scheduler 不理解：

```text
Lofi
Zen
Jazz
```

它只理解：

```text
Event.startTime
Event.duration
Event.instrument
```

---

# 40. Infinite Generation

音乐不能一次性生成几个小时。

采用：

```text
Generate Ahead
+
Schedule
+
Continue Generate
```

例如：

```text
Current
   ↓
0–30 sec scheduled
   ↓
生成 30–60 sec
   ↓
生成 60–90 sec
   ↓
继续
```

建议：

```text
generation horizon = 30–60 sec
```

---

# 41. Next Track / New Seed

用户点击：

```text
Next
```

不能立即：

```text
stop()
start()
```

否则容易产生：

```text
click
silence
abrupt cutoff
```

正确方式：

```text
Current Section
      ↓
finish current phrase
      ↓
fade / transition
      ↓
new seed
      ↓
new Style instance
      ↓
continue
```

---

# 42. Plugin Lifecycle

Plugin 必须支持：

```text
register
initialize
start
pause
resume
stop
dispose
```

切换风格：

```text
Lofi
 ↓
fade out
 ↓
dispose Lofi
 ↓
load Zen
 ↓
initialize Zen
 ↓
fade in
```

不能刷新页面。

---

# 43. Plugin Registry

Core 提供：

```ts
PluginRegistry
```

使用：

```ts
registry.registerStyle(lofiPlugin);
registry.registerStyle(zenPlugin);
```

未来：

```ts
registry.registerStyle(jazzhopPlugin);
registry.registerStyle(ambientPlugin);
```

Core 无需修改。

---

# 44. 推荐目录结构

```text
music-engine/
│
├── src/
│   │
│   ├── core/
│   │   ├── MusicEngine.ts
│   │   ├── PluginRegistry.ts
│   │   ├── EventBus.ts
│   │   ├── EventQueue.ts
│   │   ├── Scheduler.ts
│   │   ├── Transport.ts
│   │   ├── SeededRandom.ts
│   │   ├── ParameterManager.ts
│   │   ├── StateManager.ts
│   │   └── types.ts
│   │
│   ├── time/
│   │   ├── BeatTimeModel.ts
│   │   ├── FreeTimeModel.ts
│   │   └── BreathTimeModel.ts
│   │
│   ├── styles/
│   │   ├── lofi/
│   │   │   ├── index.ts
│   │   │   ├── LofiPlugin.ts
│   │   │   ├── HarmonyGenerator.ts
│   │   │   ├── VoicingGenerator.ts
│   │   │   ├── MelodyGenerator.ts
│   │   │   ├── BassGenerator.ts
│   │   │   ├── DrumGenerator.ts
│   │   │   ├── Arrangement.ts
│   │   │   └── presets.ts
│   │   │
│   │   └── zen/
│   │       ├── index.ts
│   │       ├── ZenPlugin.ts
│   │       ├── DroneGenerator.ts
│   │       ├── BellGenerator.ts
│   │       ├── HarmonicGenerator.ts
│   │       ├── SilenceGenerator.ts
│   │       ├── TextureGenerator.ts
│   │       ├── BreathEngine.ts
│   │       └── presets.ts
│   │
│   ├── instruments/
│   │   ├── InstrumentRegistry.ts
│   │   ├── ElectricPiano.ts
│   │   ├── BassSynth.ts
│   │   ├── KickSynth.ts
│   │   ├── SnareSynth.ts
│   │   ├── HatSynth.ts
│   │   ├── BellSynth.ts
│   │   ├── BowlSynth.ts
│   │   ├── DroneSynth.ts
│   │   ├── PluckSynth.ts
│   │   └── NoiseTextureSynth.ts
│   │
│   ├── fx/
│   │   ├── FXRegistry.ts
│   │   ├── EQ.ts
│   │   ├── Compressor.ts
│   │   ├── Limiter.ts
│   │   ├── Saturation.ts
│   │   ├── Tape.ts
│   │   ├── Delay.ts
│   │   ├── Reverb.ts
│   │   ├── Shimmer.ts
│   │   └── Stereo.ts
│   │
│   ├── spatial/
│   │   ├── SpatialEngine.ts
│   │   ├── StereoMovement.ts
│   │   └── DistanceModel.ts
│   │
│   └── ui/
│       ├── App.ts
│       ├── StyleSelector.ts
│       ├── TransportControls.ts
│       ├── ParameterPanel.ts
│       ├── Visualizer.ts
│       └── PresetSelector.ts
│
├── tests/
│   ├── core/
│   ├── lofi/
│   ├── zen/
│   ├── instruments/
│   └── fx/
│
├── public/
│
├── package.json
├── tsconfig.json
└── README.md
```

---

# 45. Core API

最终对外提供：

```ts
class MusicEngine {
  constructor(config: EngineConfig);

  registerStyle(plugin: StylePlugin): void;
  registerInstrument(plugin: InstrumentPlugin): void;
  registerFX(plugin: FXPlugin): void;

  useStyle(styleId: string): void;

  start(): Promise<void>;
  pause(): void;
  resume(): void;
  stop(): void;

  next(): void;

  setSeed(seed: number | string): void;

  setParameter(
    name: string,
    value: number | string | boolean
  ): void;

  getState(): EngineState;

  getAvailableStyles(): StyleInfo[];
}
```

---

# 46. Engine Config

```ts
interface EngineConfig {
  sampleRate?: number;

  masterVolume?: number;

  seed?: number | string;

  style?: string;

  autoStart?: boolean;

  lookAhead?: number;

  scheduleInterval?: number;
}
```

---

# 47. Style Metadata

每个 Plugin 必须提供 Metadata：

```ts
interface StyleInfo {
  id: string;
  name: string;
  version: string;

  description: string;

  timeMode: TimeMode;

  parameters: ParameterDefinition[];

  presets: Preset[];
}
```

例如 Lofi：

```json
{
  "id": "lofi",
  "name": "Lofi",
  "timeMode": "beat"
}
```

Zen：

```json
{
  "id": "zen",
  "name": "Zen",
  "timeMode": "free"
}
```

---

# 48. Preset 系统

Plugin 不应该把默认参数硬编码到 UI。

Plugin 自己提供：

```ts
interface Preset {
  id: string;
  name: string;

  parameters: Record<string, number | string | boolean>;
}
```

例如：

Lofi：

```text
Late Night
Rainy Cafe
Study
Midnight
Warm Tape
```

Zen：

```text
Deep Stillness
Morning Zen
Temple
Forest
Water
Night Meditation
```

---

# 49. UI

第一版 UI 不需要复杂。

布局：

```text
┌──────────────────────────────────────┐
│          Plugin Music Engine         │
├──────────────────────────────────────┤
│                                      │
│   [ Lofi ]       [ Zen ]             │
│                                      │
│          ▶ PLAY                      │
│                                      │
│   Preset: [ Late Night ▼ ]           │
│                                      │
│   ──────────────────────────────     │
│                                      │
│   Style Parameters                   │
│                                      │
│   Energy       ───────●──            │
│   Space        ─────●────            │
│   Warmth       ──────●───            │
│                                      │
│   Seed: 829173                       │
│                                      │
│   [ New Seed ]     [ Next ]          │
│                                      │
└──────────────────────────────────────┘
```

---

# 50. UI 动态参数

UI 必须根据当前 Plugin 动态生成。

例如：

Lofi：

```text
BPM
Energy
Swing
Harmony
Melody
Drums
Tape
Vinyl
Reverb
```

Zen：

```text
Stillness
Presence
Warmth
Space
Nature
Breath
Shimmer
```

Core UI 不允许：

```js
if (style === "lofi") ...
if (style === "zen") ...
```

应该：

```ts
plugin.getParameters()
```

自动生成 UI。

---

# 51. Visualizer

第一版可以使用 Canvas。

Visualizer 不读取具体 Style。

只读取：

```text
AudioAnalyser
+
Engine State
+
Event Bus
```

可以表现：

```text
Waveform
Spectrum
Particles
Pulse
Space
```

未来可以开发：

```text
VisualizerPlugin
```

---

# 52. Environment API

虽然第一版不实现真实环境输入，但 Core 必须预留接口。

未来可以输入：

```text
Time
Weather
Location
Temperature
Audience Count
Audience Movement
Microphone
Camera
Light
Sensor
```

定义：

```ts
interface EnvironmentState {
  timeOfDay?: number;
  temperature?: number;
  weather?: string;

  audienceCount?: number;
  movement?: number;

  lightLevel?: number;
}
```

Style Plugin 可以选择是否响应。

例如 Zen：

```text
audience movement
      ↓
Breath
      ↓
Texture
      ↓
Spatial Movement
```

---

# 53. Environment Plugin

未来增加：

```ts
interface EnvironmentPlugin {
  id: string;

  start(): void;
  stop(): void;

  getState(): EnvironmentState;

  subscribe(
    callback: (state: EnvironmentState) => void
  ): void;
}
```

例如：

```text
WebcamPlugin
MicrophonePlugin
WeatherPlugin
TimePlugin
SensorPlugin
```

---

# 54. Performance Requirements

目标设备：

```text
Desktop Chrome
Desktop Safari
Desktop Edge
Mobile Safari
Mobile Chrome
```

第一版重点：

```text
Mac
Windows
iPhone
Android
```

---

# 55. CPU 控制

避免：

```text
每个 Event 创建大量永久 AudioNode
```

需要：

- AudioNode 生命周期管理
- Voice Pool
- 自动释放
- Event queue 清理
- FX Node 复用
- 避免高频 JS callback

---

# 56. 音频质量

必须：

- 无明显 click
- 无爆音
- 无突然静音
- 无明显 scheduler jitter
- Pause/Resume 正常
- Style transition 无明显断裂

Master Chain：

```text
Style Bus
    ↓
Instrument Bus
    ↓
EQ
    ↓
Saturation
    ↓
Tape
    ↓
Spatial
    ↓
Reverb
    ↓
Compressor
    ↓
Limiter
    ↓
Master
```

具体 FX 可以由 Plugin/配置决定。

---

# 57. Audio Context 生命周期

浏览器通常要求用户操作后才能启动 AudioContext。

因此：

```text
用户点击 Play
        ↓
AudioContext.resume()
        ↓
Engine.start()
```

不能依赖页面加载自动播放。

---

# 58. 错误处理

Plugin 如果生成失败：

```text
Plugin Error
     ↓
Core 捕获
     ↓
记录 Error
     ↓
继续 Audio Engine
```

不能导致整个应用崩溃。

如果某个 Instrument 不存在：

```text
Fallback Instrument
```

或者跳过该 Event。

---

# 59. 测试要求

## 59.1 Core

测试：

- Plugin register
- Plugin unregister
- Style switching
- Seed
- Scheduler
- Event queue
- Pause
- Resume
- Stop

---

## 59.2 Seed

必须测试：

```text
same seed → same events
different seed → different events
```

---

## 59.3 Lofi

测试：

- BPM
- Scale
- Chord progression
- Voice leading
- Melody
- Bass
- Drum
- Swing
- Humanization

---

## 59.4 Zen

测试：

- Free-time events
- Silence
- Drone
- Bell
- Texture
- Breath
- Spatial movement
- Long duration events

---

# 60. Plugin Isolation Test

必须确保：

```text
新增 Zen Plugin
```

不会改变：

```text
Lofi Plugin
```

在相同：

```text
Seed
Config
Plugin Version
```

下生成的 Event。

---

# 61. Acceptance Criteria

## Core

- [ ] 可以注册 Style Plugin
- [ ] 可以切换 Style Plugin
- [ ] Core 不包含 Lofi/Zen 专用判断
- [ ] 支持 Beat / Free / Breath Time Model
- [ ] 支持 Seed
- [ ] 支持 Event Queue
- [ ] 支持 Look-ahead Scheduler
- [ ] 支持动态参数
- [ ] 支持 Plugin 生命周期

## Lofi

- [ ] 可以生成持续 Lofi 音乐
- [ ] 支持 BPM
- [ ] 支持 Harmony
- [ ] 支持 Melody
- [ ] 支持 Bass
- [ ] 支持 Drum
- [ ] 支持 Swing
- [ ] 支持 Humanization
- [ ] 支持 Arrangement
- [ ] 相同 Seed 可复现

## Zen

- [ ] 不依赖 BPM 生成
- [ ] 支持长 Drone
- [ ] 支持 Bell
- [ ] 支持 Singing Bowl
- [ ] 支持长 Silence
- [ ] 支持 Texture
- [ ] 支持 Breath
- [ ] 支持 Stereo Movement
- [ ] 支持长 Reverb
- [ ] 相同 Seed 可复现

## UI

- [ ] 可以选择 Lofi
- [ ] 可以选择 Zen
- [ ] UI 参数随 Plugin 自动变化
- [ ] 可以 Play/Pause
- [ ] 可以 Next
- [ ] 可以生成 New Seed
- [ ] 可以选择 Preset

---

# 62. 不允许的架构

以下方式禁止：

```ts
if (style === "lofi") {
   ...
}

if (style === "zen") {
   ...
}
```

在 Core 中加入越来越多：

```text
Lofi Logic
Zen Logic
Jazz Logic
Ambient Logic
```

也是禁止的。

禁止形成：

```text
God MusicEngine
```

即一个几千行文件包含所有音乐风格。

---

# 63. 推荐的扩展方式

新增 Jazzhop：

```text
src/styles/jazzhop/
```

实现：

```text
JazzhopPlugin
HarmonyGenerator
MelodyGenerator
DrumGenerator
Arrangement
Preset
```

然后：

```ts
registry.registerStyle(jazzhopPlugin);
```

Core 不修改。

---

# 64. Plugin Package 化

第二阶段可以进一步变成真正的独立 Plugin Package。

例如：

```text
@music-engine/core
@music-engine/plugin-lofi
@music-engine/plugin-zen
@music-engine/plugin-jazzhop
@music-engine/instrument-synth
@music-engine/fx-reverb
```

最终：

```text
Music Engine Core
        │
        ├── Lofi Plugin
        ├── Zen Plugin
        ├── Jazzhop Plugin
        ├── Ambient Plugin
        └── Cinematic Plugin
```

---

# 65. 第三方 Plugin

未来允许第三方开发：

```ts
const myPlugin: StylePlugin = {
  id: "my-style",
  name: "My Style",
  version: "1.0.0",

  create(config) {
    ...
  }
};
```

然后：

```ts
engine.registerStyle(myPlugin);
```

---

# 66. Plugin Manifest

未来 Plugin 可以使用 Manifest：

```json
{
  "id": "zen",
  "name": "Zen",
  "version": "1.0.0",
  "engineVersion": ">=1.0.0",
  "type": "style",
  "timeMode": "free",
  "instruments": [
    "bell",
    "bowl",
    "drone",
    "noise-texture"
  ]
}
```

这样未来可以做 Plugin Marketplace。

第一版本不实现 Marketplace。

---

# 67. 开发阶段

## Phase 1 — Core

实现：

```text
AudioContext
PluginRegistry
Event
EventBus
SeededRandom
Scheduler
Transport
MasterBus
```

先不实现复杂 UI。

---

## Phase 2 — Instrument

实现：

```text
Electric Piano
Bass
Kick
Snare
Hat
Bell
Bowl
Drone
Noise Texture
```

---

## Phase 3 — Lofi Plugin

实现：

```text
Harmony
Voicing
Melody
Bass
Drums
Arrangement
Humanization
```

---

## Phase 4 — Zen Plugin

实现：

```text
FreeTime
Drone
Bell
Bowl
Silence
Texture
Breath
Spatial
```

---

## Phase 5 — FX

实现：

```text
EQ
Saturation
Tape
Delay
Reverb
Compressor
Limiter
Stereo
Shimmer
```

---

## Phase 6 — UI

实现：

```text
Style Selector
Preset
Dynamic Parameters
Seed
Transport
Visualizer
```

---

## Phase 7 — Plugin Hardening

重点测试：

```text
Plugin isolation
Memory leaks
Audio glitches
Long-running playback
Mobile browser
Style transition
Seed reproducibility
```

---

# 68. 开发优先级

必须按照：

```text
P0
Core Engine
Event System
Scheduler
Seed
Plugin API

P1
Instrument System
Lofi Plugin
Zen Plugin

P2
FX
Spatial
UI

P3
Visualizer
Environment API

P4
External Plugin System
Plugin Package
Marketplace
```

---

# 69. AI Coding Agent 开发要求

本 PRD 可以直接交给 Claude Code / OpenCode / Cursor 等 AI Coding Agent。

开发 Agent 必须遵循：

### 规则 1

先建立：

```text
Core
Plugin API
Event Model
```

再开发 Lofi / Zen。

### 规则 2

不要为了快速完成 Lofi 而把 Lofi 逻辑写进 Core。

### 规则 3

不要为了快速完成 Zen 而加入：

```text
if zen
```

到 Scheduler 或 Core。

### 规则 4

所有 Style-specific code 必须位于：

```text
src/styles/<style>/
```

### 规则 5

所有 Instrument-specific code 位于：

```text
src/instruments/
```

### 规则 6

所有 FX-specific code 位于：

```text
src/fx/
```

### 规则 7

所有跨风格能力位于：

```text
src/core/
src/time/
src/spatial/
```

### 规则 8

先写测试，再实现复杂 Generator。

---

# 70. 第一版完成标准

当以下代码可以运行：

```ts
const engine = new MusicEngine();

engine.registerStyle(lofiPlugin);
engine.registerStyle(zenPlugin);

engine.useStyle("lofi");

await engine.start();
```

然后：

```ts
engine.useStyle("zen");
```

能够无刷新切换到 Zen。

再执行：

```ts
engine.setSeed(12345);
```

可以产生确定性的音乐。

最终：

```text
Core
 ├── Lofi Plugin
 └── Zen Plugin
```

形成稳定的插件架构。

---

# 71. 最终目标架构

最终整个系统应演化为：

```text
                         ┌─────────────────────┐
                         │     Application     │
                         └──────────┬──────────┘
                                    │
                                    ▼
                         ┌─────────────────────┐
                         │   Music Engine Core │
                         └──────────┬──────────┘
                                    │
             ┌──────────────────────┼──────────────────────┐
             │                      │                      │
             ▼                      ▼                      ▼
      ┌────────────┐        ┌────────────┐        ┌────────────┐
      │   Styles   │        │ Instruments│        │    FX      │
      └─────┬──────┘        └─────┬──────┘        └─────┬──────┘
            │                     │                     │
      ┌─────┼─────┐               │                     │
      │     │     │               │                     │
     Lofi  Zen  ...               │                     │
      │     │                     │                     │
      └─────┼─────────────────────┼─────────────────────┘
            │                     │
            ▼                     ▼
      ┌──────────────────────────────────┐
      │         Unified Event System     │
      └────────────────┬─────────────────┘
                       │
                       ▼
                ┌─────────────┐
                │  Scheduler  │
                └──────┬──────┘
                       │
                       ▼
                ┌─────────────┐
                │ Audio Graph │
                └──────┬──────┘
                       │
                       ▼
                ┌─────────────┐
                │ Spatial/FX  │
                └──────┬──────┘
                       │
                       ▼
                  AudioContext
```

未来再增加：

```text
Environment
      ↓
Music Director
      ↓
Style Plugin
```

即可进一步实现：

```text
人进入房间
      ↓
音乐开始
      ↓
人走动
      ↓
音乐空间发生变化
      ↓
人群增加
      ↓
音乐密度增加
      ↓
环境变暗
      ↓
音乐变得更加安静
```

这也是本项目区别于普通“随机音乐生成器”的长期架构方向。

---

# 72. 重要技术决策总结

| 模块 | 第一版方案 |
|---|---|
| Runtime | Browser |
| Language | TypeScript |
| Audio | Web Audio API |
| Backend | 无 |
| AI Audio Model | 无 |
| Music | Procedural / Generative |
| Random | Seeded RNG |
| Architecture | Plugin |
| Style | Lofi + Zen |
| Time | Beat + Free + Breath |
| Event | Unified MusicalEvent |
| Scheduler | Look-ahead |
| Synth | Web Audio |
| FX | Web Audio |
| Spatial | Stereo + Reverb |
| UI | Web |
| Visualization | Canvas |
| Storage | LocalStorage 可选 |
| Network | MVP 不需要 |
| Audio Asset | MVP 尽量不依赖 |

---

# 73. 最终验收问题

开发完成后必须逐项回答：

1. 新增一个 Style 是否可以只新增一个 Plugin？
2. Core 是否完全不知道 Lofi 和 Zen 的具体生成算法？
3. Zen 是否可以不使用 BPM？
4. Lofi 是否可以使用 Beat Scheduler？
5. 两种 Style 是否都可以输出统一 MusicalEvent？
6. 相同 Seed 是否产生相同 Event Sequence？
7. 是否可以运行 1 小时而不持续增加内存？
8. 是否可以在 Lofi 和 Zen 之间无刷新切换？
9. UI 是否完全由 Plugin 参数驱动？
10. 新增 Jazzhop 是否无需修改 Core？
11. 新增 Ambient 是否无需修改 Core？
12. Instrument 是否可以被多个 Style 复用？
13. FX 是否可以被多个 Style 复用？
14. Environment 是否可以在未来接入而不修改 Style Plugin API？

如果其中任何一个答案是否定的，应优先重新审查架构，而不是继续堆功能。

---

# 74. 第一阶段开发任务

AI Coding Agent 开始开发时，第一阶段**只允许完成以下内容**：

```text
1. 初始化 TypeScript 项目
2. 建立 Core
3. 建立 Plugin API
4. 建立 MusicalEvent
5. 建立 SeededRandom
6. 建立 PluginRegistry
7. 建立 EventQueue
8. 建立 Scheduler
9. 建立 AudioContext 管理
10. 建立 Instrument Registry
11. 建立 FX Registry
12. 建立最小 UI
13. 建立一个最简单的 Test Style Plugin
```

确认：

```text
Plugin → Event → Scheduler → Instrument → Audio
```

完整链路稳定后，再开始开发 Lofi。

Lofi 完成并测试后，再开发 Zen。

**禁止一开始同时开发大量 Lofi、Zen、UI、FX，导致 Core 架构无法稳定。**

---

# 75. Style Plugin 开发规范

本章节是本项目非常重要的开发规范。

目标是确保任何开发者或 AI Coding Agent 都可以按照统一方式新增一个 Style Plugin，而无需修改 Core。

例如：

```text
新增 Meditation
新增 Ambient
新增 Sleep
新增 Nature
新增 Cinematic
```

都必须遵循同一套流程。

---

# 76. 新增 Style Plugin 的基本原则

新增 Style 的完整流程必须是：

```text
定义 Style
    ↓
创建 Plugin
    ↓
实现 StylePlugin Interface
    ↓
定义 Parameters
    ↓
实现 Event Generators
    ↓
选择/复用 Instruments
    ↓
选择/复用 FX
    ↓
定义 Presets
    ↓
注册 Plugin
    ↓
运行测试
```

新增 Style 不允许：

```text
修改 MusicEngine Core
修改 Scheduler
修改 Event Model
修改已有 Style
```

除非发现 Core API 本身存在通用能力缺失。

如果确实需要 Core 新能力，应优先：

```text
扩展通用 API
```

而不是：

```text
加入 Meditation 专用 API
```

---

# 77. 新增 Meditation Plugin 示例

假设现在要新增：

```text
Meditation
```

目标：

> 生成适合冥想、呼吸、放松场景的缓慢、稀疏、低刺激程序化音乐。

它应该作为一个独立 Style Plugin。

---

# 78. Meditation Plugin 目录

第一阶段内置插件：

```text
src/styles/meditation/
│
├── index.ts
├── MeditationPlugin.ts
├── MeditationStyle.ts
│
├── HarmonyGenerator.ts
├── DroneGenerator.ts
├── BellGenerator.ts
├── BreathGenerator.ts
├── SilenceGenerator.ts
├── TextureGenerator.ts
│
├── Arrangement.ts
│
├── presets.ts
├── parameters.ts
└── README.md
```

其中：

```text
index.ts
```

负责导出 Plugin。

```text
MeditationPlugin.ts
```

负责实现 Plugin Interface。

```text
MeditationStyle.ts
```

负责创建具体 Style Instance。

其余文件负责具体音乐生成逻辑。

---

# 79. Meditation Plugin 不允许修改 Core

以下目录不应该因为增加 Meditation 而修改：

```text
src/core/
src/time/
src/instruments/
src/fx/
```

例如 Meditation 需要 Bell：

```text
不要创建：
src/core/MeditationBell.ts
```

应该复用：

```text
src/instruments/BellSynth.ts
```

如果 BellSynth 本身能力不足，应增强通用：

```text
BellSynth
```

而不是创建：

```text
MeditationBellSynth
```

---

# 80. Meditation Plugin Metadata

Plugin 必须提供完整 Metadata。

例如：

```ts
const meditationPlugin: StylePlugin = {
  id: "meditation",
  name: "Meditation",
  version: "1.0.0",

  create(config) {
    return new MeditationStyle(config);
  }
};
```

推荐进一步提供：

```ts
interface StyleMetadata {
  id: string;
  name: string;
  version: string;

  description: string;

  author?: string;

  timeMode: TimeMode;

  tags: string[];

  parameters: ParameterDefinition[];

  presets: Preset[];

  requiredInstruments: string[];

  optionalInstruments?: string[];

  requiredFX?: string[];

  engineVersion: string;
}
```

---

# 81. Meditation Manifest

每一个 Style Plugin 都应该可以描述成一个 Manifest。

例如：

```json
{
  "id": "meditation",
  "name": "Meditation",
  "version": "1.0.0",
  "type": "style",

  "engineVersion": ">=1.0.0",

  "timeMode": "breath",

  "tags": [
    "meditation",
    "relaxation",
    "mindfulness"
  ],

  "instruments": [
    "drone",
    "bell",
    "bowl",
    "texture"
  ],

  "fx": [
    "reverb",
    "stereo",
    "shimmer"
  ]
}
```

Manifest 的作用是：

```text
Plugin Discovery
Plugin Validation
Dependency Checking
Version Compatibility
UI Metadata
```

---

# 82. Meditation Parameters

Meditation 不应该直接复制 Zen 参数。

它应该定义自己的参数。

例如：

```ts
interface MeditationParameters {
  stillness: number;
  breathRate: number;

  warmth: number;
  presence: number;

  harmonicDensity: number;
  melodicDensity: number;

  bellDensity: number;
  droneDensity: number;
  textureDensity: number;

  space: number;
  reverb: number;
  shimmer: number;

  transitionSpeed: number;
}
```

参数由 Plugin 自己定义。

Core 不需要知道：

```text
stillness
breathRate
bellDensity
```

这些参数的具体含义。

---

# 83. Parameter Definition

Plugin 参数应该通过统一 Schema 暴露给 UI。

例如：

```ts
const parameters: ParameterDefinition[] = [
  {
    id: "stillness",
    name: "Stillness",
    type: "number",
    min: 0,
    max: 1,
    default: 0.8
  },

  {
    id: "space",
    name: "Space",
    type: "number",
    min: 0,
    max: 1,
    default: 0.8
  }
];
```

UI 自动根据这个 Schema 创建 Slider。

因此 Core/UI 不需要：

```ts
if (style === "meditation")
```

---

# 84. Parameter 类型

至少支持：

```ts
type ParameterType =
  | "number"
  | "boolean"
  | "select"
  | "range";
```

未来可以增加：

```text
color
curve
envelope
frequency
duration
```

---

# 85. Preset

每个 Plugin 可以提供自己的 Preset。

Meditation 示例：

```ts
const presets = [
  {
    id: "deep-stillness",
    name: "Deep Stillness",

    parameters: {
      stillness: 0.95,
      breathRate: 0.2,
      warmth: 0.7,
      presence: 0.15,
      bellDensity: 0.08,
      droneDensity: 0.7,
      textureDensity: 0.2,
      space: 0.95,
      reverb: 0.9,
      shimmer: 0.2
    }
  },

  {
    id: "morning-meditation",
    name: "Morning Meditation",

    parameters: {
      stillness: 0.75,
      breathRate: 0.45,
      warmth: 0.65,
      presence: 0.35,
      bellDensity: 0.15,
      droneDensity: 0.5,
      textureDensity: 0.35,
      space: 0.8,
      reverb: 0.75,
      shimmer: 0.15
    }
  }
];
```

---

# 86. Style Plugin 的依赖

Style Plugin 不应该直接创建底层 AudioNode。

例如：

```text
Meditation
```

需要 Bell。

应该声明：

```json
{
  "instruments": [
    "bell"
  ]
}
```

然后通过 Instrument Registry 获取。

例如：

```ts
const bell = context.instruments.get("bell");
```

---

# 87. Instrument Dependency

如果 Plugin 要求某个 Instrument：

```text
required
```

则 Engine 启动 Plugin 前检查。

例如：

```text
Meditation
 ├── drone     required
 ├── bell      required
 ├── bowl      optional
 └── texture   optional
```

如果缺少 Required Instrument：

```text
Plugin initialization fails
```

并向 UI 返回明确错误。

---

# 88. FX Dependency

同样支持：

```json
{
  "requiredFX": [
    "reverb"
  ],
  "optionalFX": [
    "shimmer",
    "stereo"
  ]
}
```

如果 Shimmer 不存在：

```text
Meditation
```

仍然应该能够运行，只是自动关闭 Shimmer。

---

# 89. Plugin Context

Plugin 初始化时由 Core 提供统一 Context。

例如：

```ts
interface StyleContext {
  audioContext: AudioContext;

  random: SeededRandom;

  scheduler: Scheduler;

  instruments: InstrumentRegistry;

  fx: FXRegistry;

  spatial: SpatialEngine;

  eventBus: EventBus;

  parameters: ParameterManager;

  environment?: EnvironmentState;
}
```

Plugin 只能通过 Context 使用 Core 能力。

---

# 90. Plugin 不允许访问 Application UI

Plugin 不允许：

```ts
document.querySelector(...)
window.someApplicationState
```

也不应该直接修改 UI。

Plugin 只负责：

```text
音乐生成
参数
Metadata
Preset
Event
```

UI 由 Application/Core 根据 Plugin Metadata 自动生成。

---

# 91. Plugin 不允许直接管理全局 AudioContext

Plugin 不应该：

```ts
const audioContext = new AudioContext();
```

必须使用：

```ts
context.audioContext
```

这样才能保证：

```text
多个 Plugin
多个 Instrument
多个 FX
```

共享同一个 Audio Runtime。

---

# 92. Meditation Style Instance

示例：

```ts
class MeditationStyle implements StyleInstance {

  constructor(
    private config: MeditationConfig
  ) {}

  start(context: StyleContext) {
    // initialize generators
  }

  stop() {
    // stop generators
  }

  generateEvents(
    context: GenerationContext
  ): MusicalEvent[] {

    const events: MusicalEvent[] = [];

    // Drone
    // Bell
    // Silence
    // Texture
    // Breath

    return events;
  }

  setParameter(
    name: string,
    value: number
  ) {
    // update parameter
  }

  getParameters() {
    return parameters;
  }
}
```

---

# 93. Meditation Event Generation

Meditation 可以使用：

```text
Drone
+
Bell
+
Bowl
+
Breath
+
Texture
+
Silence
```

例如一个 60 秒窗口：

```text
0.0s
Drone

7.8s
Bell

18.5s
Silence

29.2s
Bowl

44.7s
Texture

53.1s
Bell
```

最终全部转换成：

```ts
MusicalEvent[]
```

Core 不需要知道：

```text
为什么 7.8 秒出现 Bell。
```

---

# 94. 新增 Style 的标准开发流程

开发者新增一个 Style 时必须执行：

## Step 1 — 定义音乐目标

先写：

```text
Style Name
音乐特征
时间模型
主要乐器
主要 FX
主要参数
```

---

## Step 2 — 创建目录

例如：

```text
src/styles/meditation/
```

---

## Step 3 — 创建 Plugin

实现：

```ts
StylePlugin
```

---

## Step 4 — 定义 Metadata

包括：

```text
id
name
version
description
timeMode
tags
parameters
presets
dependencies
```

---

## Step 5 — 定义参数

实现：

```text
parameters.ts
```

---

## Step 6 — 实现 Generator

根据风格决定：

```text
HarmonyGenerator
MelodyGenerator
RhythmGenerator
DroneGenerator
TextureGenerator
SilenceGenerator
```

不要求每个 Plugin 都有这些 Generator。

---

## Step 7 — 复用 Instrument

优先使用已有：

```text
Instrument Plugin
```

只有在通用 Instrument 不存在时才增加新 Instrument。

---

## Step 8 — 复用 FX

优先使用：

```text
Reverb
Delay
Spatial
Shimmer
Tape
```

---

## Step 9 — 创建 Preset

至少提供：

```text
2–3 个 Preset
```

---

## Step 10 — 注册

开发环境：

```ts
engine.registerStyle(meditationPlugin);
```

---

## Step 11 — 测试

必须测试：

```text
Plugin Loading
Parameter
Seed
Event Generation
Dependencies
Start
Stop
Pause
Resume
Long Running
```

---

# 95. 新增 Style 的最小代码

理论上，一个最小 Style Plugin 可以只有：

```text
src/styles/example/
├── index.ts
└── ExamplePlugin.ts
```

例如：

```ts
const examplePlugin: StylePlugin = {
  id: "example",

  name: "Example",

  version: "1.0.0",

  create(config) {
    return new ExampleStyle(config);
  }
};

export default examplePlugin;
```

只要符合：

```text
StylePlugin
```

即可被 Core 注册。

---

# 96. Plugin Registration

开发阶段：

```ts
import lofiPlugin from "./styles/lofi";
import zenPlugin from "./styles/zen";
import meditationPlugin from "./styles/meditation";

engine.registerStyle(lofiPlugin);
engine.registerStyle(zenPlugin);
engine.registerStyle(meditationPlugin);
```

然后：

```ts
engine.getAvailableStyles();
```

返回：

```text
Lofi
Zen
Meditation
```

---

# 97. 动态发现

未来可以进一步实现：

```ts
engine.loadPlugin(plugin);
```

或者：

```ts
engine.loadPluginFromManifest(manifest);
```

从而支持：

```text
Plugin Directory
Plugin Marketplace
Dynamic Import
```

第一版本不要求实现动态远程加载。

---

# 98. 独立 npm Plugin

第二阶段允许 Plugin 独立成 Package。

例如：

```text
@music-engine/plugin-lofi
@music-engine/plugin-zen
@music-engine/plugin-meditation
```

每个 package：

```text
package.json
README.md
LICENSE
src/
tests/
```

---

# 99. 独立 Plugin package.json

例如：

```json
{
  "name": "@music-engine/plugin-meditation",
  "version": "1.0.0",

  "peerDependencies": {
    "@music-engine/core": ">=1.0.0"
  }
}
```

这样：

```text
Core
```

与：

```text
Meditation Plugin
```

可以独立升级。

---

# 100. Plugin Version Compatibility

Plugin 必须声明：

```text
engineVersion
```

例如：

```json
{
  "engineVersion": ">=1.0.0 <2.0.0"
}
```

Core 加载 Plugin 时进行兼容性检查。

如果不兼容：

```text
Plugin rejected
```

并返回：

```text
Incompatible engine version
```

---

# 101. Plugin Version

Plugin 自己遵循 Semantic Versioning：

```text
MAJOR.MINOR.PATCH
```

例如：

```text
1.0.0
1.1.0
1.1.1
2.0.0
```

---

# 102. Plugin API Stability

Core Plugin API 必须区分：

```text
Public API
Internal API
```

只有 Public API 可以被第三方 Plugin 使用。

例如：

```text
StylePlugin
StyleContext
GenerationContext
MusicalEvent
ParameterDefinition
Preset
InstrumentRegistry
FXRegistry
```

属于 Public API。

而：

```text
SchedulerInternal
AudioNodePoolInternal
EventQueueInternal
```

不应该直接暴露给 Plugin。

---

# 103. Plugin Sandbox

第一阶段：

```text
Plugin = trusted code
```

不做 Sandbox。

未来如果支持远程第三方 Plugin：

```text
Remote Plugin
       ↓
Sandbox / Worker
       ↓
Restricted API
```

必须重新设计安全边界。

禁止第一版直接：

```text
download arbitrary JS
→ eval()
```

---

# 104. Plugin README 要求

每个 Plugin 都必须有 README。

至少说明：

```text
Name
Purpose
Musical characteristics
Parameters
Presets
Dependencies
Time Model
Seed behavior
Example
```

例如：

```text
# Meditation Plugin

A procedural meditation music generator.

Time Model:
breath

Main Instruments:
drone
bell
bowl
texture

Main characteristics:
- long silence
- slow harmonic movement
- long reverb
- low event density
```

---

# 105. AI Coding Agent 新增 Style 的标准 Prompt

以后如果让 AI Coding Agent 新增一个 Style，可以直接使用：

```text
Implement a new Style Plugin named "Meditation".

Requirements:

1. Do not modify existing Style Plugins.
2. Do not add Meditation-specific logic to Core.
3. Implement the StylePlugin interface.
4. Create src/styles/meditation/.
5. Provide plugin metadata and manifest.
6. Define all user-facing parameters through ParameterDefinition.
7. Provide at least 3 presets.
8. Use the existing Instrument Registry and FX Registry.
9. Do not create a new AudioContext.
10. Use the provided SeededRandom.
11. Generate only MusicalEvent objects.
12. Support deterministic generation with the same seed.
13. Add unit tests.
14. Add README.md.
15. Register the plugin in the development application.
16. Verify that Lofi and Zen behavior remains unchanged.
17. Do not add if(style === "meditation") branches to Core.
```

---

# 106. AI Coding Agent 验收标准

当 AI Agent 声称新增 Style 完成后，必须检查：

### Architecture

```text
[ ] Style 位于 src/styles/<id>/
[ ] Core 没有 Style-specific code
[ ] Plugin 实现 StylePlugin
[ ] Plugin 有 metadata
[ ] Plugin 有 parameters
[ ] Plugin 有 presets
```

### Runtime

```text
[ ] 可以注册
[ ] 可以启动
[ ] 可以停止
[ ] 可以暂停
[ ] 可以恢复
[ ] 可以切换
```

### Determinism

```text
[ ] same seed → same events
[ ] different seed → different events
```

### Dependencies

```text
[ ] Required instruments checked
[ ] Required FX checked
[ ] Missing optional dependencies handled
```

### Regression

```text
[ ] Lofi unchanged
[ ] Zen unchanged
[ ] Core tests pass
```

---

# 107. Style Plugin 与 Instrument Plugin 的职责区别

必须严格区分：

```text
Style Plugin
=
音乐创作规则
```

例如：

```text
什么时候出现 Bell？
什么时候进入 Drone？
多久留白？
和声如何变化？
```

而：

```text
Instrument Plugin
=
声音产生方式
```

例如：

```text
Bell 的声音如何合成？
Attack 多长？
有哪些谐波？
```

因此：

```text
Meditation
```

和：

```text
Zen
```

可以共同使用：

```text
BellSynth
DroneSynth
BowlSynth
```

但拥有不同的生成规则。

---

# 108. Style Plugin 与 FX Plugin 的职责区别

Style 决定：

```text
需要多少 Reverb
什么时候进入空间变化
```

FX 决定：

```text
Reverb 本身怎么实现
```

因此：

```text
Zen
Meditation
Ambient
```

都可以共享：

```text
ReverbPlugin
SpatialPlugin
ShimmerPlugin
```

---

# 109. Style Plugin 组合

未来允许一个 Style 基于其他 Style。

例如：

```text
Meditation
   +
Nature
   +
Spatial
```

或者：

```text
Lofi
   +
Rain
```

但第一版不实现 Style inheritance。

未来可以通过：

```text
Style Layer
```

实现：

```text
Base Style
+
Texture Layer
+
Environment Layer
```

---

# 110. Layer Plugin

未来可以增加：

```ts
interface LayerPlugin {
  id: string;

  generateEvents(
    context: GenerationContext
  ): MusicalEvent[];
}
```

例如：

```text
Lofi
 ├── Beat Layer
 ├── Piano Layer
 ├── Vinyl Layer
 └── Rain Layer
```

Zen：

```text
Zen
 ├── Drone Layer
 ├── Bell Layer
 ├── Breath Layer
 └── Nature Layer
```

这会使未来的组合式音乐生成更加灵活。

---

# 111. 最终 Plugin Architecture

最终系统应该演化为：

```text
                    Music Engine Core
                           │
          ┌────────────────┼────────────────┐
          │                │                │
          ▼                ▼                ▼
     Style Plugins    Instrument Plugins   FX Plugins
          │                │                │
    ┌─────┼─────┐          │                │
    │     │     │          │                │
   Lofi  Zen  Meditation   │                │
    │     │     │          │                │
    └─────┼─────┼──────────┘                │
          │     │                           │
          ▼     ▼                           │
       Musical Events                       │
             │                              │
             └──────────┬───────────────────┘
                        ▼
                    Scheduler
                        │
                        ▼
                    Audio Graph
                        │
                        ▼
                   Spatial / FX
                        │
                        ▼
                     Output
```

---

# 112. 新增 Meditation 的最终结果

完成后，项目应该可以：

```ts
import meditationPlugin from "./styles/meditation";

engine.registerStyle(meditationPlugin);

engine.useStyle("meditation");

await engine.start();
```

UI 自动出现：

```text
Meditation

Preset
[ Deep Stillness ]

Stillness     ───────●
Presence      ───●────
Warmth        ─────●──
Space         ───────●
Breath        ────●───
Bell Density  ──●─────
Nature        ───●────
```

而 Core 完全不需要知道：

```text
Meditation 是什么。
```

Core 只知道：

```text
这是一个合法的 StylePlugin。
```

这就是本项目 Plugin Architecture 的最终目标。

---

# 76. v1.1 增补：音乐机理与目的层增强

本章节为 v1.1 增补需求。在不动摇插件架构边界的前提下，从两个维度增强生成质量：

```text
音乐产生的机理：从"正确的音符"到"有律动、有张力的音乐"
音乐服务的目的：从"稳态无限生成"到"有长时程设计的聆听体验"
```

所有新增能力均以通用 API 或插件内部实现落地，Core 不引入任何风格分支。

## 76.1 方向性微时序（Pocket）

人性化不能只是零均值噪声：

```text
零均值抖动 → 产生"松散"
恒定方向偏置 → 产生"律动"（pocket）
```

每乐器固定 pocket 偏置（毫秒）：

```text
Kick    +9    （略晚，松弛）
Snare    0    （压拍）
Hat     -6    （略赶）
Bass    -5    （略提前于底鼓）
Melody  +6    （略懒）
Chords  +3
```

规则：

- 总偏移（偏置 + 随机）仍限制在 ±15ms 内
- 幅度由 humanization 参数缩放
- 仍由 seed 控制，满足确定性

## 76.2 Sidechain Ducking（底鼓侧链）

Lofi 流派的标志性"呼吸泵"：

```text
Kick 触发 → Bass/和弦/纹理总线短暂下潜 → 快速回弹
```

- Core AudioEngine 提供 duckBus：声明 `duck: true` 的乐器总线统一经过 duckGain
- `MusicalEvent.parameters.duck`（0..1）声明该事件为触发源
- 引擎 dispatch 时按音频时钟对 duckGain 调度 dip
- 属于 Core 通用音频能力（数据驱动），非风格逻辑

## 76.3 导音线（Guide-Tone Line）

爵士和声前进感的核心：3 音 / 7 音在换和弦时级进解决。

- Style 维护 guideTone 状态：取新和弦 3/7 音中离上一 guideTone 最近者
- 钢琴 voicing 顶声部偏向 guideTone（候选成本加成）
- 旋律在和弦边界的强拍音优先解决到 guideTone
- 和弦事件携带 `pitch = 和弦根音`，供可视化与测试

## 76.4 曲式张力（Turnaround / 转调 / 速度包络）

- 每个段落（Intro 除外，段落 ≥5 小节）最后两小节自动插入下一调的 `ii7 → V7` turnaround
- B 段整体转调：`keyOffset ∈ {+3, +5, -4}`（seed 决定），Outro 及后续 A 段回原调
- 段落级速度包络，由 `tempoDynamics` 参数（0..1）缩放：

```text
B 段     +2 BPM
段末小节 -3 BPM（ritard）
Outro    -3 BPM
```

## 76.5 Zen 和声场单音渐变

场变化从整体移调改为"一次只动一个音"：

```text
45%   根音滑动 ±1~2 半音
其余   移动一个非根 tone（sus ↔ 9th ↔ 5th 颜色互换）
```

听感为"空间中某物移动"，而非"换了一个场景"。

## 76.6 呼吸定拍（Breath Quantization）

- 部分钟声事件软对齐到呼吸曲线的局部峰值（吸气顶点）
- 对齐概率由 breath 参数与 purpose 共同决定（meditation 显著增强）
- 数值法找峰（确定性扫描），对齐后仍保证事件间距下限

## 76.7 层间耦合（Sympathetic Excitation）

钟声应"点亮"Drone——真实空间的共鸣行为：

- `MusicalEvent.parameters.exciteBus`（目标乐器 id）+ `excite`（强度 0..1）
- 引擎 dispatch 时对目标乐器总线调度短暂的增益呼吸
- 通用机制：任意事件可激发任意乐器总线，Core 不理解其音乐含义

## 76.8 宏观弧线与目的档案（Purpose Profiles）

稳态生成使第 5 分钟与第 25 分钟统计等价；目的是长时程设计的维度。

`MacroArc`（src/time/MacroArc.ts，跨风格通用）按 purpose 提供分钟级乘数：

```text
multiplier = { density, brightness, space }
```

| purpose | 行为 |
|---|---|
| flow（默认） | 8 分钟周期 ±12% 缓慢起伏 |
| focus | 低显著性稳定态（密度/亮度略降） |
| sleep | sessionLength 的 60% 内线性简化至 40%，末 2 分钟淡向静默 |
| meditation | 低密度高空间 + 呼吸对齐强化 |

- Lofi / Zen 均暴露 `sessionPurpose`（select）与 `sessionLength`（分钟）参数
- UI 由参数 schema 自动生成，无风格分支
- Style 在生成时将乘数作用于密度 / 速度 / 亮度，不修改 Event 模型

## 76.9 和弦 Roll（触键错落）

电钢琴和弦支持 `parameters.roll`（秒）：逐音错开下键（10~30ms 量级），由 Lofi 和声事件按 seed 携带，替代"同时下键的块状和弦"。

## 76.10 验收要点（v1.1）

- [ ] pocket：总偏移仍在 ±15ms 内，kick 方向性偏晚
- [ ] kick 事件携带 duck 参数，duckGain 有调度动作
- [ ] 段落末两小节构成 ii7→V7（V - ii ≡ 5 半音）
- [ ] B 段相对 A 段根音差 ∈ {3, 5, 8}（mod 12）
- [ ] tempoDynamics=0 时速度恒定（可关闭）
- [ ] Zen 相邻 drone 根音差 ≤ 2 半音
- [ ] 钟声事件携带 exciteBus
- [ ] sleep 目的下，会话后期事件密度显著低于前期
- [ ] 全部既有确定性测试保持通过

---

# 77. v1.2 增补：内置风格插件扩展

在不动 Core 的前提下新增 9 个内置 Style Plugin（`src/styles/<id>/`），验证
"新增风格 = 新增插件目录 + 注册" 的架构承诺（PRD §63/§73）。

| Style | timeMode | 主要乐器 | 音乐特征 |
|---|---|---|---|
| jazzhop | beat | EP/bass/ride kit | 行走贝斯、摇摆 ride、根音省略和声 |
| meditation | breath | drone/bowl | 颂钵锁定吸气峰值、极慢和声场（§77–93 落地） |
| ambient | free | drone/pluck | 和弦云交叉淡化、shimmer 空气 |
| japanese | free | pluck/bowl/drone | 平调子/阴/云井五声音阶、筝滚奏、间 |
| nature | free | noise-texture/bell/pluck | 风/水独立通道、鸟鸣动机、大地低音 |
| sleep | free | drone/bowl | 次低音区、极暗 EQ、默认睡眠弧线 |
| cinematic | free | drone/EP/kick | 次低音踏板、涌动和声、心跳脉冲 |
| minimal | beat | pluck/EP | 琶音细胞、相位移动、稀疏长音 |
| dream | free | drone/bell/pluck | 大调铺底、高空灵钟、回声拖尾 |

## 77.1 实现约束（全部满足）

- 每风格独立目录 + README + ≥3 预设
- 复用既有 Instrument / FX / time 模型 / MacroArc，不新增 Core 逻辑
- 自由时间通道一律"发射在游标、然后推进"，保证分块不变性
- 每通道独立 rng fork 与独立 id 计数器（通道交错不影响确定性）
- 每风格单测：same seed → same events / 不同 seed 不同 / 分块不变 / 结构特征
- 既有 Lofi / Zen 测试零改动通过（插件隔离，PRD §60）

---

# 78. v1.3 增补：参数反馈与 UI 紧凑化

## 78.1 参数生效语义（scope 元数据）

ParameterDefinition 新增 `scope`:

```text
fx          → 直接驱动音频节点，即时可闻（混响/磁带/黑胶/空间/微光/回声等）
generation  → 随生成缓冲自然融入（默认；BPM/密度/能量/调性等）
```

- UI 在参数值旁显示 ⚡ / ⏳ 徽标与悬浮说明
- 生成视界从 45s/30s 降至 18s/9s，generation 类参数约 10–25 秒内可闻，
  仍满足 §40 的 generate-ahead 语义

## 78.2 语义澄清

- 「睡眠/冥想时长」仅作为睡眠/冥想弧线的时间刻度；到点**不停止播放**
- 「漂流 · 无尽」即无尽模式（默认）

## 78.3 UI 紧凑化与帮助

- 风格选择器改为横向滑动轮播（scroll-snap + 触摸滑动 + 边缘渐隐提示），
  单行高度约 87px，不再随风格数量换行膨胀
- 新增「？」帮助弹层：播放控制、Seed 复现、聆听目的、参数生效时机、
  移动端提示（锁屏控制 / WakeLock）

---

# 79. v1.4 增补：风格补极与去同质化

## 79.1 新增风格（补齐四个空白极 + 紧张极）

| Style | timeMode | 极 | 特征 |
|---|---|---|---|
| synthwave | beat | 能量/复古 | 超锯齿铺底、16 分琶音、门限鼓、强侧链 |
| deephouse | beat | 舞曲 | 四踩、反拍开镲、滤波切分、intro/groove/break/drop |
| neoclassical | 慢 beat | 旋律/歌曲 | 毡感钢琴分解和弦 + 如歌旋律 + 弦乐铺底 |
| chiptune | beat | 音色语言 | 纯方波琶音/低音、噪声鼓、近干混音 |
| darkambient | free | 紧张/暗黑 | 次低音踏板 + 三全音色彩 + 金属敲击 |

新增乐器（Instrument Plugin）：`supersaw`（6 振荡器失谐锯齿堆叠，duck 参与侧链）、
`felt-piano`（暗色 EP + 毡槌噪声层）、`chip`（纯方波）。

FX 通用能力扩展：Tape 新增 `wobble` 参数（音高漂移深度倍率）。

## 79.2 现有家族去同质化

- **Dream**：磁带音高漂移成为身份特征（wobble 2.4 + wet 0.42）——整轨像半 remembered
  的磁带在缓慢下垂摇摆，与 Ambient（纯和弦云 + shimmer）明确区分
- **Meditation**：新增「呼吸声」参数与可闻呼吸涌动层——每个吸气峰值处一记极轻的
  空气涌动，用户可以跟着呼吸；峰值由确定性函数求取，分块安全

## 79.3 UI：第一行控制面板

「预设」与「聆听目的」合并为一行两列面板，置于风格轮播之后（所有设置面板之首）；
参数面板不再重复渲染 sessionPurpose。

---

# 80. v1.5 增补：高频伪影修复与钟铃柔化

## 80.1 Shimmer 自激环修复（每个风格共同的高频背景音）

**现象**：所有风格背后存在同一个偏高音、缓慢摆动的持续声音。

**根因**：Shimmer 并行链为 21/29ms 延迟 + 0.42 反馈 + 1400Hz 高通。短延迟反馈梳
在 1/delay 的谐波处自激振铃（>1400Hz 的谐波全部通过），底噪被循环放大为连续高音；
LFO 调制延迟时间使其缓慢滑音。该链挂在主总线上、所有风格共享，故"每种音乐都一样"。

**修复**：延迟 83/117ms（振铃基频大幅下降）、环内加 5200Hz 低通、反馈 0.42→0.26、
高通 1400→1700；各风格 shimmer wet 默认值统一下调约 30-45%。

## 80.2 钟铃全局柔化（安静场景不被破坏）

- BellSynth：泛音增益下调约 1/3（钟 2.4×: 0.45→0.3 等）、每声部加随音高自适应的
  低通（1.1kHz+1.6f，上限 4.2kHz）、峰值 0.28→0.2、起音下限 0.05s、AM 深度减半
- 音区整体下移八度：zen/meditation 钟 +36→+24、钵 +24→+12；dream/japanese/sleep/
  nature 同步下调；darkambient 已在低位
- nature 鸟鸣：更柔（起音 0.035、detune 5、力度下调）
- air 纹理床：高通 5200→3800、低通 12000→8500、峰值 0.16→0.12
- 新增「钟铃柔度守卫」测试：安静类风格的钟/钵 pitch ≤ 88 且 velocity ≤ 0.75

## 80.3 UI 修复

- ParameterPanel 过滤 sessionPurpose 后循环仍用未过滤入参的 bug（面板出现重复的
  聆听目的）——修复为统一使用过滤后列表

---

# 81. v1.6 增补：生成式视觉引擎（依据 music_visual_engine_prd.md 裁剪实现）

## 81.1 采纳的核心原则

- **事件驱动而非 FFT 驱动**：视觉由 MusicState（energy/density/brightness/rhythm/
  breath/beatPulse/idle…）+ 乐器事件流驱动，分析器仅作辅助（PRD §3.2）
- **场景即插件**：VisualScene 接口（init/resize/update/handleEvent/render/dispose），
  场景注册制，新增场景不改任何既有代码（PRD §50）
- **音乐与视觉解耦**：视觉只读事件总线，不触碰音频；rAF 时钟独立（PRD §48）
- **deltaTime 动画 + 独立视觉种子**（musicSeed::visual 派生，PRD §33/§35）
- **风格自声明默认场景**：StylePlugin.visualScene 元数据（插件所有，Core 透传），
  UI「跟随音乐」据此切换——无任何 style=== 分支

## 81.2 首批四个场景（Canvas2D，接口留有 WebGL 升级空间）

| 场景 | 音乐映射 |
|---|---|
| 星空 starfield | 旋律→流星（pan 定 x、音高定 y），和弦→星簇+天色染色，底鼓→全场脉冲，静默→夜空变暗 |
| 水波 ripple | 钟/钵→大涟漪+光柱，拨弦→中涟漪，鼓→近岸碎纹，Drone/纹理→水面微光增强，呼吸→水位起伏 |
| 光晕 aurora | 四条加色混合的光带随能量起伏、随呼吸胀缩，钟声→升起的光球，鼓→闪光 |
| 星尘 dust | 粒子场密度随音乐密度，音符→火花爆散，底鼓→全场向外推斥，钟→上升的亮尘 |

## 81.3 全屏沉浸模式（PRD §44）

- 可视化右上角 ⛶ 进入；Fullscreen API 不可用时回退 CSS 伪全屏（iOS Safari）
- 全屏下 3 秒无操作自动隐藏光标与工具栏，任意操作唤醒
- Esc / F 键、桌面双击、✕ 按钮退出；退出/进入自动重设画布尺寸

## 81.4 未纳入本版（接口已预留方向）

WebGL 渲染器、雨/海/火/森林场景、WLED/DMX 输出适配器、多显示器——按原 PRD 分期
后续实现；VisualScene/输出结构与本版兼容。

---

# 82. v1.6.1 增补：视觉品质重做（参考装置美学）

依据用户提供的交互装置参考图（深钴蓝底 × 暖橙光的冷暖对撞、丝状粒子流场、
密度即光、bloom 辉光、涡旋湍流感）对四场景全部重做：

## 82.1 引擎级新增

- **Bloom 后处理**：场景声明 `bloom` 强度（0..1），引擎以 1/4 分辨率离屏
  下采样 + blur 后 'lighter' 叠加回主画布，再叠电影暗角（缓存渐变）
- **seeded fbm 噪声**（src/visual/noise.ts）：值噪声 + 3 octave fbm，
  哈希种子确定性，供流场/液面/帷幕使用
- **累积拖尾**：丝线类场景以半透明 fade-fill 替代清屏——"密度即光"

## 82.2 场景重做

| 场景 | 修复/升级 |
|---|---|
| 水波 | 26 条 fbm 等高线液面（透视增幅、永久滚动），长寿命三重涟漪（8-12s）+ 过曝亮芯 + 光柱 + 暖色火花滴跃出水面，底鼓横扫脉冲，地平线暖镜光晕 |
| 星空 | 320 条 fbm 流场丝线星云（累积拖尾成丝绢），旋律彗星带长曳尾+热核，底鼓/军鼓双冲击波环，双色径向辉光随呼吸 |
| 光晕 | 84 条垂直丝束构成真实极光帷幕（上下沿 fbm 波动），钟声扰动波沿帷幕传播并升起带热核的光球，光子从幕底坠落 |
| 星尘 | 冷暖双色流场丝线（速度上限随音乐），音符火花，底鼓全场推斥 + 双冲击环 |

## 82.3 验证

- 帧差测量（350ms 间隔）：水波在 Zen 稀疏事件下 meanDiff 10.3/像素（旧版事件
  间隙≈0，即"基本不动"根因）、光晕 12.2；点亮率 85-100%
- 视觉契约测试全部保持（159/159）

---

# 83. v1.9 注记：可视化回退

经多轮迭代（v1.6 Canvas2D 场景 → v1.7 GPU 粒子 → v1.8 丝状流场），用户最终选择
回退到最初的简单可视化模式：

- **Canvas2D 频谱条（中线镜像）+ 波形线 + 事件脉冲光圈 + 能量光晕**
- 仅依赖 AudioAnalyser + note 事件总线，随风格主题色着色
- 全屏模式（⛶/Esc/F/双击、iOS 伪全屏回退、空闲隐藏光标）保留
- v1.6–v1.8 的场景系统（VisualEngine/场景插件/GL 渲染器/风格 visualScene
  元数据）全部移除；相关目录 src/visual/ 删除

该模式即项目最初版本的 Visualizer，稳定、轻量、观感干净。
