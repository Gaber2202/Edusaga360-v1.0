/**
 * Reusable Supabase client stub for backend route/integration tests.
 *
 * Why this exists
 * ---------------
 * EduSaga 360 route handlers chain many PostgREST calls per request
 * (`from().select().eq()...single()`), and several are `await`-ed directly
 * without a terminal `.single()` (e.g. `await supabase.from('x').insert(y)`
 * or inside `Promise.all([...])`). The minimal per-test `makeQB` factories used
 * by the original tests require you to enumerate every call in exact order with
 * `mockReturnValueOnce`, which is brittle and couples tests to call ordering.
 *
 * This stub instead returns a fully chainable, *thenable* query builder whose
 * resolved `{ data, error, count }` is decided by a single resolver function
 * keyed on the QueryContext (table + operation + filters). That makes tests:
 *   - order-independent  (resolver keys on table/op, not call sequence)
 *   - idempotent         (no shared mutable fixture rows)
 *   - able to assert multi-tenant isolation (every query's filters are recorded)
 *
 * It deliberately mirrors only the slice of the supabase-js surface the routes
 * use. Extend CHAIN_METHODS if a handler starts using a new PostgREST filter.
 */
import { vi } from 'vitest';
import type { RequestHandler } from 'express';

export interface SupabaseResult {
  data?: unknown;
  error?: unknown;
  count?: number | null;
}

export interface QueryContext {
  /** Table name passed to `.from()`. */
  table: string;
  /** First mutating operation wins; defaults to 'select'. */
  op: 'select' | 'insert' | 'update' | 'upsert' | 'delete';
  /** `.select('*', { head: true })` — used for `count: 'exact'` head queries. */
  head: boolean;
  /** `.select('*', { count: 'exact' })`. */
  count: boolean;
  /** Whether the chain terminated in `.single()` / `.maybeSingle()`. */
  single: boolean;
  /** Payload handed to insert/update/upsert. */
  payload?: unknown;
  /** Ordered record of every filter method invoked, e.g. eq('tenant_id', 'A'). */
  filters: Array<{ method: string; args: unknown[] }>;
}

export type Resolver = (ctx: QueryContext) => SupabaseResult | undefined;

/** A recorded `supabase.rpc(fn, params)` call. */
export interface RpcCall {
  fn: string;
  params?: unknown;
}

/** Resolves the `{ data, error }` returned by a mocked `.rpc()` call. */
export type RpcResolver = (fn: string, params?: unknown) => SupabaseResult | undefined;

// PostgREST filter / modifier methods that simply return the builder for chaining.
const CHAIN_METHODS = [
  'eq', 'neq', 'gt', 'gte', 'lt', 'lte', 'like', 'ilike', 'in', 'is',
  'or', 'and', 'not', 'contains', 'containedBy', 'order', 'limit', 'range',
  'filter', 'match', 'overlaps', 'textSearch', 'returns',
] as const;

function makeBuilder(table: string, getResolver: () => Resolver): Record<string, unknown> {
  const ctx: QueryContext = {
    table,
    op: 'select',
    head: false,
    count: false,
    single: false,
    filters: [],
  };

  const resolve = (): Required<SupabaseResult> => {
    const r = getResolver()(ctx) ?? {};
    return {
      data: r.data ?? null,
      error: r.error ?? null,
      count: r.count ?? null,
    };
  };

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const builder: any = { __ctx: ctx };

  // `.select()` never changes op (so insert().select().single() stays 'insert').
  builder.select = vi.fn((_columns?: unknown, opts?: { head?: boolean; count?: string }) => {
    if (opts?.head) ctx.head = true;
    if (opts?.count) ctx.count = true;
    return builder;
  });

  builder.insert = vi.fn((payload: unknown) => { ctx.op = 'insert'; ctx.payload = payload; return builder; });
  builder.update = vi.fn((payload: unknown) => { ctx.op = 'update'; ctx.payload = payload; return builder; });
  builder.upsert = vi.fn((payload: unknown) => { ctx.op = 'upsert'; ctx.payload = payload; return builder; });
  builder.delete = vi.fn(() => { ctx.op = 'delete'; return builder; });

  for (const method of CHAIN_METHODS) {
    builder[method] = vi.fn((...args: unknown[]) => {
      ctx.filters.push({ method, args });
      return builder;
    });
  }

  // Terminal methods that produce a single row.
  builder.single = vi.fn(() => { ctx.single = true; return Promise.resolve(resolve()); });
  builder.maybeSingle = vi.fn(() => { ctx.single = true; return Promise.resolve(resolve()); });

  // Make the builder awaitable for queries that don't end in `.single()`.
  builder.then = (onFulfilled?: (v: Required<SupabaseResult>) => unknown, onRejected?: (e: unknown) => unknown) =>
    Promise.resolve(resolve()).then(onFulfilled, onRejected);
  builder.catch = (onRejected?: (e: unknown) => unknown) =>
    Promise.resolve(resolve()).catch(onRejected);

  return builder;
}

export interface SupabaseStub {
  /** Object to hand back from the mocked `createClient()`. */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  client: any;
  auth: {
    getUser: ReturnType<typeof vi.fn>;
    admin: { createUser: ReturnType<typeof vi.fn> };
  };
  from: ReturnType<typeof vi.fn>;
  rpc: ReturnType<typeof vi.fn>;
  /** Live QueryContext for every `.from()` made since the last reset. */
  calls: QueryContext[];
  /** Every `.rpc()` call made since the last reset. */
  rpcCalls: RpcCall[];
  setResolver: (resolver: Resolver) => void;
  /** Decide what a `.rpc(fn, params)` call resolves to (default: no-op success). */
  setRpcResolver: (resolver: RpcResolver) => void;
  reset: () => void;
  /** All recorded contexts for a given table. */
  filtersFor: (table: string) => QueryContext[];
  /** All recorded `.rpc()` calls for a given function name. */
  rpcCallsFor: (fn: string) => RpcCall[];
  /** True if every query against `table` was scoped by eq('tenant_id', tenantId). */
  everyQueryScopedToTenant: (table: string, tenantId: string) => boolean;
}

/**
 * Build a Supabase stub. Pass a resolver (or set one later via setResolver)
 * that maps a QueryContext to the `{ data, error, count }` it should return.
 */
export function createSupabaseStub(initialResolver: Resolver = () => ({})): SupabaseStub {
  let resolver = initialResolver;
  const initialRpcResolver: RpcResolver = () => ({});
  let rpcResolver = initialRpcResolver;
  const calls: QueryContext[] = [];
  const rpcCalls: RpcCall[] = [];

  const from = vi.fn((table: string) => {
    const builder = makeBuilder(table, () => resolver);
    calls.push((builder as { __ctx: QueryContext }).__ctx);
    return builder;
  });

  // Postgres function calls (e.g. post_journal). Records the call and resolves
  // via the rpc resolver — defaults to a no-op success so best-effort callers
  // that ignore the result keep working without extra test setup.
  const rpc = vi.fn((fn: string, params?: unknown) => {
    rpcCalls.push({ fn, params });
    const r = rpcResolver(fn, params) ?? {};
    return Promise.resolve({ data: r.data ?? null, error: r.error ?? null });
  });

  const auth = {
    getUser: vi.fn(),
    admin: { createUser: vi.fn() },
  };

  return {
    client: { from, auth, rpc },
    auth,
    from: from as unknown as ReturnType<typeof vi.fn>,
    rpc: rpc as unknown as ReturnType<typeof vi.fn>,
    calls,
    rpcCalls,
    setResolver: (r: Resolver) => { resolver = r; },
    setRpcResolver: (r: RpcResolver) => { rpcResolver = r; },
    reset: () => {
      calls.length = 0;
      rpcCalls.length = 0;
      resolver = initialResolver;
      rpcResolver = initialRpcResolver;
    },
    filtersFor: (table: string) => calls.filter((c) => c.table === table),
    rpcCallsFor: (fn: string) => rpcCalls.filter((c) => c.fn === fn),
    everyQueryScopedToTenant: (table: string, tenantId: string) => {
      const tableCalls = calls.filter((c) => c.table === table);
      if (tableCalls.length === 0) return false;
      return tableCalls.every((c) =>
        c.filters.some((f) => f.method === 'eq' && f.args[0] === 'tenant_id' && f.args[1] === tenantId),
      );
    },
  };
}

/**
 * Express middleware that injects a fake authenticated user, so routers can be
 * mounted in isolation (mirrors the real authMiddleware output shape).
 */
export function injectUser(user: Record<string, unknown>): RequestHandler {
  return (req, _res, next) => {
    (req as unknown as { user?: unknown }).user = user;
    next();
  };
}
