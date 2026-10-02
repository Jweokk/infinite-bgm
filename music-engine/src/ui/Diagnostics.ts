import type { MusicEngine } from '../core/MusicEngine';
import { silentMediaElementIfPresent } from '../core/audioSession';
import { t } from '../i18n';
import type { Lang } from '../i18n';

/**
 * On-device audio self-test, opened with `?diag=1` (or `#diag`).
 *
 * Why it exists: "no sound on my phone but sound on the computer" cannot be
 * diagnosed from a desktop, and the failure can sit at any of three layers —
 * (1) the browser refused to unlock the AudioContext, (2) the audio graph is
 * producing nothing, (3) the graph is fine but iOS/Android is muting the output
 * (ring/silent switch, Bluetooth route, system volume). The panel separates
 * those by playing a test tone through the real master chain and reporting the
 * analyser peak measured while it sounds. Layer 3 is exactly "peak > 0 but
 * silent".
 */

export interface DiagnosticsHandle {
  /** Re-render the panel in another language (the App calls this on toggle). */
  setLang(lang: Lang): void;
  unmount(): void;
}

export function maybeMountDiagnostics(
  engine: MusicEngine,
  mount: HTMLElement,
  initialLang: Lang = 'zh',
): DiagnosticsHandle | null {
  if (typeof location === 'undefined' || typeof document === 'undefined') return null;
  const flag = `${location.search}${location.hash}`;
  if (!flag.includes('diag')) return null;

  let lang: Lang = initialLang;

  const panel = document.createElement('div');
  panel.id = 'diagPanel';
  panel.setAttribute('role', 'dialog');
  panel.style.cssText = [
    'position:fixed', 'z-index:2147483000', 'inset:10px 10px auto 10px',
    'background:rgba(11,14,20,0.94)', 'color:#e8ecf4',
    'border:1px solid rgba(255,255,255,0.18)', 'border-radius:14px',
    'padding:14px', 'font:13px/1.55 ui-monospace,SFMono-Regular,Menlo,Consolas,monospace',
    'max-height:86vh', 'overflow:auto', 'text-align:left', 'box-shadow:0 18px 60px rgba(0,0,0,0.55)',
  ].join(';');
  panel.innerHTML = `
    <div style="display:flex;align-items:center;justify-content:space-between;gap:10px">
      <strong id="diagTitle" style="font-size:14px"></strong>
      <button id="diagClose" type="button" style="appearance:none;border:1px solid rgba(255,255,255,0.25);background:transparent;color:inherit;border-radius:8px;padding:4px 10px;font:inherit;cursor:pointer"></button>
    </div>
    <pre id="diagOut" style="white-space:pre-wrap;word-break:break-word;margin:10px 0 12px;font:inherit"></pre>
    <div style="display:flex;flex-wrap:wrap;gap:8px">
      <button id="diagTone" type="button" style="appearance:none;border:0;border-radius:9px;padding:9px 12px;font:inherit;font-weight:600;cursor:pointer;background:#e8a04c;color:#12161f"></button>
      <button id="diagRoute" type="button" style="appearance:none;border:1px solid rgba(255,255,255,0.25);background:transparent;color:inherit;border-radius:9px;padding:9px 12px;font:inherit;cursor:pointer"></button>
      <button id="diagCopy" type="button" style="appearance:none;border:1px solid rgba(255,255,255,0.25);background:transparent;color:inherit;border-radius:9px;padding:9px 12px;font:inherit;cursor:pointer"></button>
    </div>
    <p id="diagVerdict" style="margin:12px 0 0;font-weight:600"></p>
  `;
  mount.appendChild(panel);

  const titleEl = panel.querySelector<HTMLElement>('#diagTitle')!;
  const closeEl = panel.querySelector<HTMLButtonElement>('#diagClose')!;
  const toneEl = panel.querySelector<HTMLButtonElement>('#diagTone')!;
  const routeEl = panel.querySelector<HTMLButtonElement>('#diagRoute')!;
  const copyEl = panel.querySelector<HTMLButtonElement>('#diagCopy')!;
  const out = panel.querySelector<HTMLPreElement>('#diagOut')!;
  const verdict = panel.querySelector<HTMLParagraphElement>('#diagVerdict')!;
  let lastClock = -1;
  let advanced = false;
  let lastReport = '';

  const nav = navigator as unknown as {
    audioSession?: { type?: string };
    wakeLock?: unknown;
    mediaSession?: unknown;
    userAgent: string;
  };

  /** Static labels follow the UI language. */
  const applyLabels = (): void => {
    titleEl.textContent = t(lang, 'diag.title');
    panel.setAttribute('aria-label', t(lang, 'diag.title'));
    closeEl.textContent = t(lang, 'diag.close');
    toneEl.textContent = t(lang, 'diag.tone');
    routeEl.textContent = t(lang, 'diag.route');
    copyEl.textContent = t(lang, 'diag.copy');
  };

  const factLines = (): string[] => {
    const d = engine.audioDiagnostics();
    const clock = Number(d.clock);
    if (lastClock >= 0 && clock > lastClock) advanced = true;
    lastClock = clock;
    const el = silentMediaElementIfPresent();
    const pad = (label: string): string => label.padEnd(lang === 'zh' ? 10 : 20, ' ');
    return [
      `${pad(t(lang, 'diag.fact.platform'))}${nav.userAgent.slice(0, 78)}`,
      `${pad(t(lang, 'diag.fact.session'))}${
        nav.audioSession ? `navigator.audioSession.type = ${nav.audioSession.type}` : t(lang, 'diag.sessionNa')
      }`,
      `${pad(t(lang, 'diag.fact.unlock'))}${
        el
          ? `readyState=${el.readyState} ${el.paused ? t(lang, 'diag.unlockPaused') : t(lang, 'diag.unlockPlaying')}`
          : t(lang, 'diag.unlockNone')
      }`,
      `${pad(t(lang, 'diag.fact.ctx'))}${
        d.contextCreated ? `state=${d.ctxState}  sampleRate=${d.sampleRate}` : t(lang, 'diag.ctxNone')
      }`,
      `${pad(t(lang, 'diag.fact.clock'))}${clock}s ${advanced ? t(lang, 'diag.clockAdvanced') : t(lang, 'diag.clockStuck')}`,
      `${pad(t(lang, 'diag.fact.peak'))}${d.analyserPeak} ${
        Number(d.analyserPeak) > 0 ? t(lang, 'diag.peakOk') : t(lang, 'diag.peakSilent')
      }`,
      `${pad(t(lang, 'diag.fact.volume'))}${d.masterVolume}    ${t(lang, 'diag.fact.engine')} ${d.status}`,
      `${pad(t(lang, 'diag.fact.styleSeed'))}${d.styleId} / ${d.seed}`,
      `${pad(t(lang, 'diag.fact.apis'))}wakeLock=${'wakeLock' in nav}  mediaSession=${'mediaSession' in nav}`,
      `${pad(t(lang, 'diag.fact.lastError'))}${
        (window as unknown as { __lastError?: string }).__lastError ?? t(lang, 'diag.none')
      }`,
    ];
  };

  const refresh = (): void => {
    lastReport = factLines().join('\n');
    out.textContent = lastReport;
  };

  const timer = setInterval(refresh, 1000);

  closeEl.addEventListener('click', () => {
    clearInterval(timer);
    panel.remove();
  });

  copyEl.addEventListener('click', () => {
    const text = `${lastReport}\n\n${verdict.textContent || t(lang, 'diag.untested')}`;
    void (async () => {
      try {
        await navigator.clipboard.writeText(text);
        verdict.textContent = t(lang, 'diag.copied');
        setTimeout(() => (verdict.textContent = ''), 2000);
      } catch {
        const range = document.createRange();
        range.selectNodeContents(out);
        const sel = window.getSelection();
        sel?.removeAllRanges();
        sel?.addRange(range);
        verdict.textContent = t(lang, 'diag.copiedManual');
      }
    })();
  });

  toneEl.addEventListener('click', () => {
    verdict.textContent = t(lang, 'diag.testing');
    void (async () => {
      const { ran, graphPeak } = await engine.testTone();
      refresh();
      if (!ran) verdict.textContent = t(lang, 'diag.errNoCtx');
      else if (graphPeak === 0) verdict.textContent = t(lang, 'diag.errSilent');
      else verdict.textContent = t(lang, 'diag.ok', { peak: graphPeak });
    })();
  });

  routeEl.addEventListener('click', () => {
    const did = engine.retryAudioRoute();
    refresh();
    verdict.textContent = did ? t(lang, 'diag.routeOk') : t(lang, 'diag.routeFail');
  });

  applyLabels();
  refresh();

  return {
    setLang(next: Lang): void {
      lang = next;
      applyLabels();
      refresh();
    },
    unmount(): void {
      clearInterval(timer);
      panel.remove();
    },
  };
}
