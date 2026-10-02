# 开发与构建指南

## 环境

- Node.js ≥ 18（建议 20+）
- 无运行时依赖；`npm install` 只会装 Vite / TypeScript / Vitest 三个构建期依赖

## 常用命令

```bash
cd music-engine

npm install        # 首次安装依赖（约 1 分钟）
npm run dev        # 开发服务器（--host 已开，手机同 WiFi 可访问）
npm run test       # 全部 175 个单元测试
npm run typecheck  # 仅类型检查（tsc --noEmit）
npm run build      # 类型检查 + 打包到 dist/
```

提交前建议：`npm run typecheck && npm run test && npm run build`。

## 产物与部署

`npm run build` 输出到 `music-engine/dist/`：

```
dist/index.html                    入口文档（不缓存）
dist/assets/index-<hash>.js        应用与引擎（≈222 KB / gzip ≈60 KB）
dist/assets/index-<hash>.css       样式（≈13 KB / gzip ≈3.6 KB）
```

部署时把 `dist/` 内容放进容器挂载的 `site/` 目录，然后 `docker compose up -d --force-recreate`
（**注意**：如果先 `rm -rf site` 再重建，bind mount 的 inode 会失效导致整站 403；
正确做法是清空目录内容再解包，或重建容器）。

## 目录职责

| 路径 | 职责 |
|---|---|
| `src/core/` | 引擎核心：调度器、事件总线、状态机、种子随机、音频图、注册表 |
| `src/core/music/` | 乐理工具：音阶、和弦、导音线 |
| `src/time/` | `beat` / `free` / `breath` 时间模型与宏观弧线 |
| `src/spatial/` | 空间与声像 |
| `src/instruments/` | 13 个乐器合成器 |
| `src/fx/` | 10 个效果器 |
| `src/styles/` | 16 个风格插件（每个目录含独立 README） |
| `src/ui/` | 界面、参数面板、可视化器、机上自检面板 |
| `src/i18n/` | 中英文字典与本地化 |

## 修改界面

- 布局与交互：`src/ui/App.ts`；样式与主题变量：`src/ui/styles.css`
  （颜色全部走 `:root` 变量，亮色主题在 `[data-theme='light']` 里覆盖）
- 参数面板由风格插件的 `ParameterDefinition` 自动生成，无需改 UI 代码
- 文案改动只动 `src/i18n/ui.ts`：EN 字典以 `Record<keyof typeof ZH, string>` 约束，
  **漏译会直接编译失败**；风格元数据的英文在 `src/i18n/meta.ts`，
  `tests/core/I18n.test.ts` 会遍历 16 个风格的全部中文字段，缺一条即报错

## 新增一个音乐风格（不改 Core）

1. 新建 `src/styles/<id>/index.ts`，实现 `StylePlugin`（metadata + parameters + presets + create）
2. 生成器只产出 `MusicalEvent`；随机数一律用 `context.random`（种子派生，按小节 fork）
3. 复用已有乐器与效果器（`context.instruments` / `context.fx`）
4. 在 `src/main.ts` 里 `engine.registerStyle(myPlugin)` 注册一行
5. 参照 `tests/styles/NewStyles.test.ts` 补测试（确定性 / 分块不变 / 结构特征）

现成范例：`src/styles/dream/`（free 型）或 `src/styles/jazzhop/`（beat 型）。
详细规范见 `docs/musicprd.md`。

## 测试覆盖

175 个单元测试（12 个文件）：

| 文件 | 覆盖 |
|---|---|
| `tests/styles/NewStyles.test.ts` | 各风格的确定性、分块一致性与结构特征 |
| `tests/lofi/` `tests/zen/` | 两个样板风格的深度用例 |
| `tests/core/Engine.test.ts` | 引擎生命周期、风格切换、种子复现 |
| `tests/core/Scheduler.test.ts` | 调度时序与前瞻 |
| `tests/core/SeededRandom.test.ts` | 种子派生与 fork 隔离 |
| `tests/core/Regressions.test.ts` | 后台节流丢音、失效风格回落、过渡排队、iOS 音频稳健性等回归护栏 |
| `tests/core/I18n.test.ts` | 中英字典键对齐、无漏译、本地化不破坏 id、语言/主题解析优先级 |

浏览器侧另有一组 CDP 端到端脚本（播放/暂停/换种子/换风格/全屏/移动端模拟/iOS 音频解锁/
CSP 违规检查），运行在真实 headless Chrome 上。
