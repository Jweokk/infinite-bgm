import type { MusicEngine } from '../core/MusicEngine';
import type { ParameterDefinition } from '../core/types';

/**
 * Renders the parameter controls of the current style plugin from its
 * ParameterDefinition schema — the UI never branches on style ids (PRD §50).
 */
export class ParameterPanel {
  private container: HTMLElement;
  private engine: MusicEngine;
  private defs: ParameterDefinition[] = [];
  /** Localized tooltips for the ⚡/⏳ scope markers, supplied by the UI layer. */
  private scopeTitles: { fx: string; generative: string } = {
    fx: '即时生效',
    generative: '约 10–25 秒后随生成缓冲自然融入',
  };
  private controls = new Map<string, { input: HTMLInputElement | HTMLSelectElement; def: ParameterDefinition; valueEl?: HTMLElement }>();

  constructor(container: HTMLElement, engine: MusicEngine) {
    this.container = container;
    this.engine = engine;
  }

  /** Called by the App whenever the language changes. */
  setScopeTitles(fx: string, generative: string): void {
    this.scopeTitles = { fx, generative };
  }

  private scopeTitle(scope: ParameterDefinition['scope']): string {
    return scope === 'fx' ? this.scopeTitles.fx : this.scopeTitles.generative;
  }

  setDefinitions(defs: ParameterDefinition[]): void {
    // sessionPurpose is hoisted into the top control row — skip it here.
    const shown = defs.filter((d) => d.id !== 'sessionPurpose');
    this.defs = shown;
    this.controls.clear();
    this.container.innerHTML = '';
    const values = this.engine.getParameters();

    for (const def of shown) {
      const row = document.createElement('div');
      row.className = `param-row${def.category === 'advanced' ? ' advanced' : ''}`;

      if (def.type === 'select') {
        const scopeIcon = def.scope === 'fx' ? '⚡' : '⏳';
        const scopeTitle = this.scopeTitle(def.scope);
        row.innerHTML = `
          <div class="param-top"><span class="param-name">${def.name}<span class="scope" title="${scopeTitle}">${scopeIcon}</span></span></div>`;
        const select = document.createElement('select');
        select.className = 'ctl';
        for (const opt of def.options ?? []) {
          const o = document.createElement('option');
          o.value = opt.value;
          o.textContent = opt.label;
          select.appendChild(o);
        }
        select.value = String(values[def.id] ?? def.default);
        select.addEventListener('change', () => this.engine.setParameter(def.id, select.value));
        row.appendChild(select);
        this.controls.set(def.id, { input: select, def });
      } else if (def.type === 'boolean') {
        const label = document.createElement('label');
        label.className = 'switch';
        const input = document.createElement('input');
        input.type = 'checkbox';
        input.checked = Boolean(values[def.id] ?? def.default);
        input.addEventListener('change', () => this.engine.setParameter(def.id, input.checked));
        const track = document.createElement('span');
        track.className = 'track';
        const name = document.createElement('span');
        name.textContent = def.name;
        label.append(input, track, name);
        row.appendChild(label);
        this.controls.set(def.id, { input, def });
      } else {
        // range / number → slider
        const min = def.min ?? 0;
        const max = def.max ?? 1;
        const value = Number(values[def.id] ?? def.default);
        const scopeTitle = this.scopeTitle(def.scope);
        const scopeIcon = def.scope === 'fx' ? '⚡' : '⏳';
        row.innerHTML = `
          <div class="param-top">
            <span class="param-name">${def.name}</span>
            <span class="param-value"><span class="val"></span><span class="scope" title="${scopeTitle}">${scopeIcon}</span></span>
          </div>`;
        const input = document.createElement('input');
        input.type = 'range';
        input.min = String(min);
        input.max = String(max);
        input.step = String(def.step ?? (max - min) / 100);
        input.value = String(value);
        const valueEl = row.querySelector<HTMLElement>('.val')!;
        const paint = (v: number) => {
          valueEl.textContent = def.percent
            ? `${Math.round(((v - min) / (max - min)) * 100)}%`
            : def.unit
              ? `${Math.round(v)} ${def.unit}`
              : String(Math.round(v * 100) / 100);
          input.style.setProperty('--fill', `${((v - min) / (max - min)) * 100}%`);
        };
        paint(value);
        input.addEventListener('input', () => {
          const v = Number(input.value);
          paint(v);
          this.engine.setParameter(def.id, v);
        });
        row.appendChild(input);
        this.controls.set(def.id, { input, def, valueEl: undefined });
        (this.controls.get(def.id) as any).paint = paint;
      }

      this.container.appendChild(row);
    }
  }

  /** Refresh control positions from engine values (e.g. after a preset). */
  refreshValues(): void {
    const values = this.engine.getParameters();
    for (const [id, c] of this.controls) {
      const v = values[id] ?? c.def.default;
      if (c.input instanceof HTMLSelectElement) c.input.value = String(v);
      else if (c.input.type === 'checkbox') c.input.checked = Boolean(v);
      else {
        c.input.value = String(Number(v));
        const paint = (c as any).paint as ((v: number) => void) | undefined;
        if (paint) {
          paint(Number(v));
        }
      }    }
  }

  setShowAdvanced(show: boolean): void {
    this.container.classList.toggle('show-advanced', show);
  }
}
