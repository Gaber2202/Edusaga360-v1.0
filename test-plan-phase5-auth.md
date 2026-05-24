# Phase 5 — Authenticated Login Flow Test Plan

## What Changed
SchoolLogin.jsx `handleSignIn()` was updated to call `useAuth().login(email, password)` via Supabase Auth (`signInWithPassword`) instead of the old Base44 SSO redirect (`window.location.href = '/login'`). Frontend `.env` now has real Supabase project URL and anon key.

## Primary Flow: Login → Dashboard → Logout

### Test 1: Successful login redirects to Dashboard with Layout sidebar
**Steps:**
1. Navigate to `http://localhost:5173/school-login`
2. Switch language to English (click the toggle showing "English")
3. Enter email: `Muhammed@edusaga360.com`
4. Enter password: `Muhammed*1993#`
5. Click "Sign In" button

**Pass criteria:**
- Button shows "Signing in..." spinner while loading
- Page redirects away from `/school-login` to `/` (Dashboard)
- Layout sidebar is visible on the left with navigation items (e.g. "Dashboard" icon)
- No console errors containing "base44" or "Base44"
- URL is `/` or `/Dashboard` (not `/school-login`)

**Fail indicators (would prove broken):**
- Page stays on `/school-login` (old redirect loop)
- Console shows `window.location.href = '/login'` redirect
- No sidebar appears (still on login page)
- Network error to Supabase auth endpoint

### Test 2: Failed login shows inline error message
**Steps:**
1. Navigate to `http://localhost:5173/school-login`
2. Switch to English
3. Enter email: `wrong@example.com`
4. Enter password: `wrongpassword`
5. Click "Sign In"

**Pass criteria:**
- Red error box appears above the "Sign In" button with text containing "Login failed"
- Page remains on `/school-login`
- Submit button re-enables after error (not stuck in loading state)
- No unhandled promise rejection in console

**Fail indicators:**
- No error message shown (silent failure)
- Page redirects away
- Button stays in "Signing in..." state indefinitely

### Test 3: Client-side validation still works
**Steps:**
1. On `/school-login`, clear both fields
2. Click "Sign In" with empty email and empty password

**Pass criteria:**
- Email field shows validation error "Please enter a valid email" (in English mode)
- Password field shows "Password is required"
- No network request to Supabase (validation prevents submission)
- Button does NOT show loading spinner

### Test 4: Logout flow
**Steps:**
1. After successful login (from Test 1), find and click the user avatar/profile menu in the top bar
2. Click "Logout" / "تسجيل الخروج" option

**Pass criteria:**
- Page redirects back to `/school-login`
- Sidebar and dashboard content are no longer visible
- Attempting to navigate to `/` redirects back to `/school-login`

### Test 5: Console audit — zero Base44 references
**Steps:**
1. Open browser console before login
2. Clear console
3. Perform login flow (Test 1)
4. After landing on dashboard, check console output

**Pass criteria:**
- Zero console messages containing "base44", "Base44", or "BASE44"
- No 404 errors for `/login` endpoint (old SSO redirect)
- Supabase auth requests visible in network tab (POST to `https://mhbfvewkjlfmkqdhxpyg.supabase.co/auth/v1/token`)

## Code Evidence
- **SchoolLogin.jsx:47-63** — `handleSignIn()` calls `login(email, password)` from AuthContext
- **AuthContext.jsx:33-44** — `login()` calls `supabase.auth.signInWithPassword()`
- **App.jsx:73-87** — `auth_required` error renders SchoolLogin; successful auth renders authenticated routes
- **pages.config.js:245** — `mainPage: "Dashboard"`
- **Layout.jsx:107-112** — sidebar navigation starts with "Dashboard" item
