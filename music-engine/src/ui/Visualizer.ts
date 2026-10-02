import type { MusicEngine } from '../core/MusicEngine';

interface Pulse {
  x: number; // 0..1 horizontal position from pan
  y: number; // 0..1 start height
  age: number;
  strength: number;
  silence: boolean;
}

/**
 * Simple canvas visualizer: mirrored frequency bars, waveform line, event
 * pulse rings and a soft energy glow. Reads only the AudioAnalyser + engine
 * note events — no knowledge of styles.
 */
export class Visualizer {
  private canvas: HTMLCanvasElement;
  private ctx2d: CanvasRenderingContext2D;
  private engine: MusicEngine;
  private pulses: Pulse[] = [];
  private raf = 0;
  private accent = '#e8a04c';
  private accentDim = 'rgba(232,160,76,0.5)';
  /** Theme-dependent line colours, refreshed from CSS variables (see refreshPalette). */
  private lineColor = 'rgba(255,255,255,0.10)';
  private waveColor = 'rgba(255,255,255,0.35)';
  /** Raw RGB of the silence-pulse colour (alpha varies per frame). */
  private pulseRgb = { r: 255, g: 255, b: 255 };
  private freq = new Uint8Array(0);
  private wave = new Uint8Array(0);
  private running = false;

  constructor(canvas: HTMLCanvasElement, engine: MusicEngine) {
    this.canvas = canvas;
    this.ctx2d = canvas.getContext('2d')!;
    this.engine = engine;
    this.resize();

    if (typeof ResizeObserver !== 'undefined') {
      new ResizeObserver(() => this.resize()).observe(canvas);
    } else if (typeof window !== 'undefined') {
      window.addEventListener('resize', () => this.resize());
    }

    engine.eventBus.on('note', ({ event }) => {
      if (this.pulses.length > 48) return;
      this.pulses.push({
        x: 0.5 + (event.pan ?? 0) * 0.42,
        y: 0.45 + Math.random() * 0.25,
        age: 0,
        strength: 0.35 + (event.velocity ?? 0.5) * 0.65,
        silence: event.type === 'silence',
      });
    });

    if (typeof document !== 'undefined') {
      document.addEventListener('visibilitychange', () => {
        if (document.hidden) this.stop();
        else this.start();
      });
    }
  }

  setAccent(color: string): void {
    this.accent = color;
    const m = color.replace('#', '');
    if (m.length === 6) {
      const r = parseInt(m.slice(0, 2), 16);
      const g = parseInt(m.slice(2, 4), 16);
      const b = parseInt(m.slice(4, 6), 16);
      this.accentDim = `rgba(${r},${g},${b},0.45)`;
    }
  }

  /**
   * Re-read the theme's line colours from CSS custom properties. Called on
   * construction and on every theme switch, so the canvas follows the light /
   * dark palette (white-on-light would be invisible).
   */
  refreshPalette(): void {
    if (typeof getComputedStyle !== 'function' || typeof document === 'undefined') return;
    try {
      const styles = getComputedStyle(document.documentElement);
      const read = (name: string, fallback: string): string => {
        const v = styles.getPropertyValue(name).trim();
        return v || fallback;
      };
      this.lineColor = read('--viz-line', this.lineColor);
      this.waveColor = read('--viz-wave', this.waveColor);
      // --viz-pulse holds a bare "r, g, b" triple because the alpha is animated.
      const pulse = read('--viz-pulse', '').split(',').map((n) => Number(n.trim()));
      if (pulse.length === 3 && pulse.every((n) => Number.isFinite(n))) {
        this.pulseRgb = { r: pulse[0], g: pulse[1], b: pulse[2] };
      }
    } catch {
      /* keep the previous palette */
    }
  }

  private rgba(rgb: { r: number; g: number; b: number }, alpha: number): string {
    const a = Math.max(0, Math.min(1, alpha));
    return `rgba(${rgb.r},${rgb.g},${rgb.b},${a})`;
  }

  resize(): void {
    if (typeof this.canvas.getBoundingClientRect !== 'function') return;
    const dpr = Math.min(2, (typeof window !== 'undefined' && window.devicePixelRatio) || 1);
    const rect = this.canvas.getBoundingClientRect();
    this.canvas.width = Math.max(1, Math.floor(rect.width * dpr));
    this.canvas.height = Math.max(1, Math.floor(rect.height * dpr));
  }

  start(): void {
    if (this.running) return;
    this.running = true;
    const loop = () => {
      if (!this.running) return;
      this.draw();
      this.raf = requestAnimationFrame(loop);
    };
    this.raf = requestAnimationFrame(loop);
  }

  stop(): void {
    this.running = false;
    if (typeof cancelAnimationFrame === 'function') cancelAnimationFrame(this.raf);
  }

  private draw(): void {
    const { canvas, ctx2d } = this;
    const w = canvas.width;
    const h = canvas.height;
    ctx2d.clearRect(0, 0, w, h);

    const analyser = this.engine.getAnalyser();
    let energy = 0;
    if (analyser) {
      if (this.freq.length !== analyser.frequencyBinCount) {
        this.freq = new Uint8Array(analyser.frequencyBinCount);
        this.wave = new Uint8Array(analyser.fftSize);
      }
      analyser.getByteFrequencyData(this.freq);
      analyser.getByteTimeDomainData(this.wave);
      for (let i = 0; i < this.freq.length; i += 8) energy += this.freq[i];
      energy = Math.min(1, energy / (this.freq.length / 8) / 160);
    }

    // Frequency bars, mirrored around the center line.
    const bars = 42;
    const midY = h * 0.55;
    const gap = 2;
    const barW = (w - gap * (bars - 1)) / bars;
    for (let i = 0; i < bars; i++) {
      const idx = Math.floor(Math.pow(i / bars, 1.6) * (this.freq.length * 0.7));
      const v = this.freq.length ? this.freq[idx] / 255 : 0;
      const bh = Math.max(2, v * h * 0.38);
      ctx2d.fillStyle = i % 2 === 0 ? this.accentDim : this.lineColor;
      ctx2d.beginPath();
      ctx2d.roundRect(i * (barW + gap), midY - bh, barW, bh * 2, barW / 2);
      ctx2d.fill();
    }

    // Waveform line.
    if (this.wave.length) {
      ctx2d.strokeStyle = this.waveColor;
      ctx2d.lineWidth = 1.5;
      ctx2d.beginPath();
      const step = Math.floor(this.wave.length / 220);
      for (let i = 0, x = 0; i < 220; i++, x += w / 220) {
        const v = (this.wave[i * step] - 128) / 128;
        const y = h * 0.16 + v * h * 0.1;
        if (i === 0) ctx2d.moveTo(x, y);
        else ctx2d.lineTo(x, y);
      }
      ctx2d.stroke();
    }

    // Event pulse rings.
    const dt = 1 / 60;
    for (const p of this.pulses) p.age += dt;
    this.pulses = this.pulses.filter((p) => p.age < 2.2);
    for (const p of this.pulses) {
      const t = p.age / 2.2;
      const x = p.x * w;
      const y = p.y * h - t * h * 0.35;
      const r = (p.silence ? 10 : 6 + p.strength * 16) * (0.4 + t * 1.6);
      const alpha = (1 - t) * (p.silence ? 0.18 : 0.5);
      ctx2d.strokeStyle = p.silence ? this.rgba(this.pulseRgb, alpha * 0.5) : this.hexAlpha(alpha);
      ctx2d.lineWidth = p.silence ? 1 : 2;
      ctx2d.beginPath();
      ctx2d.arc(x, y, r, 0, Math.PI * 2);
      ctx2d.stroke();
    }

    // Soft glow driven by overall energy.
    if (energy > 0.02) {
      const grad = ctx2d.createRadialGradient(w / 2, h * 0.6, 0, w / 2, h * 0.6, w * 0.45);
      grad.addColorStop(0, this.hexAlpha(0.1 * energy));
      grad.addColorStop(1, 'rgba(0,0,0,0)');
      ctx2d.fillStyle = grad;
      ctx2d.fillRect(0, 0, w, h);
    }
  }

  private hexAlpha(a: number): string {
    const m = this.accent.replace('#', '');
    if (m.length === 6) {
      const r = parseInt(m.slice(0, 2), 16);
      const g = parseInt(m.slice(2, 4), 16);
      const b = parseInt(m.slice(4, 6), 16);
      return `rgba(${r},${g},${b},${Math.max(0, Math.min(1, a))})`;
    }
    return `rgba(255,255,255,${a})`;
  }
}
