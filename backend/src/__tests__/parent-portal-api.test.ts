import { describe, it, expect, vi, beforeEach } from 'vitest';
import express from 'express';
import request from 'supertest';
import { createSupabaseStub, injectUser, QueryContext } from './support/supabaseMock.js';

const db = createSupabaseStub();
vi.mock('@supabase/supabase-js', () => ({ createClient: () => db.client }));

const { parentPortalRouter, parentApiCatalog } = await import('../routes/parentPortal.js');
const { parentAuthRouter } = await import('../routes/parentAuth.js');
const { publicSchoolsRouter } = await import('../routes/publicSchools.js');

const TENANT_ID = 'tenant-A';
const OTHER_TENANT = 'tenant-B';
const PARENT_USER = {
  id: 'auth-parent-1',
  email: 'parent.demo@edusaga.local',
  tenant_id: TENANT_ID,
  role: 'parent',
  is_platform_owner: false,
};
const TEACHER_USER = {
  id: 'auth-teacher-1',
  email: 'teacher@school.sa',
  tenant_id: TENANT_ID,
  role: 'teacher',
  is_platform_owner: false,
};
const PARENT_ROW = {
  id: 'user-row-1',
  email: PARENT_USER.email,
  first_name: 'Abdullah',
  last_name: 'Al-Farsi',
  name: 'Abdullah Al-Farsi',
  tenant_id: TENANT_ID,
  user_role: 'parent',
  linked_student_ids: ['STU-1', 'STU-2'],
};
const TEACHER_WITH_KIDS = {
  ...PARENT_ROW,
  id: 'user-row-teacher',
  email: TEACHER_USER.email,
  user_role: 'teacher',
  linked_student_ids: ['STU-1'],
};
const TEACHER_NO_KIDS = {
  ...PARENT_ROW,
  id: 'user-row-staff',
  email: TEACHER_USER.email,
  user_role: 'teacher',
  linked_student_ids: [],
};
const SCHOOL = {
  id: TENANT_ID,
  slug: 'demo',
  tenant_code: 'T-DEMO',
  name_en: 'Demo School',
  name_ar: 'مدرسة تجريبية',
  logo_url: null,
  status: 'active',
};
const CHILD_ROW = {
  id: 'STU-1',
  name_en: 'Sara Al-Farsi',
  name_ar: 'سارة الفارسي',
  status: 'active',
  student_id: 'S-100',
  grades: { name_en: 'Grade 3' },
  sections: { name: 'A' },
};
const CHILD_ROW_2 = {
  id: 'STU-2',
  name_en: 'Omar Al-Farsi',
  name_ar: 'عمر الفارسي',
  status: 'active',
  student_id: 'S-101',
  grades: { name_en: 'Grade 1' },
  sections: { name: 'B' },
};

function parentTables(overrides: (ctx: QueryContext) => ReturnType<typeof listedSchool> | undefined | { data: unknown }) {
  return (ctx: QueryContext) => {
    const hit = overrides(ctx);
    if (hit !== undefined) return hit;
    if (ctx.table === 'guardians') return { data: null };
    if (ctx.table === 'students' && ctx.op === 'select') return { data: [CHILD_ROW, CHILD_ROW_2] };
    return { data: null };
  };
}

function authedApp(user: Record<string, unknown>) {
  const app = express();
  app.use(express.json());
  app.use(injectUser(user));
  app.use('/parent', parentPortalRouter);
  return app;
}

function listedSchool(ctx: QueryContext) {
  if (ctx.table !== 'tenants') return undefined;
  return { data: SCHOOL };
}

beforeEach(() => {
  db.reset();
  vi.clearAllMocks();
});

describe('GET /api/parent catalog', () => {
  it('lists the mobile contract without auth', async () => {
    const app = express();
    app.get('/parent', parentApiCatalog);
    const res = await request(app).get('/parent');
    expect(res.status).toBe(200);
    expect(res.body.endpoints.children).toContain('/api/parent/children');
    expect(res.body.endpoints.storeSlots).toContain('/slots');
    expect(res.body.auth.login).toContain('/api/parent/auth/login');
    expect(res.body.auth.selectSchool).toContain('/api/parent/auth/select-school');
    expect(res.body.public.schoolByCode).toContain('/api/public/schools/by-code/');
  });
});

describe('GET /api/public/schools/by-code/:tenant_code', () => {
  function app() {
    const server = express();
    server.use('/schools', publicSchoolsRouter);
    return server;
  }

  it('returns branding when the school has a slug', async () => {
    db.setResolver((ctx: QueryContext) => listedSchool(ctx) ?? { data: null });
    const res = await request(app()).get('/schools/by-code/T-DEMO');
    expect(res.status).toBe(200);
    expect(res.body.slug).toBe('demo');
    expect(res.body.name_en).toBe('Demo School');
    expect(res.body.id).toBeUndefined();
  });

  it('hides unknown, unsuged, and suspended schools behind the same 404', async () => {
    db.setResolver((ctx: QueryContext) => {
      if (ctx.table === 'tenants') return { data: null };
      return { data: null };
    });
    const missing = await request(app()).get('/schools/by-code/NOPE');
    expect(missing.status).toBe(404);
    expect(missing.body.message).toBe('School not found');

    db.setResolver((ctx: QueryContext) => {
      if (ctx.table === 'tenants') return { data: { ...SCHOOL, slug: null } };
      return { data: null };
    });
    const noSlug = await request(app()).get('/schools/by-code/T-DEMO');
    expect(noSlug.status).toBe(404);
    expect(noSlug.body.message).toBe('School not found');

    db.setResolver((ctx: QueryContext) => {
      if (ctx.table === 'tenants') return { data: { ...SCHOOL, status: 'suspended' } };
      return { data: null };
    });
    const suspended = await request(app()).get('/schools/by-code/T-DEMO');
    expect(suspended.status).toBe(404);
    expect(suspended.body.message).toBe('School not found');
  });
});

describe('POST /api/parent/auth/login', () => {
  function authApp() {
    const app = express();
    app.use(express.json());
    app.use('/parent/auth', parentAuthRouter);
    return app;
  }

  function mockPasswordLogin(user = PARENT_USER) {
    db.auth.signInWithPassword.mockResolvedValue({
      data: {
        session: { access_token: 'tok', refresh_token: 'ref', expires_in: 3600 },
        user: { id: user.id, email: user.email },
      },
      error: null,
    });
  }

  function mockAuthUser(user = PARENT_USER) {
    db.auth.getUser.mockResolvedValue({
      data: { user: { id: user.id, email: user.email, app_metadata: { tenant_id: user.tenant_id, role: user.role } } },
      error: null,
    });
  }

  it('rejects a missing password', async () => {
    const res = await request(authApp()).post('/parent/auth/login').send({
      email: 'a@b.com',
    });
    expect(res.status).toBe(400);
  });

  it('auto-selects when the parent has exactly one school', async () => {
    mockPasswordLogin();
    db.setResolver(parentTables((ctx: QueryContext) => {
      if (ctx.table === 'tenants') return { data: SCHOOL };
      if (ctx.table === 'users') return { data: PARENT_ROW };
      return undefined;
    }));

    const res = await request(authApp()).post('/parent/auth/login').send({
      email: PARENT_USER.email,
      password: 'ParentPass123!',
    });
    expect(res.status).toBe(200);
    expect(res.body.access_token).toBe('tok');
    expect(res.body.needs_school_selection).toBe(false);
    expect(res.body.school?.id).toBe(SCHOOL.id);
    expect(res.body.school?.tenant_code).toBe(SCHOOL.tenant_code);
    expect(res.body.schools).toHaveLength(1);
    expect(res.body.user.role).toBe('parent');
    expect(res.body.user.linked_student_ids).toEqual(['STU-1', 'STU-2']);
  });

  it('returns a school list when the parent has multiple schools', async () => {
    mockPasswordLogin();
    const schoolB = {
      ...SCHOOL,
      id: OTHER_TENANT,
      slug: 'other',
      tenant_code: 'T-OTHER',
      name_en: 'Other School',
    };
    const parentB = { ...PARENT_ROW, id: 'user-row-2', tenant_id: OTHER_TENANT };
    db.setResolver((ctx: QueryContext) => {
      if (ctx.table === 'users' && !ctx.single) {
        return { data: [PARENT_ROW, parentB] };
      }
      if (ctx.table === 'users' && ctx.single) {
        const tenantEq = ctx.filters.find((f) => f.method === 'eq' && f.args[0] === 'tenant_id');
        const tenantId = tenantEq?.args[1];
        if (tenantId === OTHER_TENANT) return { data: parentB };
        return { data: PARENT_ROW };
      }
      if (ctx.table === 'tenants') {
        const idEq = ctx.filters.find((f) => f.method === 'eq' && f.args[0] === 'id');
        if (idEq?.args[1] === OTHER_TENANT) return { data: schoolB };
        return { data: SCHOOL };
      }
      return { data: null };
    });

    const res = await request(authApp()).post('/parent/auth/login').send({
      email: PARENT_USER.email,
      password: 'ParentPass123!',
    });
    expect(res.status).toBe(200);
    expect(res.body.needs_school_selection).toBe(true);
    expect(res.body.school).toBeNull();
    expect(res.body.user).toBeNull();
    expect(res.body.schools.map((s: { id: string }) => s.id).sort()).toEqual(
      [SCHOOL.id, schoolB.id].sort(),
    );
  });

  it('select-school locks in one of the assigned schools', async () => {
    mockAuthUser();
    db.auth.refreshSession.mockResolvedValue({
      data: {
        session: { access_token: 'tok2', refresh_token: 'ref2', expires_in: 3600 },
        user: { id: PARENT_USER.id, email: PARENT_USER.email },
      },
      error: null,
    });
    db.setResolver(parentTables((ctx: QueryContext) => {
      if (ctx.table === 'tenants') return { data: SCHOOL };
      if (ctx.table === 'users') return { data: PARENT_ROW };
      return undefined;
    }));

    const res = await request(authApp())
      .post('/parent/auth/select-school')
      .set('Authorization', 'Bearer tok')
      .send({ tenant_id: SCHOOL.id, refresh_token: 'ref' });
    expect(res.status).toBe(200);
    expect(res.body.needs_school_selection).toBe(false);
    expect(res.body.school?.id).toBe(SCHOOL.id);
    expect(res.body.user.tenant_id).toBe(SCHOOL.id);
  });

  it('allows a teacher who also has linked children', async () => {
    mockPasswordLogin(TEACHER_USER);
    db.setResolver(parentTables((ctx: QueryContext) => {
      if (ctx.table === 'tenants') return { data: SCHOOL };
      if (ctx.table === 'users') return { data: TEACHER_WITH_KIDS };
      return undefined;
    }));

    const res = await request(authApp()).post('/parent/auth/login').send({
      email: TEACHER_USER.email,
      password: 'x',
    });
    expect(res.status).toBe(200);
    expect(res.body.user.linked_student_ids).toEqual(['STU-1']);
  });

  it('rejects a staff account with no linked children', async () => {
    mockPasswordLogin(TEACHER_USER);
    db.setResolver((ctx: QueryContext) => {
      if (ctx.table === 'tenants') return { data: SCHOOL };
      if (ctx.table === 'users') return { data: TEACHER_NO_KIDS };
      return { data: null };
    });

    const res = await request(authApp()).post('/parent/auth/login').send({
      email: TEACHER_USER.email,
      password: 'x',
    });
    expect(res.status).toBe(403);
    expect(res.body.access_token).toBeUndefined();
    expect(res.body.message).toMatch(/parent accounts only/i);
  });

  it('rejects an account with no parent school assignment', async () => {
    mockPasswordLogin();
    db.setResolver(() => ({ data: null }));

    const res = await request(authApp()).post('/parent/auth/login').send({
      email: PARENT_USER.email,
      password: 'ParentPass123!',
    });
    expect(res.status).toBe(403);
    expect(res.body.message).toMatch(/parent accounts only/i);
  });
});

describe('parent data API', () => {
  it('denies a teacher without linked children', async () => {
    db.setResolver((ctx: QueryContext) => {
      if (ctx.table === 'users') return { data: TEACHER_NO_KIDS };
      return { data: null };
    });
    const res = await request(authedApp(TEACHER_USER)).get('/parent/me');
    expect(res.status).toBe(403);
  });

  it('allows a teacher with linked children', async () => {
    db.setResolver(parentTables((ctx: QueryContext) => {
      if (ctx.table === 'users') return { data: TEACHER_WITH_KIDS };
      return undefined;
    }));
    const res = await request(authedApp(TEACHER_USER)).get('/parent/me');
    expect(res.status).toBe(200);
    expect(res.body.linked_student_ids).toEqual(['STU-1']);
  });

  it('returns the parent profile', async () => {
    db.setResolver(parentTables((ctx: QueryContext) => {
      if (ctx.table === 'users') return { data: PARENT_ROW };
      return undefined;
    }));
    const res = await request(authedApp(PARENT_USER)).get('/parent/me');
    expect(res.status).toBe(200);
    expect(res.body.name).toBe('Abdullah Al-Farsi');
    expect(res.body.linked_student_ids).toEqual(['STU-1', 'STU-2']);
  });

  it('keeps only students that exist on the school roster', async () => {
    db.setResolver(parentTables((ctx: QueryContext) => {
      if (ctx.table === 'users') return { data: { ...PARENT_ROW, linked_student_ids: ['STU-1', 'MISSING'] } };
      if (ctx.table === 'students' && ctx.op === 'select') return { data: [CHILD_ROW] };
      return undefined;
    }));
    const res = await request(authedApp(PARENT_USER)).get('/parent/me');
    expect(res.status).toBe(200);
    expect(res.body.linked_student_ids).toEqual(['STU-1']);
  });

  it('includes roster students linked through the parent guardian email', async () => {
    db.setResolver((ctx: QueryContext) => {
      if (ctx.table === 'users') return { data: { ...PARENT_ROW, linked_student_ids: [] } };
      if (ctx.table === 'guardians') return { data: { id: 'G-1' } };
      if (ctx.table === 'students' && ctx.op === 'select') {
        return { data: [{ id: 'STU-G', name_en: 'Fatima', grades: { name_en: 'Grade 2' } }] };
      }
      return { data: null };
    });
    const res = await request(authedApp(PARENT_USER)).get('/parent/me');
    expect(res.status).toBe(200);
    expect(res.body.linked_student_ids).toEqual(['STU-G']);
  });

  it('lists only linked children and scopes the student query to the tenant', async () => {
    db.setResolver(parentTables((ctx: QueryContext) => {
      if (ctx.table === 'users') return { data: PARENT_ROW };
      return undefined;
    }));
    const res = await request(authedApp(PARENT_USER)).get('/parent/children');
    expect(res.status).toBe(200);
    expect(res.body.data[0].name_en).toBe('Sara Al-Farsi');
    expect(res.body.data[0].grade).toBe('Grade 3');
    expect(res.body.data[0].canteen_allergens).toEqual([]);
    expect(db.everyQueryScopedToTenant('students', TENANT_ID)).toBe(true);
  });

  it('lets a parent set canteen allergen types for a linked child', async () => {
    db.setResolver(parentTables((ctx: QueryContext) => {
      if (ctx.table === 'users') return { data: PARENT_ROW };
      if (ctx.table === 'students' && ctx.op === 'update') {
        return { data: { id: 'STU-1', canteen_allergens: ['dairy', 'nuts'] } };
      }
      return undefined;
    }));
    const res = await request(authedApp(PARENT_USER))
      .patch('/parent/children/STU-1/allergens')
      .send({ allergens: ['dairy', 'nuts', 'unknown'] });
    expect(res.status).toBe(200);
    expect(res.body.data.canteen_allergens).toEqual(['dairy', 'nuts']);
  });

  it('rejects allergen updates for an unlinked child', async () => {
    db.setResolver((ctx: QueryContext) => {
      if (ctx.table === 'users') return { data: PARENT_ROW };
      return { data: null };
    });
    const res = await request(authedApp(PARENT_USER))
      .patch('/parent/children/STU-OTHER/allergens')
      .send({ allergens: ['dairy'] });
    expect(res.status).toBe(403);
  });

  it('blocks attendance for an unlinked student', async () => {
    db.setResolver((ctx: QueryContext) => {
      if (ctx.table === 'users') return { data: PARENT_ROW };
      return { data: [] };
    });
    const res = await request(authedApp(PARENT_USER)).get('/parent/attendance?student_id=STU-OTHER');
    expect(res.status).toBe(403);
  });

  it('hides receipt documents from the invoices list', async () => {
    db.setResolver(parentTables((ctx: QueryContext) => {
      if (ctx.table === 'users') return { data: PARENT_ROW };
      if (ctx.table === 'invoices') {
        return {
          data: [
            { id: 'inv-1', document_type: 'invoice', total_amount: 100, paid_amount: 0, status: 'unpaid' },
            { id: 'rcp-1', document_type: 'receipt', total_amount: 100, paid_amount: 100, status: 'paid' },
          ],
        };
      }
      return undefined;
    }));
    const res = await request(authedApp(PARENT_USER)).get('/parent/invoices');
    expect(res.status).toBe(200);
    expect(res.body.data.map((row: { id: string }) => row.id)).toEqual(['inv-1']);
    expect(res.body.data[0].pdf).toContain('/api/invoices/inv-1/download-pdf');
  });

  it('returns payment rows scoped to linked students', async () => {
    db.setResolver(parentTables((ctx: QueryContext) => {
      if (ctx.table === 'users') return { data: PARENT_ROW };
      if (ctx.table === 'invoices') {
        return { data: [{ id: 'inv-1', invoice_number: 'INV-1', student_id: 'STU-1', student_name: 'Sara' }] };
      }
      if (ctx.table === 'payments') {
        return { data: [{ id: 'pay-1', invoice_id: 'inv-1', amount: 100, method: 'online', date: '2026-01-01', status: 'completed' }] };
      }
      return undefined;
    }));
    const res = await request(authedApp(PARENT_USER)).get('/parent/payments');
    expect(res.status).toBe(200);
    expect(res.body.data[0].invoice_number).toBe('INV-1');
  });

  it('blocks payments lookup for an unlinked student filter', async () => {
    db.setResolver((ctx: QueryContext) => {
      if (ctx.table === 'users') return { data: PARENT_ROW };
      return { data: null };
    });
    const res = await request(authedApp(PARENT_USER)).get('/parent/payments?student_id=STU-OTHER');
    expect(res.status).toBe(403);
  });

  it('returns contracts for linked students only', async () => {
    db.setResolver(parentTables((ctx: QueryContext) => {
      if (ctx.table === 'users') return { data: PARENT_ROW };
      if (ctx.table === 'student_contracts') {
        return { data: [{ id: 'c-1', student_id: 'STU-1', template_id: 'tpl-1', status: 'signed', signed_at: '2026-06-01' }] };
      }
      if (ctx.table === 'contract_templates') {
        return { data: [{ id: 'tpl-1', name: 'Enrollment Agreement', type: 'enrollment' }] };
      }
      return undefined;
    }));
    const res = await request(authedApp(PARENT_USER)).get('/parent/contracts');
    expect(res.status).toBe(200);
    expect(res.body.data[0].template_name).toBe('Enrollment Agreement');
  });

  it('returns empty applications when no application is linked', async () => {
    db.setResolver((ctx: QueryContext) => {
      if (ctx.table === 'users') return { data: PARENT_ROW };
      if (ctx.table === 'students') {
        return { data: [{ id: 'STU-1', name_en: 'Sara', application_id: null }] };
      }
      return { data: null };
    });
    const res = await request(authedApp(PARENT_USER)).get('/parent/applications?student_id=STU-1');
    expect(res.status).toBe(200);
    expect(res.body.data).toEqual([]);
  });

  it('lists store products for the parent tenant', async () => {
    db.setResolver(parentTables((ctx: QueryContext) => {
      if (ctx.table === 'users') return { data: PARENT_ROW };
      if (ctx.table === 'store_products') {
        return { data: [{ id: 'prod-1', name_en: 'Winter uniform kit', category: 'uniform', fulfillment_mode: 'purchase', price_purchase: 350, stock_qty: 10, is_active: true }] };
      }
      return undefined;
    }));
    const res = await request(authedApp(PARENT_USER)).get('/parent/store/products');
    expect(res.status).toBe(200);
    expect(res.body.data[0].name_en).toContain('uniform');
  });

  it('lists store categories', async () => {
    db.setResolver(parentTables((ctx: QueryContext) => {
      if (ctx.table === 'users') return { data: PARENT_ROW };
      if (ctx.table === 'store_categories') {
        return { data: [{ slug: 'uniform', name_en: 'Uniforms', name_ar: 'الزي المدرسي', sort_order: 1 }] };
      }
      return undefined;
    }));
    const res = await request(authedApp(PARENT_USER)).get('/parent/store/categories');
    expect(res.status).toBe(200);
    expect(res.body.data[0].slug).toBe('uniform');
  });

  it('lists generated slots for a bookable product', async () => {
    const productId = '11111111-1111-4111-8111-111111111111';
    db.setResolver(parentTables((ctx: QueryContext) => {
      if (ctx.table === 'users') return { data: PARENT_ROW };
      if (ctx.table === 'store_products') {
        return { data: { id: productId, is_active: true, is_bookable: true } };
      }
      if (ctx.table === 'store_product_hours') {
        return { data: [{ weekday: 6, start_time: '16:00', end_time: '21:00', slot_minutes: 60, capacity: 1 }] };
      }
      if (ctx.table === 'store_product_blackouts') return { data: [] };
      if (ctx.table === 'store_bookings') {
        return { data: [{ starts_at: '2026-08-22T16:00:00+03:00', ends_at: '2026-08-22T17:00:00+03:00', status: 'confirmed' }] };
      }
      return undefined;
    }));
    const res = await request(authedApp(PARENT_USER)).get(`/parent/store/products/${productId}/slots?date=2026-08-22`);
    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(5);
    expect(res.body.data[0].available).toBe(false);
    expect(res.body.data[1].available).toBe(true);
  });

  it('rejects a bookable checkout without a slot', async () => {
    const studentId = '22222222-2222-4222-8222-222222222222';
    const productId = '11111111-1111-4111-8111-111111111111';
    db.setResolver((ctx: QueryContext) => {
      if (ctx.table === 'users') return { data: { ...PARENT_ROW, linked_student_ids: [studentId] } };
      if (ctx.table === 'students') {
        const row = { id: studentId, name_en: 'Sara', name_ar: 'سارة', grade: '3', branch_id: null, guardian_id: null, application_id: null };
        return ctx.single ? { data: row } : { data: [{ id: studentId }] };
      }
      if (ctx.table === 'store_products') {
        return {
          data: [{
            id: productId,
            fulfillment_mode: 'rental',
            price_rental: 120,
            is_active: true,
            is_bookable: true,
            stock_qty: 10,
            name_en: 'Pitch',
            tax_code: 'ACTIVITIES',
          }],
        };
      }
      if (ctx.table === 'store_product_hours') {
        return { data: [{ product_id: productId, weekday: 6, start_time: '16:00', end_time: '21:00', slot_minutes: 60, capacity: 1 }] };
      }
      return { data: null };
    });
    const res = await request(authedApp(PARENT_USER)).post('/parent/store/orders').send({
      student_id: studentId,
      lines: [{ product_id: productId, line_type: 'rental', quantity: 1 }],
    });
    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/time slot/i);
  });

  it('reserves a slot through store_reserve_slot on bookable checkout', async () => {
    const studentId = '22222222-2222-4222-8222-222222222222';
    const productId = '11111111-1111-4111-8111-111111111111';
    db.setResolver((ctx: QueryContext) => {
      if (ctx.table === 'users') return { data: { ...PARENT_ROW, linked_student_ids: [studentId] } };
      if (ctx.table === 'students') {
        const row = { id: studentId, name_en: 'Sara', name_ar: 'سارة', grade: '3', branch_id: null, guardian_id: null, application_id: null };
        return ctx.single ? { data: row } : { data: [{ id: studentId }] };
      }
      if (ctx.table === 'store_products') {
        return {
          data: [{
            id: productId,
            fulfillment_mode: 'rental',
            price_rental: 120,
            is_active: true,
            is_bookable: true,
            stock_qty: 10,
            name_en: 'Pitch',
            name_ar: 'ملعب',
            tax_code: 'ACTIVITIES',
            collect_location: 'Sports office',
          }],
        };
      }
      if (ctx.table === 'store_product_hours') {
        return { data: [{ product_id: productId, weekday: 6, start_time: '16:00', end_time: '21:00', slot_minutes: 60, capacity: 1 }] };
      }
      if (ctx.table === 'store_orders') return { data: { id: 'order-1', order_number: 'ORD-1' } };
      if (ctx.table === 'store_order_lines') return { data: [] };
      if (ctx.table === 'invoices') return { data: { id: 'inv-1' } };
      if (ctx.table === 'tenants') return { data: { id: TENANT_ID, jurisdiction_code: 'SA', settings: {} } };
      if (ctx.table === 'branches') return { data: null };
      return { data: null };
    });
    db.setRpcResolver((fn) => {
      if (fn === 'store_reserve_slot') return { data: 'booking-1' };
      return {};
    });
    const res = await request(authedApp(PARENT_USER)).post('/parent/store/orders').send({
      student_id: studentId,
      lines: [{
        product_id: productId,
        line_type: 'rental',
        quantity: 1,
        slot_start: '2026-08-22T16:00:00+03:00',
      }],
    });
    expect(res.status).toBe(201);
    expect(db.rpcCallsFor('store_reserve_slot')).toHaveLength(1);
  });

  it('returns slot_unavailable from the reserve RPC as a 400', async () => {
    const studentId = '22222222-2222-4222-8222-222222222222';
    const productId = '11111111-1111-4111-8111-111111111111';
    db.setResolver((ctx: QueryContext) => {
      if (ctx.table === 'users') return { data: { ...PARENT_ROW, linked_student_ids: [studentId] } };
      if (ctx.table === 'students') {
        const row = { id: studentId, name_en: 'Sara', name_ar: 'سارة', grade: '3', branch_id: null, guardian_id: null, application_id: null };
        return ctx.single ? { data: row } : { data: [{ id: studentId }] };
      }
      if (ctx.table === 'store_products') {
        return {
          data: [{
            id: productId,
            fulfillment_mode: 'rental',
            price_rental: 120,
            is_active: true,
            is_bookable: true,
            stock_qty: 10,
            name_en: 'Pitch',
            tax_code: 'ACTIVITIES',
          }],
        };
      }
      if (ctx.table === 'store_product_hours') {
        return { data: [{ product_id: productId, weekday: 6, start_time: '16:00', end_time: '21:00', slot_minutes: 60, capacity: 1 }] };
      }
      if (ctx.table === 'store_orders') return { data: { id: 'order-1' } };
      if (ctx.table === 'store_order_lines') return { data: [] };
      if (ctx.table === 'store_bookings') return { data: [] };
      if (ctx.table === 'tenants') return { data: { id: TENANT_ID, jurisdiction_code: 'SA', settings: {} } };
      return { data: null };
    });
    db.setRpcResolver((fn) => {
      if (fn === 'store_reserve_slot') return { error: { message: 'slot_unavailable' } };
      return {};
    });
    const res = await request(authedApp(PARENT_USER)).post('/parent/store/orders').send({
      student_id: studentId,
      lines: [{
        product_id: productId,
        line_type: 'rental',
        quantity: 1,
        slot_start: '2026-08-22T16:00:00+03:00',
      }],
    });
    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/no longer available/i);
  });
});
