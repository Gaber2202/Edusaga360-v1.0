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

1. School code: the tenant’s `tenant_code` (seeded as `T-DEMO` when missing)
2. `parent.demo@edusaga.local` / `ParentPass123!`

## Tests

```bash
flutter test
flutter analyze
```
