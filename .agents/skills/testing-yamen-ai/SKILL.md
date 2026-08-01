---
name: testing-yamen-ai
description: How to end-to-end test the Yamen AI usage/cost tracking feature and admin dashboards on the EduSaga 360 local dev stack.
---

# Testing Yamen AI Usage & Cost Tracking

Use this skill when verifying PRs that touch `yamen_ai_usage_log`, `record_ai_usage`, `/api/ai/invoke-llm`, `/api/admin/ai-usage`, or the admin portal `/yamen-ai-usage` and Dashboard KPI.

## Devin Secrets Needed

- `SUPABASE_URL`
- `SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`

## Local services to start

1. **Mock OpenAI-compatible LLM** (if no real AI keys are available).
   - Create `/tmp/mock-llm.js` (Node) that listens on `localhost:3002` and responds to `POST /v1/chat/completions` with a deterministic completion and `usage` object.
   - Start: `node /tmp/mock-llm.js`

2. **Backend** (`/home/ubuntu/repos/edusaga-360/backend`):
   - `AI_PROVIDER=mock AI_CUSTOM_PROVIDERS='[{"name":"mock","base_url":"http://localhost:3002/v1","model":"gpt-4o-mini"}]' FRONTEND_URL=http://localhost:5174 npx tsx watch src/index.ts`
   - `FRONTEND_URL=http://localhost:5174` is needed so the admin portal on `localhost:5174` can make cross-origin requests to `localhost:3001`.
   - Real keys (`GROQ_API_KEY`, `GOOGLE_AI_API_KEY`, `ANTHROPIC_API_KEY`, `OPENAI_API_KEY`) can be left empty when using the mock.

3. **Frontend** (`/home/ubuntu/repos/edusaga-360/frontend`):
   - `npx vite --host 0.0.0.0 --port 5173`
   - Requires `frontend/.env` with `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, and `VITE_API_BASE_URL=http://localhost:3001`.

4. **Admin Portal** (`/home/ubuntu/repos/edusaga-360/admin-portal`):
   - `npx vite --host 0.0.0.0 --port 5174`
   - The admin portal **needs its own `.env`** (or symlink to `frontend/.env`) because Vite does not read arbitrary `process.env` variables; `admin-portal/src/lib/supabase.js` falls back to the production Railway URL if `VITE_API_BASE_URL` is missing.
   - The backend CORS allow-list only includes `http://localhost:5173` in dev, so `FRONTEND_URL=http://localhost:5174` (or editing `backend/src/index.ts`) is required.

## Test accounts

- **Frontend AI caller:** `devin-test-admin-1785265990@edusaga360.local` / `TempAdmin123!` (role `admin`, `tenant_id` `b0000000-0000-0000-0000-000000000001`).
- **Admin Portal platform owner:** `muhammed@edusaga360.com` / `Muhammed*1993#`.

## If the UI login form fails

During local testing the `/school-login` page may reject valid credentials even though the same credentials work with a direct Supabase Auth `curl`. As a fallback, obtain an access token via `POST ${SUPABASE_URL}/auth/v1/token?grant_type=password` with the `apikey: ${SUPABASE_ANON_KEY}` header, then set:

```js
localStorage.setItem('sb-mhbfvewkjlfmkqdhxpyg-auth-token', JSON.stringify(data));
window.location.href = 'http://localhost:5173/YamenAI';
```

For the admin portal, the localStorage key is the same, but `localStorage` is scoped per origin, so set it from the admin portal's origin (`localhost:5174`) before navigating.

## Triggering an AI call

- Open `/YamenAI` in the frontend.
- Click the **Ask Yamen / اسأل يامن** tab.
- Send a message. The chat component posts `{ prompt, messages, source: 'chat' }` to `/api/ai/invoke-llm`.
- Intercept `window.fetch` to capture the response JSON, or watch the browser console.

## Expected `invoke-llm` response

With the mock LLM returning `prompt_tokens: 10000` and `completion_tokens: 5000`, and `backend/src/lib/aiPricing.ts` rates for `gpt-4o-mini` (`$0.15` input / `$0.60` output per 1M tokens), expect:

```json
{
  "response": "Mock AI response for testing.",
  "provider": "mock",
  "tokens_used": 15000,
  "cost_usd": 0.0045,
  "input_tokens": 10000,
  "output_tokens": 5000
}
```

## Verifying Supabase state

```bash
# yamen_ai_usage_log row
curl -s -H "apikey: $SUPABASE_SERVICE_ROLE_KEY" -H "Authorization: Bearer $SUPABASE_SERVICE_ROLE_KEY" \
  "$SUPABASE_URL/rest/v1/yamen_ai_usage_log?period=eq.2026-07&tenant_id=eq.b0000000-0000-0000-0000-000000000001&order=created_at.desc" \
  | jq '.[0]'

# tenant counters
curl -s -H "apikey: $SUPABASE_SERVICE_ROLE_KEY" -H "Authorization: Bearer $SUPABASE_SERVICE_ROLE_KEY" \
  "$SUPABASE_URL/rest/v1/tenants?id=eq.b0000000-0000-0000-0000-000000000001&select=yamen_ai_used_this_month,yamen_ai_tokens_used_this_month,yamen_ai_cost_usd_this_month,yamen_ai_usage_period" \
  | jq '.'
```

## Admin Portal checks

- `/yamen-ai-usage`: summary cards, By Source/Provider/Tenant tables, and Recent Calls should reflect the single call.
- Dashboard: the `Yamen AI Cost` KPI card should show `$0.0045` and `15,000 tokens`.
- If the page shows zeroes after setting the backend correctly, hard-refresh to clear the React Query cache.

## Cleanup

Delete test rows and reset tenant counters:

```bash
curl -s -X DELETE -H "apikey: $SUPABASE_SERVICE_ROLE_KEY" -H "Authorization: Bearer $SUPABASE_SERVICE_ROLE_KEY" \
  "$SUPABASE_URL/rest/v1/yamen_ai_usage_log?tenant_id=eq.b0000000-0000-0000-0000-000000000001&source=eq.chat&period=eq.2026-07"

curl -s -X PATCH -H "apikey: $SUPABASE_SERVICE_ROLE_KEY" -H "Authorization: Bearer $SUPABASE_SERVICE_ROLE_KEY" \
  -H "Content-Type: application/json" \
  "$SUPABASE_URL/rest/v1/tenants?id=eq.b0000000-0000-0000-0000-000000000001" \
  -d '{"yamen_ai_used_this_month":0,"yamen_ai_tokens_used_this_month":0,"yamen_ai_cost_usd_this_month":0}'
```

Remove any temporary `admin-portal/.env` symlink before finishing.
