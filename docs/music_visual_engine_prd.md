# Music + Visual Engine PRD

> Version: 1.0  
> Project type: Browser-based real-time generative music + generative visual engine  
> Primary target: Web browser / display / projector  
> Future outputs: WLED / ESP32 / addressable LED / DMX / Art-Net

---

## 1. 项目定位

本项目不是传统音乐播放器，也不是传统音乐频谱可视化器。

目标是建立一个可扩展的：

> **Generative Music + Generative Visual Engine**

系统能够实时生成音乐，同时根据音乐的结构、状态、情绪和事件生成视觉世界。

视觉输出可以是：

- 星空
- 粒子
- 雨
- 雾
- 水面
- 火焰
- 森林
- 极光
- 光晕
- 抽象流体
- Cinematic 场景
- 未来 3D 世界

输出设备可以是：

- 浏览器显示器
- TV
- 第二显示器
- 投影仪
- LED 灯带
- WLED / ESP32
- 未来 DMX / Art-Net / sACN

核心思想：

```text
Music Engine
     ↓
Music State / Music Event
     ↓
Visual Mapping
     ↓
Visual Engine
     ↓
Display / Projector / LED / DMX
```

---

# 2. 产品目标

## 2.1 Music Engine

至少支持：

- Lofi
- Zen

架构允许继续添加：

- Jazzhop
- Ambient
- Meditation
- Japanese
- Nature
- Sleep
- Cinematic
- Minimal
- Dream
- Focus
- Space
- Rain
- Ocean
- Forest
- Synthwave
- Chillhop
- Trip-hop

## 2.2 Visual Engine

第一阶段支持：

- Star Field
- Glow
- Particle Dust
- Ripple

后续支持：

- Rain
- Ocean
- Fog
- Fire
- Forest
- Fireflies
- Aurora
- Snow
- Abstract Flow
- Cinematic Scene
- 3D Space

## 2.3 输出

MVP：

```text
Browser → WebGL → Display
```

后续：

```text
Browser → Projector
Browser → WLED → ESP32 → LED Strip
Browser → Art-Net / DMX
```

---

# 3. 设计原则

## 3.1 Music 与 Visual 解耦

Music Engine 不允许依赖 Visual Engine。

Visual Engine 也不能修改 Music Engine。

两者通过标准接口通信：

```text
MusicState
MusicEvent
```

## 3.2 不把项目设计成 FFT 音乐灯

以下不是核心架构：

```text
Audio
 ↓
FFT
 ↓
Bars
 ↓
LED
```

FFT 可以作为辅助输入，但不能作为音乐→视觉的主要接口。

系统应该直接使用 Music Engine 已经知道的：

- Beat
- Chord
- Melody
- Bass
- Drum
- Energy
- Density
- Mood
- Section
- Tension
- Breath
- Movement

## 3.3 不把 LED 当成视觉核心

LED 只是输出设备之一。

核心对象应该是：

```text
Visual Scene
Visual Layer
Particle
Visual Event
Visual State
```

这样同一个视觉可以：

```text
Display
Projector
LED
```

多端输出。

## 3.4 新增插件不修改 Core

增加：

```text
Meditation
Rain
StarField
Ocean
```

都应该通过 Plugin 注册完成。

禁止：

```typescript
if (style === "lofi") ...
if (style === "zen") ...
if (visual === "rain") ...
```

这种不断膨胀的 Core 分支。

---

# 4. 总体架构

```text
                         Music + Visual Engine
                                  │
             ┌────────────────────┴────────────────────┐
             │                                         │
        Music Engine                              Visual Engine
             │                                         │
     ┌───────┼────────┐                       ┌─────────┼─────────┐
     │       │        │                       │         │         │
   Style  Instrument  FX                    Scene    Particle   Ambient
     │                                           │         │         │
 Lofi/Zen/...                              Stars/Rain  Dust     Fog/Glow
     │                                           │
     └────────────────┬──────────────────────────┘
                      ↓
               MusicState / Event
                      ↓
               Visual Mapping
                      ↓
                 Visual Scene
                      ↓
                  Renderer
                      │
          ┌───────────┼───────────┐
          ↓           ↓           ↓
       Display     Projector      LED
                                  │
                            WLED / ESP32
                                  │
                            SK6812 / WS2812
```

---

# 5. Music Engine

## 5.1 Core

Core 负责：

- AudioContext
- Scheduler
- Transport
- MusicalEvent
- Seeded RNG
- Plugin Registry
- Event Bus
- Music State

Core 不负责：

- 具体 Style
- 具体 Instrument
- 具体 Visual
- 具体 LED

---

# 6. Style Plugin

标准接口：

```typescript
interface StylePlugin {
  id: string;
  name: string;
  version: string;

  getParameters(): ParameterDefinition[];

  initialize(context: StyleContext): void;

  generateSection(
    context: CompositionContext
  ): MusicalEvent[];

  dispose(): void;
}
```

至少实现：

```text
LofiStylePlugin
ZenStylePlugin
```

未来：

```text
MeditationStylePlugin
AmbientStylePlugin
JazzhopStylePlugin
CinematicStylePlugin
```

---

# 7. Unified MusicalEvent

```typescript
interface MusicalEvent {
  id: string;

  type:
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

  startTime: number;
  duration: number;

  instrument?: string;
  pitch?: number;
  velocity?: number;
  pan?: number;

  parameters?: Record<
    string,
    number | string | boolean
  >;

  metadata?: {
    sourcePlugin?: string;
    role?: string;
    section?: string;
  };
}
```

---

# 8. Lofi Plugin

Lofi 以：

- Beat
- Groove
- Chord progression
- Bass
- Melody
- Drum
- Swing

为核心。

典型结构：

```text
Intro
→ A
→ B
→ A
→ B
→ Outro
```

默认：

```text
BPM: 70–90
Swing: 0.50–0.65
```

音乐事件可以直接成为视觉输入。

例如：

```text
Kick → Pulse
Snare → Spark
Bass → Depth
Piano → Stars
Chord → Color
```

---

# 9. Zen Plugin

Zen 不应只是“慢速 Lofi”。

它采用：

- Free Time
- Drone
- Bell
- Bowl
- Silence
- Long Reverb
- Slow Breath
- Spatial Movement

典型参数：

```text
rhythmicDensity = very low
harmonicDensity = low
silenceDensity = high
spatialDepth = high
eventDuration = long
```

典型视觉：

```text
Bell → Ripple
Drone → Breathing Glow
Silence → Fade
Slow movement → Star Drift
```

---

# 10. MusicState

为了让 Visual Plugin 不需要理解音乐内部全部细节，Music Engine 输出统一高级状态。

```typescript
interface MusicState {
  energy: number;
  density: number;
  tension: number;

  brightness: number;
  warmth: number;

  rhythm: number;
  movement: number;
  spatialDepth: number;

  harmonicChange: number;
  breath: number;

  section: string;
  time: number;
}
```

范围：

```text
0.0 – 1.0
```

例如 Lofi：

```text
energy = 0.55
density = 0.65
rhythm = 0.80
warmth = 0.85
movement = 0.55
```

Zen：

```text
energy = 0.10
density = 0.08
rhythm = 0.05
breath = 0.90
spatialDepth = 0.95
movement = 0.10
```

---

# 11. Visual Engine

Visual Engine 负责：

- Visual Plugin
- Visual Scene
- Layer
- Particle
- Animation
- Visual Mapping
- Renderer
- Display Output
- Lighting Output

不负责：

- Music Generation
- AudioContext
- Music Style
- LED 硬件协议细节

---

# 12. Visual Scene

```typescript
interface VisualScene {
  id: string;
  name: string;

  layers: VisualLayer[];

  initialize(context: VisualContext): void;

  update(
    deltaTime: number,
    state: MusicState
  ): void;

  handleEvent(
    event: MusicalEvent
  ): void;

  render(
    renderer: VisualRenderer
  ): void;

  dispose(): void;
}
```

---

# 13. Visual Layer

视觉采用分层结构：

```text
Scene
│
├── Background
├── Ambient
├── Particle
├── Object
└── PostFX
```

## Background

例如：

- Black
- Gradient
- Sky
- Night
- Water
- Color Field

## Ambient

例如：

- Fog
- Glow
- Aurora
- Light Rays
- Noise

## Particle

例如：

- Stars
- Dust
- Rain
- Snow
- Fireflies
- Sparks

## Object

例如：

- Circle
- Wave
- Mountain
- Tree
- Abstract Shape

## PostFX

例如：

- Blur
- Bloom
- Color Grade
- Vignette
- Distortion

---

# 14. Visual Plugin

```typescript
interface VisualPlugin {
  id: string;
  name: string;
  version: string;

  initialize(context: VisualContext): void;

  createScene(
    config: VisualConfig
  ): VisualScene;

  update(
    state: MusicState
  ): void;

  dispose(): void;
}
```

Visual Plugin 不得自己创建：

- AudioContext
- WebGL Context
- Canvas
- UI

这些由 Engine 管理。

---

# 15. VisualContext

```typescript
interface VisualContext {
  renderer: VisualRenderer;

  random: SeededRandom;

  parameters: ParameterStore;

  particleSystem: ParticleSystem;

  eventBus: EventBus;

  clock: VisualClock;

  resources: ResourceManager;
}
```

未来：

```typescript
environment?: EnvironmentState;
camera?: CameraState;
```

---

# 16. Visual Mapping

这是整个项目最重要的连接层。

```text
MusicState
MusicEvent
     ↓
Visual Mapping
     ↓
Visual Parameter
```

例如：

```text
energy
 ↓
particleCount
glowIntensity
cameraMovement
```

```text
brightness
 ↓
starBrightness
backgroundBrightness
fogBrightness
```

```text
movement
 ↓
particleSpeed
waveSpeed
windStrength
```

---

# 17. Mapping API

```typescript
interface VisualMapping {
  id: string;

  apply(
    state: MusicState,
    event?: MusicalEvent
  ): VisualParameterState;
}
```

支持：

- linear
- exponential
- logarithmic
- threshold
- smoothstep
- easing
- spring
- noise
- random range

---

# 18. Music Event → Visual Event

不要让每一个音乐事件直接等于一个视觉闪烁。

推荐：

```text
MusicalEvent
 ↓
Visual Behavior
 ↓
Visual State
 ↓
持续演化
```

例如：

```text
Kick
 ↓
World Pulse
```

```text
Bell
 ↓
Ripple
```

```text
Chord Change
 ↓
Color Transition
```

```text
Melody Note
 ↓
Star Spawn
```

```text
Silence
 ↓
Slow Fade
```

---

# 19. 时间尺度

视觉支持多种时间尺度：

```text
Micro       20ms–500ms
Beat        0.5s–2s
Phrase      2s–10s
Breath      5s–60s
Scene       30s–10min
```

例如：

```text
Kick        → 100ms Pulse
Chord       → 5s Color Transition
Drone       → 20s Breathing
Section     → 2min Scene Change
```

这样 Lofi 和 Zen 可以共享同一个视觉系统。

---

# 20. Particle System

```typescript
interface Particle {
  x: number;
  y: number;
  z: number;

  vx: number;
  vy: number;
  vz: number;

  size: number;
  opacity: number;

  life: number;
  maxLife: number;

  color: Color;
}
```

Behavior：

```text
drift
orbit
flow
fall
rise
explode
attract
repel
noise
wave
```

首版目标：

```text
5,000 particles
```

理想：

```text
10,000+
```

---

# 21. StarField Plugin

首个重点 Visual Plugin。

参数：

```text
density
speed
depth
brightness
twinkle
drift
colorTemperature
parallax
```

音乐映射：

```text
Melody pitch
    ↓
Star Y

Melody velocity
    ↓
Star brightness

Note duration
    ↓
Star lifetime

Pan
    ↓
Star X

Energy
    ↓
Star density
```

注意：

不要直接显示 MIDI 音符。

应该将音乐结构转化为自然视觉行为。

---

# 22. Ripple Plugin

Bell、Bowl、Pluck 等事件生成 Ripple。

```text
           ○
        ○     ○
      ○         ○
        ○     ○
           ○
```

参数：

```text
origin
radius
speed
thickness
opacity
color
decay
```

Bell：

```text
Bell
 ↓
Ripple
 ↓
slow expansion
 ↓
fade
```

---

# 23. Glow / Breathing Plugin

适用于：

- Zen
- Meditation
- Sleep
- Ambient

参数：

```text
baseBrightness
amplitude
cycle
color
blur
softness
```

例如：

```text
breath = 0 → 1 → 0
```

亮度：

```text
brightness =
base + amplitude * breath
```

默认周期：

```text
8s–30s
```

---

# 24. Rain Plugin

参数：

```text
particleCount
fallSpeed
wind
dropLength
brightness
splash
```

映射：

```text
energy → rainDensity
movement → wind
bass → splash
brightness → lightning possibility
```

---

# 25. Ocean Plugin

参数：

```text
waveAmplitude
waveLength
waveSpeed
foam
depth
fog
```

映射：

```text
bass → waveAmplitude
movement → waveSpeed
energy → waveActivity
brightness → skyBrightness
```

---

# 26. Fire Plugin

参数：

```text
heat
turbulence
flameHeight
particleDensity
glow
```

映射：

```text
energy → flameHeight
rhythm → flicker
bass → glow
density → particleDensity
```

---

# 27. Nature Scene

Nature 不做成一个不可拆分的大插件。

建议组合：

```text
Forest
Rain
Wind
Fireflies
Fog
Moon
Water
```

例如：

```text
Nature Scene
├── Forest
├── Fog
├── Fireflies
└── Wind
```

这样可以继续组合：

```text
Forest + Rain
Forest + Fireflies
Ocean + Fog
Night + Fireflies
```

---

# 28. Visual Preset

```json
{
  "id": "zen-night",
  "background": {
    "brightness": 0.08
  },
  "stars": {
    "density": 0.35,
    "speed": 0.02,
    "twinkle": 0.15
  },
  "glow": {
    "intensity": 0.25,
    "cycle": 18
  }
}
```

Preset 不应包含代码，只包含参数。

---

# 29. Music Style 与 Visual Style 的组合

Music 和 Visual 不应一一绑定。

推荐：

```text
Music Style
+
Mood
+
Environment
+
Visual Scene
```

例如：

```text
Lofi
+
Warm
+
Rain
+
Window Glow
```

得到：

```text
Rainy Lofi
```

或者：

```text
Zen
+
Dream
+
Night
+
Star Field
```

得到：

```text
Zen Night
```

或者：

```text
Ambient
+
Dream
+
Ocean
+
Aurora
```

得到：

```text
Dream Ocean
```

---

# 30. 推荐的 Plugin 分类

```text
Music Plugins
├── Style
│   ├── Lofi
│   ├── Zen
│   ├── Ambient
│   ├── Jazzhop
│   └── Meditation
│
├── Instrument
│   ├── Piano
│   ├── Bell
│   ├── Bowl
│   ├── Guitar
│   └── Synth
│
└── FX
    ├── Reverb
    ├── Delay
    ├── Tape
    └── Vinyl

Visual Plugins
├── Scene
│   ├── StarField
│   ├── Ocean
│   ├── Forest
│   ├── Rain
│   └── Abstract
│
├── Particle
│   ├── Stars
│   ├── Dust
│   ├── Snow
│   └── Fireflies
│
├── Ambient
│   ├── Fog
│   ├── Glow
│   └── Aurora
│
└── PostFX
    ├── Bloom
    ├── Blur
    └── Distortion
```

---

# 31. Renderer

首版采用 WebGL。

```typescript
interface VisualRenderer {
  initialize(canvas: HTMLCanvasElement): void;

  resize(
    width: number,
    height: number,
    pixelRatio: number
  ): void;

  beginFrame(): void;

  render(scene: VisualScene): void;

  endFrame(): void;

  dispose(): void;
}
```

实现可以是：

```text
Canvas2DRenderer
WebGLRenderer
WebGPURenderer
```

首版：

```text
WebGLRenderer
```

Canvas 2D 仅作为 fallback。

---

# 32. 为什么使用 WebGL

目标包括：

- 数千到数万粒子
- Glow
- Blur
- Bloom
- Noise
- Fog
- Shader
- 3D depth
- Star field
- Water
- Feedback
- Post-processing

因此不能把 Canvas 2D 作为主要 renderer。

---

# 33. Visual Clock

```typescript
interface VisualClock {
  elapsed: number;
  delta: number;
  timeScale: number;
}
```

所有动画必须基于：

```text
deltaTime
```

而不能基于：

```text
每帧 + 1
```

确保：

```text
30 FPS
60 FPS
120 FPS
```

视觉速度一致。

---

# 34. 音乐与视觉同步

音乐的时间基准：

```text
AudioContext.currentTime
```

不能使用：

```text
Date.now()
```

作为音乐同步基准。

Visual Engine：

```text
musicTime
 ↓
visualTime
```

允许：

```text
visualLatencyCompensation
```

例如：

```text
-20ms
0ms
+20ms
```

用于显示器、投影和 LED 的延迟补偿。

---

# 35. Seed Determinism

Visual Engine 必须支持 Seed。

相同：

```text
musicSeed
visualSeed
configuration
```

应得到相同：

- 星星初始位置
- 粒子分布
- 随机事件
- 环境噪声
- 视觉路径

建议：

```text
musicSeed
    +
1000
    ↓
visualSeed
```

使音乐和视觉拥有独立随机序列。

---

# 36. Display Output

MVP：

```text
Browser
 ↓
Canvas
 ↓
WebGL
 ↓
Display
```

要求：

- Fullscreen
- 1080p
- 1440p
- 4K
- Retina
- Resize
- 60 FPS
- 30 FPS low-power mode

---

# 37. Projector Output

Projector 不需要特殊 Visual Engine。

直接：

```text
Fullscreen Browser
 ↓
HDMI / DisplayPort
 ↓
Projector
```

支持：

- 第二屏
- Extended Display
- Fullscreen
- 4K projector

---

# 38. LED Output

LED 作为 Output Adapter。

```text
Visual Scene
 ↓
Lighting Mapper
 ↓
Lighting Frame
 ↓
WLEDOutput
 ↓
ESP32
 ↓
SK6812 / WS2812
```

接口：

```typescript
interface LightingOutput {
  connect(): Promise<void>;

  send(
    frame: LightingFrame
  ): void;

  disconnect(): void;
}
```

---

# 39. Lighting Frame

```typescript
interface LightingFrame {
  timestamp: number;

  zones: LightingZone[];
}

interface LightingZone {
  id: string;

  pixels: RGBW[];

  brightness: number;
}
```

未来：

```text
WLEDOutput
DMXOutput
ArtNetOutput
sACNOutput
```

都实现同一接口。

---

# 40. Virtual LED Simulator

没有硬件时，浏览器提供：

```text
Virtual LED Strip
```

例如：

```text
● ● ● ● ● ● ● ● ● ● ● ● ● ● ●
```

模拟：

- LED 数量
- RGB/RGBW
- Brightness
- Zone
- Pulse
- Wave
- Gradient

这样 Lighting Plugin 可以完全在浏览器中开发。

---

# 41. Visual → LED 降采样

例如：

```text
Visual:
3840 × 2160

LED:
300 pixels
```

转换：

```text
Visual Frame
 ↓
Sampling / Projection
 ↓
300 RGBW pixels
```

支持：

```text
Average
Center
Maximum
Weighted Average
Edge
Zone Average
```

---

# 42. 多区域空间输出

未来支持：

```text
Zone 1: Ceiling
Zone 2: Left Wall
Zone 3: Right Wall
Zone 4: Floor
Zone 5: Background
```

例如 Ocean：

```text
Floor   → blue wave
Left    → dark blue
Right   → cyan
Ceiling → subtle glow
```

这样可以进一步发展成沉浸式房间。

---

# 43. UI

主界面：

```text
┌──────────────────────────────────────┐
│ MUSIC                                │
│                                      │
│ Lofi      BPM 78      Energy 45%     │
│                                      │
├──────────────────────────────────────┤
│ VISUAL                               │
│                                      │
│       ★       ·          ★           │
│   ·                 ·                │
│             ✦                        │
│                         ·            │
├──────────────────────────────────────┤
│ Style       Visual       Environment │
│ Lofi        Star Field   Night       │
│                                      │
│ Energy ─────────●────                │
│ Motion ──────●────────               │
│ Glow   ────●──────────               │
└──────────────────────────────────────┘
```

---

# 44. Fullscreen Visual Mode

提供：

```text
Enter Visual Mode
```

进入：

- 无 UI
- 隐藏鼠标
- 全屏
- 自动播放
- 4K 优先
- 60 FPS

主要用于：

- TV
- 第二显示器
- Projector
- 沉浸式房间

---

# 45. 第一批组合

## Lofi

```text
Music: Lofi
Visual: Rain + Window Glow
```

音乐：

```text
Kick → subtle pulse
Snare → spark
Piano → star/dust
Bass → depth
```

## Zen

```text
Music: Zen
Visual: Star Field + Slow Glow
```

```text
Bell → Ripple
Drone → Breath
Silence → Fade
```

## Meditation

```text
Music: Meditation
Visual: Breathing Circle + Fog
```

## Ambient

```text
Music: Ambient
Visual: Aurora + Particle Dust
```

## Nature

```text
Music: Nature
Visual: Forest + Fireflies + Fog
```

## Cinematic

```text
Music: Cinematic
Visual: Fog + Light Rays + Particle Burst
```

---

# 46. 项目目录

```text
music-engine/
│
├── src/
│   ├── core/
│   │
│   ├── music/
│   │   ├── events/
│   │   ├── state/
│   │   └── director/
│   │
│   ├── styles/
│   │   ├── lofi/
│   │   └── zen/
│   │
│   ├── instruments/
│   ├── fx/
│   │
│   ├── visual/
│   │   ├── core/
│   │   ├── renderer/
│   │   ├── scene/
│   │   ├── layers/
│   │   ├── particles/
│   │   ├── mappings/
│   │   ├── plugins/
│   │   │   ├── stars/
│   │   │   ├── glow/
│   │   │   ├── rain/
│   │   │   ├── ocean/
│   │   │   └── fire/
│   │   └── outputs/
│   │       ├── display/
│   │       ├── projector/
│   │       ├── wled/
│   │       └── dmx/
│   │
│   └── ui/
│
├── tests/
├── public/
├── package.json
├── tsconfig.json
└── README.md
```

---

# 47. 开发阶段

## Phase 1 — Music Core

完成：

- Core
- Scheduler
- MusicalEvent
- Seeded RNG
- Style Plugin
- Instrument Plugin
- FX Plugin
- Lofi
- Zen

## Phase 2 — Visual Core

完成：

- VisualEngine
- VisualScene
- VisualLayer
- VisualPlugin
- MusicState
- VisualMapping
- WebGLRenderer

## Phase 3 — 第一批视觉

完成：

- StarField
- Glow
- ParticleDust
- Ripple

## Phase 4 — Music → Visual

完成：

```text
MusicState → VisualMapping
MusicEvent → Visual Behavior
```

实现：

```text
Lofi + Visual
Zen + Visual
```

## Phase 5 — Environment

增加：

- Rain
- Ocean
- Fog
- Fire
- Forest

## Phase 6 — Hardware

增加：

- WLED
- ESP32
- WS2812B
- SK6812 RGBW

## Phase 7 — Projection

增加：

- Fullscreen
- Multi-display
- Projector
- Spatial Zones

## Phase 8 — Interactive Environment

未来：

```text
Camera
 ↓
Audience Detection
 ↓
Environment State
 ↓
Visual Engine
```

例如：

```text
观众靠近
 ↓
粒子向观众聚集

观众移动
 ↓
星尘受到扰动

房间无人
 ↓
世界进入 Sleep
```

---

# 48. 性能要求

## Display

目标：

```text
1080p → 60 FPS
1440p → 60 FPS
4K    → 目标 60 FPS
```

粒子：

```text
Minimum: 5,000
Target: 10,000+
```

## Audio

Visual Renderer 不得影响 Audio Scheduler。

即使：

```text
Visual FPS ↓
```

也不能导致：

```text
Audio timing drift
```

---

# 49. 测试

## Music

- Seed determinism
- Scheduler timing
- Section generation
- Plugin registration

## Visual

- Particle lifecycle
- Scene lifecycle
- Mapping correctness
- Renderer resize
- FPS stability
- Seed determinism

## Integration

- MusicState → Visual
- MusicEvent → Visual
- Visual 不影响 Audio
- Style Plugin 不依赖 Visual
- Visual Plugin 不依赖 AudioContext

## Output

- Display
- Virtual LED
- WLED Adapter

---

# 50. 添加新 Visual Plugin 的标准流程

例如添加 `Aurora`：

```text
src/visual/plugins/aurora/
├── index.ts
├── AuroraPlugin.ts
├── AuroraScene.ts
├── parameters.ts
├── presets.ts
└── README.md
```

实现：

```typescript
class AuroraPlugin implements VisualPlugin {
  id = "aurora";
  name = "Aurora";
  version = "1.0.0";

  initialize(context: VisualContext) {
    // initialize plugin
  }

  createScene(config: VisualConfig) {
    return new AuroraScene(config);
  }

  update(state: MusicState) {
    // update parameters
  }

  dispose() {}
}
```

注册：

```typescript
visualRegistry.register(
  new AuroraPlugin()
);
```

不允许修改：

```text
Music Core
Scheduler
Audio Engine
其他 Visual Plugin
```

---

# 51. AI Coding Agent 开发规则

1. 不允许把视觉逻辑写入 Music Core。
2. 不允许把 Lofi/Zen 判断写入 Visual Core。
3. 不允许 Visual Plugin 自己创建 AudioContext。
4. 不允许 Visual Plugin 直接依赖 LED 硬件。
5. 不允许用 FFT 作为唯一音乐→视觉接口。
6. 所有视觉随机性必须支持 Seed。
7. 所有动画必须使用 deltaTime。
8. Audio Scheduler 与 Visual Renderer 必须解耦。
9. 新增 Visual Plugin 不应修改 Core。
10. Display / Projector / WLED / DMX 必须通过 Output Adapter。
11. Visual Plugin 必须可独立测试。
12. 首版优先保证 1080p/60 FPS。
13. 不为了视觉效果牺牲 Audio Scheduler。
14. Style、Mood、Environment 不应被固化成一个不可组合的插件。
15. 优先设计可组合的 Scene / Layer / Particle / Mapping。
16. 不得将视觉实现退化成简单频谱柱状图。
17. 不得因为增加视觉功能而改变已有音乐生成结果。
18. 音乐和视觉的 Seed 必须可以独立控制。

---

# 52. MVP 验收标准

### Music

- Lofi 正常生成
- Zen 正常生成
- Seed 可复现
- Scheduler 无明显漂移
- Next Track 正常过渡

### Visual

- WebGL 正常运行
- StarField 正常运行
- Glow 正常运行
- ParticleDust 正常运行
- Ripple 正常运行
- Fullscreen 正常运行

### Integration

- MusicState 驱动 Visual
- MusicEvent 触发 Visual Behavior
- 不依赖 FFT 才能工作
- Visual FPS 波动不影响 Audio Scheduler

### Plugin

增加一个新 Visual Plugin 时：

```text
新增 Plugin
+
注册
=
可以运行
```

无需修改 Core。

### Output

MVP：

```text
Browser Display
```

必须预留：

```text
Projector
WLED
DMX
```

接口。

---

# 53. 最终产品形态

## Mode 1 — Music

音乐为主，视觉辅助。

## Mode 2 — Music + Visual

音乐和视觉共同生成。

## Mode 3 — Immersive

```text
Music
+
Visual
+
Projector
+
LED
+
Camera
+
Environment
```

最终产品不是：

> 音乐播放器

也不是：

> 音乐频谱灯

而是：

> **一个可以实时生成音乐、视觉和空间氛围的开放式 Generative Media Engine。**
