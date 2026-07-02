import { Router } from 'express';
import { supabase } from '../lib/supabase.js';
import { z } from 'zod';
import { AuthenticatedRequest } from '../middleware/auth.js';
import { sanitizeSearchTerm } from '../lib/sanitize.js';

export const marketplaceRouter = Router();


const CATEGORIES = ['books', 'uniforms', 'technology', 'maintenance', 'catering', 'transport', 'hr_services', 'other'] as const;

const ReviewSchema = z.object({
  vendor_id: z.string().uuid(),
  rating:    z.number().int().min(1).max(5),
  comment:   z.string().max(1000).optional(),
});

const ProcurementSchema = z.object({
  vendor_id:       z.string().uuid().optional(),
  title:           z.string().min(1).max(200),
  description:     z.string().max(2000).optional(),
  category:        z.string().max(50).optional(),
  estimated_value: z.number().min(0).optional(),
});

// ─── GET /api/marketplace/vendors — browse vendor directory ──────────────────

marketplaceRouter.get('/vendors', async (req: AuthenticatedRequest, res) => {
  const { category, search, verified } = req.query as Record<string, string>;

  let q = supabase
    .from('marketplace_vendors')
    .select('id, name_en, name_ar, category, description_en, description_ar, city, logo_url, is_verified, avg_rating, review_count, website, phone, email')
    .eq('is_active', true)
    .order('is_verified', { ascending: false })
    .order('avg_rating', { ascending: false })
    .limit(100);

  if (category)             q = q.eq('category', category);
  if (verified === 'true')  q = q.eq('is_verified', true);
  if (search) {
    const safe = sanitizeSearchTerm(search);
    if (safe) q = q.or(`name_en.ilike.%${safe}%,name_ar.ilike.%${safe}%,description_en.ilike.%${safe}%`);
  }

  const { data, error } = await q;
  if (error) return res.status(500).json({ error: error.message });

  return res.json({
    vendors:    data ?? [],
    categories: CATEGORIES,
  });
});

// ─── GET /api/marketplace/vendors/:id ────────────────────────────────────────

marketplaceRouter.get('/vendors/:id', async (req: AuthenticatedRequest, res) => {
  const { data: vendor, error } = await supabase
    .from('marketplace_vendors')
    .select('*')
    .eq('id', req.params.id)
    .eq('is_active', true)
    .single();

  if (error || !vendor) return res.status(404).json({ error: 'Vendor not found' });

  const { data: reviews } = await supabase
    .from('marketplace_reviews')
    .select('rating, comment, created_at')
    .eq('vendor_id', req.params.id)
    .order('created_at', { ascending: false })
    .limit(20);

  return res.json({ vendor, reviews: reviews ?? [] });
});

// ─── POST /api/marketplace/reviews — submit a review ─────────────────────────

marketplaceRouter.post('/reviews', async (req: AuthenticatedRequest, res) => {
  const parsed = ReviewSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'Validation failed', errors: parsed.error.flatten() });

  const tenant_id = req.user!.tenant_id!;
  const { vendor_id, rating, comment } = parsed.data;

  // Upsert — one review per tenant per vendor
  const { data, error } = await supabase
    .from('marketplace_reviews')
    .upsert({ vendor_id, tenant_id, rating, comment: comment ?? null }, { onConflict: 'vendor_id,tenant_id' })
    .select()
    .single();

  if (error) return res.status(500).json({ error: error.message });

  // Recompute avg_rating for this vendor
  const { data: allReviews } = await supabase
    .from('marketplace_reviews')
    .select('rating')
    .eq('vendor_id', vendor_id);

  if (allReviews && allReviews.length > 0) {
    const newAvg = allReviews.reduce((s, r) => s + r.rating, 0) / allReviews.length;
    await supabase
      .from('marketplace_vendors')
      .update({ avg_rating: Math.round(newAvg * 100) / 100, review_count: allReviews.length })
      .eq('id', vendor_id);
  }

  return res.status(201).json({ review: data });
});

// ─── GET /api/marketplace/procurement — list this tenant's requests ───────────

marketplaceRouter.get('/procurement', async (req: AuthenticatedRequest, res) => {
  const tenant_id = req.user!.tenant_id!;
  const { status } = req.query as Record<string, string>;

  let q = supabase
    .from('procurement_requests')
    .select(`*, marketplace_vendors(name_en, name_ar, category, logo_url)`)
    .eq('tenant_id', tenant_id)
    .order('created_at', { ascending: false });

  if (status) q = q.eq('status', status);

  const { data, error } = await q.limit(100);
  if (error) return res.status(500).json({ error: error.message });
  return res.json({ requests: data ?? [] });
});

// ─── POST /api/marketplace/procurement — create a request ────────────────────

marketplaceRouter.post('/procurement', async (req: AuthenticatedRequest, res) => {
  const parsed = ProcurementSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'Validation failed', errors: parsed.error.flatten() });

  const tenant_id = req.user!.tenant_id!;
  const { data, error } = await supabase
    .from('procurement_requests')
    .insert({ ...parsed.data, tenant_id, requested_by: req.user!.id, status: 'submitted', updated_at: new Date().toISOString() })
    .select()
    .single();

  if (error) return res.status(500).json({ error: error.message });
  return res.status(201).json({ request: data });
});

// ─── PUT /api/marketplace/procurement/:id — update status ────────────────────

marketplaceRouter.put('/procurement/:id', async (req: AuthenticatedRequest, res) => {
  const tenant_id = req.user!.tenant_id!;
  const role      = req.user!.role;
  const { status } = req.body;

  const allowed = ['draft','submitted','quoted','approved','rejected','completed'];
  if (!allowed.includes(status)) return res.status(400).json({ error: `status must be one of: ${allowed.join(', ')}` });

  // Only admin/procurement can approve/reject
  if (['approved','rejected'].includes(status)) {
    if (role !== 'admin' && role !== 'hr_manager') return res.status(403).json({ error: 'Insufficient permissions' });
  }

  const { data, error } = await supabase
    .from('procurement_requests')
    .update({ status, approved_by: ['approved','rejected'].includes(status) ? req.user!.id : undefined, updated_at: new Date().toISOString() })
    .eq('id', req.params.id)
    .eq('tenant_id', tenant_id)
    .select()
    .single();

  if (error) return res.status(500).json({ error: error.message });
  if (!data)  return res.status(404).json({ error: 'Request not found' });
  return res.json({ request: data });
});
