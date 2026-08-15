// @vitest-environment happy-dom
import { describe, it, vi } from 'vitest';
import React from 'react';
import { renderToString } from 'react-dom/server';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';

const noopChain = {
  select: () => noopChain,
  eq: () => noopChain,
  order: () => noopChain,
  match: () => noopChain,
  limit: () => noopChain,
  single: () => Promise.resolve({ data: null, error: null }),
  maybeSingle: () => Promise.resolve({ data: null, error: null }),
  then: (onFulfilled) => onFulfilled({ data: [], error: null, count: null }),
};

vi.mock('../api/supabaseClient', () => ({
  supabase: { from: () => noopChain, rpc: () => Promise.resolve({ data: null, error: null }) },
  tenantQuery: () => noopChain,
  fetchData: async (q) => { const r = await q; return r?.data ?? r; },
  callApi: () => Promise.resolve({}),
  tenantTables: [],
  getTenantContext: () => ({ tenantId: 't1', isPlatformOwner: false, ready: true }),
  subscribeTenantContext: () => () => {},
  TenantContextNotReadyError: class TenantContextNotReadyError extends Error {},
}));

const mockTenant = {
  id: 't1',
  currency_code: 'USD',
  vat_rate: 0.15,
  localization: {
    currencyCode: 'USD',
    currencySymbol: { en: '$', ar: '$' },
    numberFormat: { locale: 'en-US', options: { minimumFractionDigits: 2, maximumFractionDigits: 2 } },
    dateFormat: { locale: 'en-US', options: { year: 'numeric', month: 'short', day: 'numeric' } },
    calendarSystems: ['gregorian'],
    textDirection: 'ltr',
  },
};

vi.mock('../components/TenantContext', () => ({
  useTenant: vi.fn(() => ({ tenant: mockTenant, loading: false, isModuleEnabled: () => true })),
  TenantProvider: ({ children }) => children,
}));

vi.mock('../components/LanguageContext', () => ({
  useLanguage: vi.fn(() => ({ t: (k) => String(k), isRTL: false })),
  LanguageProvider: ({ children }) => children,
}));

vi.mock('../components/BranchContext', () => ({
  useBranch: vi.fn(() => ({
    selectedBranchId: null,
    filterByBranch: (x) => x,
    branchFilter: () => ({}),
    branches: [],
  })),
  BranchProvider: ({ children }) => children,
}));

vi.mock('../components/RoleContext', () => ({
  useRole: vi.fn(() => ({
    user: { id: 'u1', tenant_id: 't1', role: 'admin', is_platform_owner: false },
    userRole: 'admin',
    currentUser: { id: 'u1', tenant_id: 't1', role: 'admin' },
    isCreator: () => false,
    hasPermission: () => true,
    canAccess: () => true,
  })),
  RoleProvider: ({ children }) => children,
}));

vi.mock('../hooks/useTenantFilter', () => ({
  useTenantFilter: vi.fn(() => ({
    tenantFilter: () => ({}),
    tenantId: 't1',
    hasTenantAccess: true,
    getTenantIdForCreate: 't1',
  })),
}));

vi.mock('../components/JurisdictionFeatureContext', () => ({
  useJurisdictionFeatures: vi.fn(() => ({
    isFeatureEnabled: () => true,
    areAnyEnabled: () => true,
    areAllEnabled: () => true,
    currencyCode: 'USD',
    jurisdiction: 'US',
    features: [],
    loading: false,
    error: null,
  })),
  JurisdictionFeatureProvider: ({ children }) => children,
}));

vi.mock('../lib/AuthContext', () => ({
  useAuth: vi.fn(() => ({ user: { id: 'u1' }, isAuthenticated: true, isLoadingAuth: false })),
  AuthProvider: ({ children }) => children,
}));

const pages = import.meta.glob('../pages/*.jsx', { eager: true });

function renderPage(Component) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const element = React.createElement(
    QueryClientProvider,
    { client: queryClient },
    React.createElement(
      MemoryRouter,
      null,
      React.createElement(Component),
    ),
  );
  return renderToString(element);
}

describe('Page smoke test', () => {
  for (const [path, module] of Object.entries(pages)) {
    const name = path.replace(/^.*\//, '').replace(/\.jsx$/, '');
    const Component = module.default || module[name];
    if (!Component || typeof Component !== 'function') continue;

    it(`renders ${name} without throwing`, () => {
      renderPage(Component);
    });
  }
});
