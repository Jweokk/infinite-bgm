import { EngineError } from './types';
import type { StyleInfo, StylePlugin } from './types';

/** Registry for style plugins. Core never special-cases registered ids. */
export class PluginRegistry {
  private plugins = new Map<string, StylePlugin>();

  register(plugin: StylePlugin): void {
    if (!plugin?.id || !plugin.create) throw new EngineError('Invalid style plugin');
    if (this.plugins.has(plugin.id)) throw new EngineError(`Style "${plugin.id}" already registered`);
    this.plugins.set(plugin.id, plugin);
  }

  unregister(id: string): boolean {
    return this.plugins.delete(id);
  }

  get(id: string): StylePlugin | undefined {
    return this.plugins.get(id);
  }

  list(): StylePlugin[] {
    return [...this.plugins.values()];
  }

  infos(): StyleInfo[] {
    return this.list().map((p) => ({
      id: p.id,
      name: p.name,
      version: p.version,
      description: p.description,
      timeMode: p.timeMode,
      tags: p.tags,
      color: p.color,
      parameters: p.parameters,
      presets: p.presets,
      requiredInstruments: p.requiredInstruments ?? [],
      optionalInstruments: p.optionalInstruments ?? [],
      requiredFX: p.requiredFX ?? [],
      optionalFX: p.optionalFX ?? [],
    }));
  }
}
