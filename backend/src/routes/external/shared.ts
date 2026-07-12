/**
 * Small helpers shared by the /api/v1 resource routers.
 */
import { Request } from 'express';

/** Clamp `?limit=` to 1..200 (default 50) and `?offset=` to >= 0 (default 0). */
export function parsePagination(req: Request): { limit: number; offset: number } {
  const limit = Math.min(Math.max(Number(req.query.limit) || 50, 1), 200);
  const offset = Math.max(Number(req.query.offset) || 0, 0);
  return { limit, offset };
}
