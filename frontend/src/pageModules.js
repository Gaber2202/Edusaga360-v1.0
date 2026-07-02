/**
 * Lazy page-module registry.
 *
 * import.meta.glob returns a map of path -> dynamic import() thunk WITHOUT
 * executing them, so each page compiles into its own chunk and is only fetched
 * when its route actually renders. This is what splits the former single ~4MB
 * bundle. Referencing `pageNames` (keys only) never triggers a load.
 */
const modules = import.meta.glob('./pages/*.jsx');

const PREFIX = './pages/';
const SUFFIX = '.jsx';

const nameFromPath = (p) => p.slice(PREFIX.length, -SUFFIX.length);

/** Page names (e.g. "Dashboard", "Fees") — safe to use without loading pages. */
export const pageNames = Object.keys(modules).map(nameFromPath);

/** Map of page name -> dynamic import() loader, for React.lazy(). */
export function getPageLoaders() {
  const map = {};
  for (const [path, loader] of Object.entries(modules)) {
    map[nameFromPath(path)] = loader;
  }
  return map;
}
