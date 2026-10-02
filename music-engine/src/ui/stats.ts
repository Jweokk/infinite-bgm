import type { Lang, Theme } from '../i18n';

export interface VisitCounts {
  /** Page views (every page load counts). */
  views: number;
  /** Distinct visitors (unique IP hash). */
  visitors: number;
  /** Page views recorded today (server-local date). */
  today: number;
}

/**
 * Tells the visit counter that this page was opened, and gets the running
 * totals back for the footer.
 *
 * The app is a static site with no backend of its own: if `/api/hit` is missing
 * (local `npm run dev`, or the counter service is down) this simply resolves to
 * `null` and the footer hides the counter. Nothing else depends on it.
 */
export async function reportVisit(meta: { lang: Lang; theme: Theme }): Promise<VisitCounts | null> {
  try {
    const res = await fetch('/api/hit', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      cache: 'no-store',
      keepalive: true,
      body: JSON.stringify({
        lang: meta.lang,
        theme: meta.theme,
        path: typeof location !== 'undefined' ? location.pathname : '/',
        ref: typeof document !== 'undefined' ? document.referrer || '' : '',
        screen:
          typeof window !== 'undefined' ? `${window.screen?.width ?? 0}x${window.screen?.height ?? 0}` : '',
        tz: Intl.DateTimeFormat().resolvedOptions().timeZone ?? '',
      }),
    });
    if (!res.ok) return null;
    const data = (await res.json()) as Partial<VisitCounts>;
    if (typeof data?.views !== 'number' || typeof data?.visitors !== 'number') return null;
    return { views: data.views, visitors: data.visitors, today: Number(data.today ?? 0) };
  } catch {
    return null; // no counter service — the site works exactly as before
  }
}
