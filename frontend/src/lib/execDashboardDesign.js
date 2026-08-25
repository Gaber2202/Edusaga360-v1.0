/**
 * Executive Command Center — unified design tokens (21st.dev / Advanced Stats pattern).
 * Single source of truth for all persona dashboards (CEO, CFO, COO, CHRO, Principal, Administrator).
 */

export const EXEC_COLORS = {
  najdi: '#0E6B4F',
  green: '#16A077',
  amber: '#E0A82E',
  red: '#D1493F',
  purple: '#8B5CF6',
  gold: '#C8A451',
  info: '#2C7BB0',
  ink: '#1C2420',
};

export const EXEC_PIE_COLORS = [
  EXEC_COLORS.najdi,
  EXEC_COLORS.green,
  EXEC_COLORS.gold,
  EXEC_COLORS.red,
  EXEC_COLORS.purple,
];

export const EXEC_PILLAR_COLORS = {
  retention: EXEC_COLORS.najdi,
  engagement: EXEC_COLORS.info,
  collection: EXEC_COLORS.gold,
  growth: EXEC_COLORS.green,
  financial: EXEC_COLORS.purple,
};

/** Persona hero gradient presets */
export const EXEC_HERO = {
  ceo: 'from-najdi-900 via-[#0a5a42] to-najdi-900',
  cfo: 'from-emerald-900 via-najdi-900 to-[#0a5a42]',
  coo: 'from-slate-800 via-najdi-900 to-[#0a5a42]',
  chro: 'from-violet-900 via-indigo-900 to-najdi-900',
  principal: 'from-najdi-900 via-[#0a5a42] to-najdi-800',
  administrator: 'from-sky-900 via-[#1e5a8a] to-sky-800',
};

export const execLayout = {
  page: 'space-y-6',
  kpiGrid: 'grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4',
  kpiGridWide: 'grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-4',
  chartGrid: 'grid grid-cols-1 md:grid-cols-2 gap-4',
  chartGrid3: 'grid grid-cols-1 md:grid-cols-3 gap-4',
};

export const execCard = {
  section: 'border border-border/60 bg-white shadow-sm rounded-xl overflow-hidden',
  sectionHeader: 'pb-2',
  sectionTitle: 'text-base font-semibold text-ink',
  panel: 'rounded-xl border border-border/60 bg-sand-alt/40 p-4',
  outcome: 'relative overflow-hidden rounded-xl border border-border/60 bg-gradient-to-br from-white to-sand-alt/80 p-4 text-center shadow-sm',
};
