# Deployment Guide — EduSaga 360

## Prerequisites

1. **Supabase project** — Create at https://supabase.com/dashboard
2. **Vercel account** — For frontend hosting
3. **Railway or Render account** — For backend hosting
4. **Cloudflare R2 or AWS S3** — For file storage
5. **Stripe account** — For payment processing
6. **Domain name** — e.g., `app.edusaga360.com`

## Step 1: Database Setup (Supabase)

1. Create a new Supabase project
2. Go to SQL Editor and run `shared/database/schema.sql`
3. Copy the project URL and anon key from Settings → API

## Step 2: Backend Deployment

### Railway
```bash
# Install Railway CLI
npm i -g @railway/cli

# Login and create project
railway login
railway init

# Set environment variables
railway variables set SUPABASE_URL=<your-supabase-url>
railway variables set SUPABASE_SERVICE_ROLE_KEY=<your-service-role-key>
railway variables set STRIPE_SECRET_KEY=<your-stripe-key>
railway variables set FRONTEND_URL=https://app.edusaga360.com

# Deploy
railway up
```

### Render
1. Connect your GitHub repo
2. Set root directory to `backend`
3. Build command: `npm ci && npm run build`
4. Start command: `npm start`
5. Set environment variables in the Render dashboard

## Step 3: Frontend Deployment (Vercel)

1. Connect GitHub repo to Vercel
2. Set root directory to `frontend`
3. Add environment variables:
   - `VITE_SUPABASE_URL`
   - `VITE_SUPABASE_ANON_KEY`
   - `VITE_API_BASE_URL` (your Railway/Render backend URL)
   - `VITE_STRIPE_PUBLISHABLE_KEY`
   - `VITE_SENTRY_DSN` (optional)
4. Deploy

## Step 4: DNS Configuration

| Record | Type | Value |
|--------|------|-------|
| `app.edusaga360.com` | CNAME | `cname.vercel-dns.com` |
| `api.edusaga360.com` | CNAME | Railway/Render provided domain |

## Step 5: File Storage Setup

### Cloudflare R2
1. Create R2 bucket named `edusaga-360`
2. Create API token with read/write access
3. Set env vars: `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_BUCKET_NAME`

### OR AWS S3
1. Create S3 bucket
2. Create IAM user with S3 access
3. Set env vars: `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`, `AWS_REGION`, `S3_BUCKET_NAME`

## Step 6: Stripe Configuration

1. Set up webhook endpoint: `https://api.edusaga360.com/api/webhooks/stripe`
2. Events to subscribe: `payment_intent.succeeded`, `invoice.paid`, `customer.subscription.*`
3. Copy webhook signing secret to `STRIPE_WEBHOOK_SECRET`

## Go Live Checklist

- [ ] Database schema applied and seeded with reference data (countries, currencies)
- [ ] Backend deployed and health check passing (`GET /api/health`)
- [ ] Frontend deployed and loading correctly
- [ ] DNS configured and SSL certificates active
- [ ] Supabase Auth configured (email templates, redirect URLs)
- [ ] File storage configured and tested
- [ ] Stripe webhooks configured and tested
- [ ] Sentry configured for error tracking
- [ ] All environment variables set in production

## What to Cancel on Base44

After confirming production is stable:

1. Cancel Base44 subscription
2. Remove GitHub integration from Base44
3. Archive the old `EduSaga360/edusaga` repo (do not delete — keep for reference)
4. Update DNS if any records pointed to Base44
