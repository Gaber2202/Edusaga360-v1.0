# EduSaga Parent (Flutter)

Native iOS/Android parent app. It talks only to `/api/parent` and `/api/public/schools` — no direct Supabase client.

## Run

```bash
cd backend && npm run dev
cd parent-mobile
flutter pub get
flutter run --dart-define=API_BASE_URL=http://localhost:3001
```

Android emulator: `http://10.0.2.2:3001` (used automatically in debug).

## Demo login

Seed first (`npm run seed:parent-portal` in `backend/`). Then in the app:

1. Email + password only (same as the web parent portal)
2. If you have more than one school, pick it from the dropdown
3. Example: `parent.demo@edusaga.local` / `ParentPass123!`

Production builds talk to `https://edusaga-360-production.up.railway.app`
(`api.edusaga360.com` is not DNS-ready yet).

**Note:** Railway must be deployed with the new auth endpoints
(`select-school`, multi-school login response) for the picker flow to work.

## Tests

```bash
flutter test
flutter analyze
```
