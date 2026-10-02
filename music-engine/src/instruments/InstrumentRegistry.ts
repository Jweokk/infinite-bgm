import type { InstrumentContext, InstrumentInstance, InstrumentPlugin } from '../core/types';

/** Registry + instance pool for instrument plugins. */
export class InstrumentRegistry {
  private plugins = new Map<string, InstrumentPlugin>();
  private instances = new Map<string, InstrumentInstance>();

  register(plugin: InstrumentPlugin): void {
    if (!plugin?.id || !plugin.create) throw new Error('Invalid instrument plugin');
    this.plugins.set(plugin.id, plugin);
  }

  get pluginsMap(): Map<string, InstrumentPlugin> {
    return this.plugins;
  }

  instantiateAll(makeContext: (pluginId: string) => InstrumentContext): void {
    for (const [id, plugin] of this.plugins) {
      if (this.instances.has(id)) continue;
      try {
        this.instances.set(id, plugin.create(makeContext(id)));
      } catch (err) {
        console.error(`[InstrumentRegistry] failed to create "${id}"`, err);
      }
    }
  }

  has(id: string): boolean {
    return this.plugins.has(id);
  }

  get(id: string): InstrumentInstance | undefined {
    return this.instances.get(id);
  }

  forEachInstance(cb: (id: string, instance: InstrumentInstance) => void): void {
    for (const [id, inst] of this.instances) cb(id, inst);
  }

  stopAll(when: number, fade: number): void {
    for (const inst of this.instances.values()) {
      try {
        inst.stopAll(when, fade);
      } catch (err) {
        console.error('[InstrumentRegistry] stopAll failed', err);
      }
    }
  }

  disposeAll(): void {
    for (const inst of this.instances.values()) {
      try {
        inst.dispose?.();
      } catch {
        /* ignore */
      }
    }
    this.instances.clear();
  }
}
