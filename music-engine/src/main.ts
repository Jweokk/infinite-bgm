import './ui/styles.css';
import { MusicEngine } from './core/MusicEngine';
import { DEFAULT_LOOKAHEAD } from './core/Scheduler';
import type { EngineConfig } from './core/types';
import { builtinInstrumentPlugins } from './instruments';
import { builtinFXPlugins } from './fx';
import { lofiPlugin } from './styles/lofi';
import { zenPlugin } from './styles/zen';
import { jazzhopPlugin } from './styles/jazzhop';
import { meditationPlugin } from './styles/meditation';
import { ambientPlugin } from './styles/ambient';
import { japanesePlugin } from './styles/japanese';
import { naturePlugin } from './styles/nature';
import { sleepPlugin } from './styles/sleep';
import { cinematicPlugin } from './styles/cinematic';
import { minimalPlugin } from './styles/minimal';
import { dreamPlugin } from './styles/dream';
import { synthwavePlugin } from './styles/synthwave';
import { deepHousePlugin } from './styles/deephouse';
import { neoClassicalPlugin } from './styles/neoclassical';
import { chiptunePlugin } from './styles/chiptune';
import { darkAmbientPlugin } from './styles/darkambient';
import { App } from './ui/App';
import { detectTheme, prefersDarkScheme } from './i18n';

/**
 * Set the theme on <html> before the first paint, so a light-mode visitor never
 * sees a dark flash (all colours hang off :root variables).
 */
function applyInitialTheme(): void {
  try {
    const raw = localStorage.getItem('pme:prefs');
    const prefs = raw ? JSON.parse(raw) : {};
    const stored = typeof prefs.theme === 'string' ? prefs.theme : undefined;
    document.documentElement.dataset.theme = detectTheme({
      stored,
      prefersDark: prefersDarkScheme(),
    });
  } catch {
    document.documentElement.dataset.theme = 'dark';
  }
}
applyInitialTheme();

function initialConfig(): EngineConfig {
  let style: string | undefined;
  let seed: string | undefined;
  let volume: number | undefined;
  try {
    const raw = localStorage.getItem('pme:prefs');
    if (raw) {
      const prefs = JSON.parse(raw);
      // Only trust well-formed prefs — a corrupted entry must not brick the UI.
      if (typeof prefs.style === 'string' && prefs.style) style = prefs.style;
      if (typeof prefs.seed === 'string' || typeof prefs.seed === 'number') seed = String(prefs.seed);
      const v = Number(prefs.volume);
      if (Number.isFinite(v)) volume = Math.min(1, Math.max(0, v));
    }
  } catch {
    /* ignore */
  }
  return {
    style: style ?? 'lofi',
    seed,
    masterVolume: volume ?? 0.8,
    lookAhead: DEFAULT_LOOKAHEAD,
    scheduleInterval: 25,
    generationHorizon: 18,
    generationChunk: 9,
  };
}

const engine = new MusicEngine(initialConfig());

for (const instrument of builtinInstrumentPlugins()) engine.registerInstrument(instrument);
for (const fx of builtinFXPlugins()) engine.registerFX(fx);

// Styles are pure plugins — registering more never touches Core.
engine.registerStyle(lofiPlugin);
engine.registerStyle(zenPlugin);
engine.registerStyle(jazzhopPlugin);
engine.registerStyle(meditationPlugin);
engine.registerStyle(ambientPlugin);
engine.registerStyle(japanesePlugin);
engine.registerStyle(naturePlugin);
engine.registerStyle(sleepPlugin);
engine.registerStyle(cinematicPlugin);
engine.registerStyle(minimalPlugin);
engine.registerStyle(dreamPlugin);
engine.registerStyle(synthwavePlugin);
engine.registerStyle(deepHousePlugin);
engine.registerStyle(neoClassicalPlugin);
engine.registerStyle(chiptunePlugin);
engine.registerStyle(darkAmbientPlugin);

const mount = document.getElementById('app')!;
try {
  new App(engine, mount);
  // After the UI is listening: make sure a style is active even if the stored
  // one no longer exists (falls back + tells the user via a toast).
  engine.ensureStyleSelected();
} catch (err) {
  console.error('[main] App failed', err);
  (window as any).__appError = String(err && (err as Error).stack ? (err as Error).stack : err);
}

// Debug/testing handle + global error surface.
(window as any).__engine = engine;
(window as any).__lastError = null;
window.addEventListener('error', (e) => {
  (window as any).__lastError = String(e.message);
});
window.addEventListener('unhandledrejection', (e) => {
  (window as any).__lastError = `unhandled: ${String(e.reason)}`;
});
