---
name: testing-auth-flow
description: How to test the EduSaga 360 authenticated login flow against Supabase Auth. Covers dev server setup, credential configuration, login/logout testing, and known limitations.
---

# Testing EduSaga 360 Auth Flow

## Prerequisites

1. **Supabase credentials** in `frontend/.env`:
   ```
   VITE_SUPABASE_URL=https://<project-ref>.supabase.co
   VITE_SUPABASE_ANON_KEY=<anon-jwt>
   ```
2. A Supabase Auth user created in the project (email + password)
3. For Dashboard access: the user needs a matching `registration_requests` row and tenant data in the DB

## Running the Dev Server

```bash
cd frontend && npm install && npm run dev
```

Server runs at `http://localhost:5173`. Root `/` redirects to `/school-login` for unauthenticated users.

## Test Flows

### 1. Client-side validation
- Navigate to `/school-login`
- Submit with empty fields
- Expect: "Please enter a valid email" and "Password is required" errors

### 2. Failed login
- Enter wrong credentials and submit
- Expect: Red error box "Login failed. Please check your email and password."
- Page stays on `/school-login`, button re-enables

### 3. Successful login
- Enter valid Supabase user credentials
- Expect: Supabase Auth session stored in localStorage as `sb-<project-ref>-auth-token`
- If user has tenant data: redirects to `/` (Dashboard with sidebar)
- If user has NO tenant data: redirects to `/register` (expected behavior — `UserNotRegisteredError` checks `registration_requests` table)

### 4. Logout
- After login, the Layout sidebar has a user menu with logout option
- After logout, navigating to `/` should redirect to `/school-login`

### 5. Console audit
- Check browser console for zero `base44`/`Base44` SDK references
- Only acceptable "base44" occurrences are in CDN URLs for logo images

## Verifying Auth State

In browser console:
```javascript
// Check if session exists
const token = JSON.parse(localStorage.getItem('sb-<project-ref>-auth-token'));
console.log('User:', token?.user?.email);
console.log('Authenticated:', !!token?.access_token);
```

## Known Limitations

- Dashboard requires tenant seed data in Supabase DB
- Backend API endpoints are stubs — `callApi()` calls will fail
- Deploy to Staging CI needs Vercel token configuration
