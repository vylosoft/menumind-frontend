/**
 * Builds a URL for this app's own server routes (server.ts: /api/supabase/*, /api/gemini/*)
 * that also works when the app is hosted under a sub-path such as https://bongodelicacy.com/menumind/.
 * Vite sets BASE_URL from `base` in vite.config.ts / `--base` at build time.
 */
export const appUrl = (path: string): string => {
  const base = (import.meta.env.BASE_URL || '/').replace(/\/+$/, '');
  return `${base}${path.startsWith('/') ? path : `/${path}`}`;
};
