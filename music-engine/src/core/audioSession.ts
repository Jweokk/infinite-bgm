/**
 * iOS audio-output handling.
 *
 * iOS routes Web Audio through the *ringer* channel and lets the page's API
 * usage decide the AVAudioSession category. Two consequences bite music apps:
 *
 *  1. Category — `AudioContext` alone should map to `playback`, but the session
 *     can be left in `play-and-record` by other tabs/previous pages, which
 *     de-prioritises the built-in output (earpiece / attenuated / silent) while
 *     headphones keep working. Safari 16.4+ lets a page declare
 *     `navigator.audioSession.type = 'playback'` to put Web Audio back on the
 *     media route. See the "iOS WebAudio only works on headphones" class of
 *     reports — the symptom is "works on the computer, works in headphones, no
 *     sound from the phone's own speaker, while other sites are fine".
 *
 *  2. Ringer/silent switch — it mutes Web Audio but *not* `<audio>`/`<video>`,
 *     which is why "other sites have sound". The long-standing workaround
 *     (WebKit bug 196539; swevans/unmute) is to play one Web Audio source *and*
 *     one HTML5 media element inside the same user gesture: that moves Web Audio
 *     onto the media route, so it stays audible even with the switch on.
 *
 * Both are applied here, and both are no-ops outside of iOS/WebKit.
 */

/** ~60 ms of 8-bit silence — enough to satisfy the "play a media element" rule. */
const SILENT_WAV =
  'data:audio/wav;base64,UklGRgQCAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YeABAACAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIA=';

let silentElement: HTMLAudioElement | null = null;

/** The reusable hidden silent <audio> element used by the unlock gesture. */
export function silentMediaElement(): HTMLAudioElement | null {
  if (typeof document === 'undefined') return null;
  if (silentElement?.isConnected) return silentElement;
  try {
    const el = document.createElement('audio');
    el.src = SILENT_WAV;
    el.preload = 'auto';
    el.dataset.pmeSilent = '1';
    el.setAttribute('playsinline', '');
    el.setAttribute('aria-hidden', 'true');
    el.style.cssText = 'position:absolute;width:0;height:0;opacity:0;pointer-events:none';
    document.body.appendChild(el);
    silentElement = el;
    return el;
  } catch {
    return null;
  }
}

/**
 * Read-only lookup: reports the unlock element without creating it (the diag
 * panel polls this, and must not have side effects).
 */
export function silentMediaElementIfPresent(): HTMLAudioElement | null {
  if (typeof document === 'undefined') return null;
  if (silentElement?.isConnected) return silentElement;
  return document.querySelector<HTMLAudioElement>('audio[data-pme-silent]');
}

/**
 * Declare a `playback` audio session (Safari 16.4+): Web Audio then uses the
 * media route — the phone's loudspeaker, unaffected by the ring/silent switch.
 * Feature-detected; every other browser simply returns false.
 */
export function declarePlaybackAudioSession(
  nav: { audioSession?: { type?: string } } | null = typeof navigator !== 'undefined'
    ? (navigator as unknown as { audioSession?: { type?: string } })
    : null,
): boolean {
  try {
    if (!nav?.audioSession) return false;
    if (nav.audioSession.type !== 'playback') nav.audioSession.type = 'playback';
    return nav.audioSession.type === 'playback';
  } catch {
    return false;
  }
}

/**
 * Run inside a user gesture: play a silent Web Audio source plus a silent HTML5
 * media element so iOS keeps Web Audio on the audible media route (and off the
 * earpiece / ringer channel). Safe to call repeatedly.
 */
export function unlockIosAudioOutput(ctx: BaseAudioContext | null): boolean {
  let did = false;
  if (ctx) {
    try {
      const buffer = ctx.createBuffer(1, 1, 22050);
      const source = ctx.createBufferSource();
      source.buffer = buffer;
      source.connect(ctx.destination);
      source.onended = () => {
        try {
          source.disconnect();
        } catch {
          /* already detached */
        }
      };
      source.start(0);
      did = true;
    } catch {
      /* Web Audio unavailable */
    }
  }
  const el = silentMediaElement();
  if (el) {
    try {
      el.currentTime = 0;
      const played = el.play();
      if (played && typeof played.catch === 'function') played.catch(() => {});
      did = true;
    } catch {
      /* element refused playback */
    }
  }
  return did;
}
