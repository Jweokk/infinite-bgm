import type { ParameterDefinition, ParamValue, Preset } from './types';

/**
 * Holds parameter values per style id. Values are initialised from plugin
 * defaults the first time a style is used, and survive style switches.
 */
export class ParameterManager {
  private values = new Map<string, Map<string, ParamValue>>();

  init(styleId: string, defs: ParameterDefinition[]): void {
    if (this.values.has(styleId)) return;
    const m = new Map<string, ParamValue>();
    for (const d of defs) m.set(d.id, d.default);
    this.values.set(styleId, m);
  }

  getAll(styleId: string): Record<string, ParamValue> {
    const m = this.values.get(styleId);
    const out: Record<string, ParamValue> = {};
    if (m) for (const [k, v] of m) out[k] = v;
    return out;
  }

  get(styleId: string, name: string): ParamValue | undefined {
    return this.values.get(styleId)?.get(name);
  }

  set(styleId: string, name: string, value: ParamValue): void {
    this.values.get(styleId)?.set(name, value);
  }

  applyPreset(styleId: string, preset: Preset): void {
    const m = this.values.get(styleId);
    if (!m) return;
    for (const [k, v] of Object.entries(preset.parameters)) m.set(k, v);
  }

  /** Reset a single style back to plugin defaults. */
  reset(styleId: string, defs: ParameterDefinition[]): void {
    this.values.delete(styleId);
    this.init(styleId, defs);
  }
}
