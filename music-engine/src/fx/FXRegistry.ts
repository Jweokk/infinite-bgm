import type { FXContext, FXInstance, FXPlugin } from '../core/types';

/** Registry + instance pool for FX plugins on the master chain. */
export class FXRegistry {
  private plugins = new Map<string, FXPlugin>();
  private instances = new Map<string, FXInstance>();

  register(plugin: FXPlugin): void {
    if (!plugin?.id || !plugin.create) throw new Error('Invalid FX plugin');
    this.plugins.set(plugin.id, plugin);
  }

  get pluginsMap(): Map<string, FXPlugin> {
    return this.plugins;
  }

  instantiateAll(makeContext: () => FXContext): void {
    for (const [id, plugin] of this.plugins) {
      if (this.instances.has(id)) continue;
      try {
        this.instances.set(id, plugin.create(makeContext()));
      } catch (err) {
        console.error(`[FXRegistry] failed to create "${id}"`, err);
      }
    }
  }

  has(id: string): boolean {
    return this.plugins.has(id);
  }

  get(id: string): FXInstance | undefined {
    return this.instances.get(id);
  }

  /** Handle usable by style plugins (setParameter only). */
  getHandle(id: string): { setParameter(name: string, value: number): void } | undefined {
    const inst = this.instances.get(id);
    if (!inst) return undefined;
    return { setParameter: (n, v) => inst.setParameter(n, v) };
  }

  /** Neutralise every FX (used when switching styles). */
  resetAll(): void {
    for (const fx of this.instances.values()) {
      try {
        fx.reset();
      } catch (err) {
        console.error('[FXRegistry] reset failed', err);
      }
    }
  }

  disposeAll(): void {
    for (const fx of this.instances.values()) {
      try {
        fx.dispose();
      } catch {
        /* ignore */
      }
    }
    this.instances.clear();
  }
}
