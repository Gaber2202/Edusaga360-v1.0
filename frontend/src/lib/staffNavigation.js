/**
 * Flatten role/module-filtered sidebar navigation into command-palette groups.
 * Each top-level nav item becomes a group; leaf pages (direct or nested) become entries.
 */
export function flattenNavigationForCommandPalette(items, t) {
  const groups = [];

  for (const item of items) {
    const entries = [];

    if (item.page) {
      entries.push({
        page: item.page,
        label: t(item.name),
        icon: item.icon,
        searchValue: [t(item.name), item.name, item.page].join(' '),
      });
    }

    for (const child of item.children || []) {
      if (!child.page) continue;
      entries.push({
        page: child.page,
        label: t(child.name),
        icon: child.icon,
        searchValue: [t(item.name), t(child.name), item.name, child.name, child.page].join(' '),
      });
    }

    if (entries.length > 0) {
      groups.push({
        group: t(item.name),
        items: entries,
      });
    }
  }

  return groups;
}

export default flattenNavigationForCommandPalette;
