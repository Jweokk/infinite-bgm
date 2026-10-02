# Immersive Particle Flow Video Generator PRD

## 1. 项目定位

开发一个独立的实时生成式视觉视频引擎。

目标不是制作一段固定的视频，也不是简单的音乐频谱可视化，而是根据参考图片所体现的视觉语言，持续生成类似沉浸式数字艺术展览的动态粒子视觉。

参考视觉核心：

- 深色空间
- 大量发光粒子
- 蓝 / 靛蓝 / 紫 / 粉 / 桃色光
- 粒子形成巨大的有机结构
- 流场、漩涡、波浪、放射、隧道
- 左右 / 上下 / 多轴镜像
- 无限空间与透视
- 粒子拖尾
- Glow / Bloom
- 缓慢、连续、无明显硬切换的形态变化
- 画面看起来像“活的空间”，而不是普通粒子特效

最终效果应接近“沉浸式粒子艺术空间”，而不是传统的 audio visualizer。

---

# 2. 参考图片的视觉拆解

参考图片中可以归纳出以下主要视觉类型。

## 2.1 镜像洞穴 / 对称空间

特征：

- 左右对称
- 上下反射
- 中央形成通道
- 粒子围绕中心形成洞穴、花瓣或眼睛状结构
- 深蓝背景
- 蓝、紫、粉色高亮

实现组合：

```text
Particle Flow
+
Vortex
+
Mirror X
+
Mirror Y
+
Perspective
```

视觉目标：

> 像进入一个无限镜像的发光洞穴。

---

## 2.2 有机粒子球体 / 生物结构

特征：

- 中央出现巨大粒子团
- 外轮廓柔软
- 不是实体 3D 模型
- 由大量粒子密度形成轮廓
- 类似水滴、细胞、星球、水母或有机生命体

实现方式：

```text
Density Field
+
Noise
+
Particle Sampling
+
Glow
```

不要求真实 3D 模型。

---

## 2.3 巨大粒子漩涡

特征：

- 中央存在吸引点
- 粒子向中心聚集
- 同时存在切向旋转
- 粒子不是简单圆周运动
- 具有水流、银河、头发、能量流的感觉

实现：

```text
Radial Force
+
Tangential Force
+
Curl Noise
+
Damping
```

核心公式概念：

```text
velocity =
    radialForce
  + tangentialForce
  + curlNoise
  + damping
```

---

## 2.4 无限镜像空间

特征：

- 同一结构重复出现
- 形成无限延伸的空间
- 中央存在视觉消失点
- 有明显纵深

实现：

```text
Particle Field
→ Mirror
→ Perspective
→ Feedback
```

支持：

- Mirror X
- Mirror Y
- Mirror XY
- Radial Symmetry
- Kaleidoscope

---

## 2.5 蓝色粒子河流

特征：

- 粒子整体向某一方向流动
- 流向不断变化
- 没有明显中心点
- 类似银河、水流、风、烟

核心：

```text
Curl Noise Flow Field
+
Particle Trail
```

不要使用简单随机移动。

---

## 2.6 放射状粒子爆发

特征：

- 中央聚集
- 突然向四周扩散
- 形成大量细长光束
- 不应该像烟花
- 更像能量爆发

流程：

```text
Compression
→ Burst
→ Radial Expansion
→ Slow Down
→ Return To Flow
```

---

## 2.7 扭曲粒子波 / 发光丝绸

特征：

- 大尺度流动
- 粒子形成连续丝带
- 空间不断扭曲
- 有水、丝绸、能量布料的感觉

实现：

```text
Wave
+
Curl Noise
+
Domain Warp
+
Mirror
```

---

## 2.8 蝴蝶 / 银河 / 翼状结构

特征：

- 左右高度对称
- 中央形成暗区
- 两侧向外扩展
- 类似蝴蝶、星系或能量翅膀

实现：

```text
Symmetric Flow
+
Vortex
+
Mirror X
+
Glow
```

---

# 3. 核心技术原则

## 3.1 不做随机粒子

错误：

```text
random particle movement
```

正确：

```text
continuous vector field
+
force field
+
noise
+
particle dynamics
```

粒子必须受到连续空间场控制。

---

# 4. Particle System

每个粒子至少包含：

```typescript
interface Particle {
  position: Vector3;
  velocity: Vector3;

  size: number;
  brightness: number;
  opacity: number;

  color: Color;

  life: number;
  maxLife: number;

  previousPosition: Vector3;
  trailLength: number;
}
```

粒子数量：

- 最低：5,000
- 推荐：10,000+
- 高性能设备：50,000+

系统必须支持动态降低粒子数量。

---

# 5. Particle Rendering

粒子不能只是普通圆点。

需要支持：

- Point Sprite
- Soft Particle
- Additive Blending
- Glow
- Bloom
- Motion Trail
- Depth Fade
- Size Attenuation
- Brightness Variation

视觉上应从：

```text
●
```

变成：

```text
······●
```

高速运动时形成发光丝线。

---

# 6. Flow Field Engine

定义统一接口：

```typescript
interface FlowField {
  sample(
    position: Vector3,
    time: number
  ): Vector3;
}
```

至少实现：

```text
CurlNoiseField
RadialField
VortexField
WaveField
AttractorField
RepulsionField
GalaxyField
```

允许多个 Field 叠加。

例如：

```text
CurlNoise
+
Vortex
+
Attractor
```

---

# 7. Curl Noise

必须支持 Curl Noise 或等价的连续流场算法。

用途：

- 水流
- 烟雾
- 银河
- 风
- 能量
- 丝绸
- 粒子河流

要求：

- 粒子运动连续
- 不出现明显随机抖动
- 流场随时间缓慢变化

---

# 8. Vortex

参数：

```text
center
radius
strength
rotation
falloff
depth
noise
```

视觉：

```text
粒子
 ↓
向中心移动
+
围绕中心旋转
+
受到 Noise 扰动
```

不要产生机械式圆周运动。

---

# 9. Radial Burst

参数：

```text
center
direction
strength
spread
decay
duration
noise
```

动画：

```text
粒子聚集
→
压缩
→
爆发
→
放射
→
减速
→
重新进入 Flow Field
```

禁止做成普通烟花效果。

---

# 10. Organic Particle Blob

需要能够生成：

```text
cell
water drop
planet
jellyfish
nebula
organic creature
```

推荐：

```text
Implicit Density Field
+
Noise
+
Particle Sampling
```

边缘必须柔软、半透明、粒子化。

---

# 11. Wave Field

实现大型粒子波。

基础：

```text
Wave
+
Noise
+
Curl Field
+
Domain Warp
```

避免单一正弦波。

应使用多频率：

```text
wave1
+
wave2
+
wave3
+
noise
```

形成自然复杂的流动。

---

# 12. Domain Warp

这是参考视觉的重要组成部分。

流程：

```text
Position
 ↓
Noise Displacement
 ↓
Warped Position
 ↓
Flow Field
```

参数：

```text
warpStrength
warpScale
warpSpeed
warpFrequency
```

用于产生：

- 梦境空间
- 扭曲丝绸
- 流动银河
- 有机空间
- 视觉变形

---

# 13. Symmetry Engine

定义：

```typescript
interface SymmetryTransform {
  apply(position: Vector3): Vector3[];
}
```

支持：

```text
None
MirrorX
MirrorY
MirrorXY

Radial2
Radial4
Radial6
Radial8

Kaleidoscope
```

必须与 Particle System 解耦。

例如：

```text
FlowField
+
MirrorXY
```

或者：

```text
Vortex
+
Radial8
```

---

# 14. Perspective / Depth

必须有明显空间深度。

粒子应具有：

```text
x
y
z
```

并通过 Perspective 投影。

深度影响：

```text
size
brightness
opacity
trail
```

远处：

- 小
- 暗
- 密集

近处：

- 大
- 亮
- 拖尾明显

---

# 15. Tunnel

实现粒子隧道。

基本结构：

```text
Camera
 ↓
Particle Tunnel
 ↓
Depth
 ↓
Perspective
```

粒子可以：

```text
toward camera
```

或：

```text
away from camera
```

结合：

```text
Vortex
+
Mirror
+
Feedback
```

形成无限空间。

---

# 16. Mirror / Kaleidoscope

需要支持实时镜像变换。

例如：

```text
Original
 ↓
Mirror X
 ↓
Mirror Y
 ↓
Perspective
```

或者：

```text
Original
 ↓
Radial 8
 ↓
Kaleidoscope
```

用于产生：

- 蝴蝶
- 花瓣
- 翼状结构
- 无限房间
- 几何银河
- 对称能量体

---

# 17. Feedback

可选但建议实现。

流程：

```text
Previous Frame
 ↓
Warp
 ↓
Current Frame
 ↓
Blend
```

产生：

- 无限隧道
- 光影残影
- 递归镜像
- 空间回声
- 流体拖尾

必须有 decay 参数。

防止亮度无限累积。

---

# 18. Glow / Bloom

渲染：

```text
Particle Core
+
Soft Glow
+
Bloom
```

重要原则：

> 黑色和深色空间必须保留。

不能让整个画面都变成高亮白色。

视觉应保持：

```text
Large Dark Area
+
Localized Bright Particle Structures
```

---

# 19. Color System

默认主色：

```text
Deep Navy
Electric Blue
Indigo
Purple
Lavender
Pink
Peach
White
```

默认禁止彩虹渐变。

颜色应该通过 Palette 管理：

```typescript
interface ColorPalette {
  colors: Color[];
  temperature: number;
  saturation: number;
  brightness: number;
}
```

---

# 20. 推荐默认 Palette

## Blue Night

```text
Deep Navy
Electric Blue
Indigo
White
```

## Blue Purple

```text
Deep Navy
Blue
Purple
Lavender
White
```

## Blue Pink

```text
Deep Navy
Electric Blue
Purple
Pink
Peach
White
```

## Cosmic

```text
Black
Deep Blue
Purple
Magenta
White
```

---

# 21. Visual Scene System

不要把所有视觉写死。

建立 Scene：

```typescript
interface VisualScene {
  id: string;
  layers: VisualLayer[];
  parameters: Record<string, number>;
}
```

Scene 可以由多个模块组合。

例如：

```text
Scene
├── FlowField
├── Vortex
├── Symmetry
├── Particle
├── Glow
└── Feedback
```

---

# 22. Scene Presets

至少实现：

```text
blue-vortex
pink-galaxy
infinite-tunnel
particle-ocean
silk-flow
radial-energy
organic-cell
dream-kaleidoscope
```

---

# 23. 参考图片对应 Preset

## blue-vortex

```text
CurlNoise
+
Vortex
+
MirrorXY
+
BluePink
+
Glow
```

## pink-galaxy

```text
GalaxyField
+
Vortex
+
ParticleTrail
+
PurplePink
```

## infinite-tunnel

```text
Tunnel
+
Mirror
+
Perspective
+
Feedback
```

## particle-ocean

```text
CurlNoise
+
Wave
+
BluePalette
+
LongTrail
```

## silk-flow

```text
Wave
+
DomainWarp
+
CurlNoise
+
Mirror
+
PinkBlue
```

## radial-energy

```text
RadialBurst
+
ParticleTrail
+
Bloom
+
BluePink
```

## organic-cell

```text
ParticleBlob
+
DensityField
+
Noise
+
Glow
```

## dream-kaleidoscope

```text
FlowField
+
Vortex
+
Radial8
+
DomainWarp
+
Feedback
```

---

# 24. 动态视频生成逻辑

系统不能只是播放一个 preset。

应该持续改变参数。

例如：

```text
0:00
Flow
 ↓
0:20
Vortex gradually appears
 ↓
0:40
Symmetry increases
 ↓
1:00
Warp increases
 ↓
1:20
Radial burst
 ↓
1:30
Particles dissolve
 ↓
1:50
New organic blob forms
 ↓
2:20
Blob becomes tunnel
 ↓
2:50
Tunnel transforms into wave
 ↓
3:20
Wave becomes vortex
```

整个过程必须连续。

禁止频繁硬切。

---

# 25. 参数缓动

所有主要视觉参数必须支持平滑变化。

例如：

```typescript
value = lerp(
  currentValue,
  targetValue,
  smoothing
);
```

或者使用：

```text
easeInOut
spring
exponential smoothing
```

重点参数：

```text
particleDensity
flowStrength
vortexStrength
warpStrength
symmetryAmount
brightness
glow
trailLength
cameraDepth
cameraZoom
colorTemperature
```

---

# 26. Scene Transition

Scene 切换不允许：

```text
Scene A
CUT
Scene B
```

应该：

```text
Scene A
 ↓
A gradually dissolves
 ↓
B gradually appears
 ↓
A disappears
 ↓
B becomes dominant
```

可以通过：

```text
crossfade
parameter morphing
particle reassignment
field interpolation
```

实现。

---

# 27. 动态变化的重点

系统应该优先改变：

```text
Flow Direction
Particle Density
Vortex Strength
Warp
Symmetry
Depth
Camera Zoom
Color
Glow
Trail
```

而不是频繁切换场景。

最终应该感觉：

> 同一个空间正在不断“变形和呼吸”。

而不是：

> 播放很多不同的特效。

---

# 28. Camera Movement

镜头必须非常慢。

支持：

```text
position
target
FOV
zoom
depth
parallax
```

默认：

- 极慢移动
- 小幅旋转
- 极少突然运动
- 不要像游戏镜头

目标：

```text
floating
dreaming
immersive
continuous
```

---

# 29. 输出

视觉生成器必须独立于输出设备。

同一 Scene 可以输出到：

```text
Monitor
Projector
4K Display
LED simulation
WLED
DMX
Art-Net
```

本 PRD 当前只要求实现：

```text
WebGL / Browser Display
```

其他输出作为后续扩展。

---

# 30. 技术建议

优先：

```text
WebGL
```

推荐：

```text
Three.js
```

或：

```text
raw WebGL
```

如果使用 Three.js：

- Particle system 使用 BufferGeometry / Instanced rendering
- 大量粒子尽量 GPU 计算
- Post Processing 使用 EffectComposer 或自定义 shader
- Glow / Bloom 使用 GPU shader
- 避免逐粒子 DOM 操作

---

# 31. GPU Architecture

推荐：

```text
CPU
 │
 ├── Scene Parameters
 ├── Camera
 ├── Preset
 └── Animation Controller
 │
 ▼
GPU
 │
 ├── Particle Simulation
 ├── Flow Field
 ├── Symmetry
 ├── Particle Rendering
 ├── Trail
 ├── Glow
 ├── Bloom
 └── Feedback
 │
 ▼
Final Frame
```

---

# 32. 性能目标

目标：

```text
1080p → 60 FPS
1440p → 60 FPS
4K → 尽可能接近 60 FPS
```

最低：

```text
5,000 particles
```

推荐：

```text
10,000–30,000 particles
```

高性能：

```text
50,000+
```

当 GPU 负载过高：

```text
Particle Count ↓
Trail Quality ↓
Bloom Quality ↓
```

而不是降低核心动画时间精度。

---

# 33. Seed

所有随机过程必须支持 Seed。

例如：

```text
visualSeed
sceneSeed
particleSeed
```

同样：

```text
seed
+
preset
+
parameters
```

应产生相同的初始视觉结构。

这样便于：

- 调试
- 重现
- 保存作品
- 生成固定版本

---

# 34. 参数化控制

所有视觉参数不能硬编码。

至少提供：

```text
Particle Count
Flow Strength
Flow Scale
Flow Speed

Vortex Strength
Vortex Radius
Vortex Rotation

Warp Strength
Warp Scale
Warp Speed

Symmetry Mode
Symmetry Amount

Trail Length
Glow
Bloom

Camera Zoom
Camera Depth

Color Palette
Color Temperature
Saturation
Brightness
```

---

# 35. GUI

建议提供简单控制面板：

```text
[Preset]

Particle
  Count
  Size
  Density
  Trail

Flow
  Strength
  Scale
  Speed

Vortex
  Strength
  Radius

Warp
  Amount
  Speed

Symmetry
  Mode
  Amount

Camera
  Zoom
  Depth

Render
  Glow
  Bloom

Color
  Palette
  Temperature
  Saturation
```

支持：

```text
Randomize
Regenerate
Save Preset
Load Preset
Export
```

---

# 36. 视频导出

需要支持将实时生成的视觉录制为视频。

最低支持：

```text
WebM
```

推荐后续支持：

```text
MP4
```

导出时应支持：

```text
resolution
FPS
duration
seed
preset
```

例如：

```text
3840 × 2160
60 FPS
120 seconds
seed = 12345
preset = blue-vortex
```

相同参数应该尽可能生成一致的视觉结果。

---

# 37. 后续可扩展接口

本项目当前不需要实现音乐和人体交互。

但是架构应该预留：

```typescript
interface ExternalControl {
  energy?: number;
  movement?: number;
  tension?: number;
  brightness?: number;
  beat?: number;
  audience?: AudienceState;
}
```

未来可以接入：

```text
Music Engine
Audio Analysis
Camera
Person Tracking
Motion Tracking
MIDI
OSC
WebSocket
```

但本项目第一阶段必须能够完全独立运行。

---

# 38. 不应该实现的东西

禁止把本项目做成：

### 普通音频可视化

例如：

```text
FFT bars
circle spectrum
waveform visualizer
```

这些不是本项目目标。

### 随机星空

简单：

```text
random stars
+
slow movement
```

也不够。

### 普通粒子爆炸

不要做成：

```text
fireworks
explosion
```

### 固定视频播放

不能依赖：

```text
mp4
webm
gif
```

作为主要视觉来源。

### 静态图片变形

不能只对参考图片做：

```text
zoom
rotate
distort
```

必须是真正的实时生成式视觉。

---

# 39. MVP 开发顺序

## Phase 1

先完成：

```text
Particle System
Curl Noise
Glow
Trail
Camera
```

达到：

> 粒子可以形成连续自然的流动。

## Phase 2

加入：

```text
Vortex
Radial Field
Wave
```

达到：

> 粒子可以形成大型动态结构。

## Phase 3

加入：

```text
Mirror
Radial Symmetry
Kaleidoscope
```

达到：

> 可以产生参考图中的对称空间。

## Phase 4

加入：

```text
Domain Warp
Feedback
Perspective Tunnel
```

达到：

> 可以产生无限、梦境般的空间。

## Phase 5

加入：

```text
Scene System
Preset System
Parameter Animation
```

达到：

> 可以连续生成 5–10 分钟不重复的视觉。

## Phase 6

加入：

```text
Video Recording
Export
```

达到：

> 可以输出完整动态视觉视频。

---

# 40. 验收标准

### Visual Quality

用户看到画面时应该首先感觉：

```text
immersive
organic
fluid
spatial
luminous
dreamlike
```

而不是：

```text
random
technical
game-like
music visualizer
```

### Particle Quality

粒子必须：

- 连续运动
- 有流向
- 有空间深度
- 可以形成结构
- 支持拖尾
- 支持 Glow

### Spatial Quality

必须能生成：

- 洞穴
- 漩涡
- 隧道
- 波浪
- 有机团块
- 放射结构
- 镜像空间
- 银河 / 翼状结构

### Temporal Quality

至少连续运行：

```text
10 minutes
```

不应该出现明显：

- 卡顿
- 粒子突然重置
- Scene 硬切
- 亮度爆炸
- 视觉循环感过强

---

# 41. 最终目标

最终生成的不是：

> “一段粒子动画”。

而应该是：

> 一个可以持续生成沉浸式数字艺术空间的实时视觉引擎。

核心能力：

```text
Particle
+
Flow
+
Force
+
Noise
+
Warp
+
Symmetry
+
Perspective
+
Glow
+
Feedback
+
Continuous Transformation
```

最终视觉应该让观众感觉自己进入了一个：

```text
流动的银河
+
水
+
能量
+
梦境
+
无限空间
```

而不是站在屏幕前观看一个传统视觉特效。
