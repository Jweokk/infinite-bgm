import type {
  GenerationContext,
  MusicalEvent,
  ParamValue,
  StyleContext,
  StylePlugin,
  StyleInstance,
} from '../../src/core/types';

/** Headless StyleContext mock shared by style tests. */
export function mockStyleContext(): StyleContext {
  return {
    audioContext: null as any,
    random: null as any,
    instruments: { get: () => undefined },
    fx: { get: () => undefined, has: () => false },
    spatial: { setStereoWidth: () => {}, setMovement: () => {}, getMovement: () => 0 },
    eventBus: { emit: () => {} },
  };
}

export function defaultsOf(plugin: StylePlugin): Record<string, ParamValue> {
  const out: Record<string, ParamValue> = {};
  for (const def of plugin.parameters) out[def.id] = def.default;
  return out;
}

export function makeInstance(plugin: StylePlugin, params: Record<string, ParamValue>, seed: string): StyleInstance {
  const instance = plugin.create({ seed, parameters: { ...defaultsOf(plugin), ...params } });
  instance.start(mockStyleContext());
  return instance;
}

export function generateWith(
  plugin: StylePlugin,
  params: Record<string, ParamValue>,
  windows: [number, number][],
  seed = '42',
): MusicalEvent[] {
  const instance = makeInstance(plugin, params, seed);
  const all: MusicalEvent[] = [];
  for (const [from, to] of windows) {
    const ctx: GenerationContext = { random: null as any, from, to };
    all.push(...instance.generateEvents(ctx));
  }
  return all;
}
