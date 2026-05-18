/**
 * Navigate via full page reload while forwarding the Base44 access token
 * as a URL query parameter.
 *
 * `app-params.js` reads the token once at module load from either the URL
 * (`?access_token=…`) or localStorage. After operations that may leave the
 * localStorage copy stale (e.g. `completeSetupFromToken` rotating the
 * session), explicitly passing the token in the URL guarantees the next
 * page boots authenticated. `app-params.js` consumes the param with
 * `removeFromUrl: true`, so the URL bar stays clean.
 */
export default function navigateWithToken(targetPath) {
  if (typeof window === 'undefined') return;
  let token = null;
  try {
    token = window.localStorage.getItem('supabase_access_token');
  } catch {
    token = null;
  }
  if (!token) {
    window.location.href = targetPath;
    return;
  }
  const sep = targetPath.includes('?') ? '&' : '?';
  window.location.href = `${targetPath}${sep}access_token=${encodeURIComponent(token)}`;
}
