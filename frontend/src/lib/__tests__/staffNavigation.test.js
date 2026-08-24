import { describe, it, expect } from 'vitest';
import { flattenNavigationForCommandPalette } from '../staffNavigation';

const t = (key) => ({ storeManagement: 'School Store', storeOrders: 'Store Orders', canteenManagement: 'Canteen' }[key] || key);

describe('flattenNavigationForCommandPalette', () => {
  it('includes nested pages under their parent group', () => {
    const nav = [
      {
        name: 'storeManagement',
        icon: null,
        children: [
          { name: 'storeManagement', page: 'StoreManagement', icon: null },
          { name: 'storeOrders', page: 'StoreOrders', icon: null },
        ],
      },
    ];

    const groups = flattenNavigationForCommandPalette(nav, t);
    expect(groups).toHaveLength(1);
    expect(groups[0].group).toBe('School Store');
    expect(groups[0].items.map((i) => i.page)).toEqual(['StoreManagement', 'StoreOrders']);
  });

  it('includes top-level pages without children', () => {
    const nav = [{ name: 'dashboard', page: 'Dashboard', icon: null }];
    const groups = flattenNavigationForCommandPalette(nav, t);
    expect(groups[0].items[0].page).toBe('Dashboard');
  });

  it('skips groups with no routable pages', () => {
    const nav = [{ name: 'empty', icon: null, children: [{ name: 'noPage', icon: null }] }];
    expect(flattenNavigationForCommandPalette(nav, t)).toHaveLength(0);
  });
});
