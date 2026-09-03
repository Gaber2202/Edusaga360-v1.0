/**
 * Resolve the HR employee row for a logged-in app/auth user.
 *
 * Linking is stored on employees.user_id → public.users.id (app user id).
 * RoleContext keeps auth uuid on user.id and app users.id on user._appUserId.
 */

export function employeeLinkIdsForUser(user) {
  if (!user) return { appUserId: null, authId: null, email: null };
  return {
    appUserId: user._appUserId || null,
    authId: user.id || null,
    email: user.email ? String(user.email).toLowerCase() : null,
  };
}

/**
 * Find employee linked to a login.
 * Priority: user_id (app users.id) → user_id (auth id, legacy) → email.
 */
export function resolveEmployeeForUser(employees, user) {
  const list = employees || [];
  if (!user || list.length === 0) return null;

  const { appUserId, authId, email } = employeeLinkIdsForUser(user);

  if (appUserId) {
    const byApp = list.find((e) => e.user_id && e.user_id === appUserId);
    if (byApp) return byApp;
  }

  // Legacy / mistaken links that stored auth.uid on employees.user_id
  if (authId) {
    const byAuth = list.find((e) => e.user_id && e.user_id === authId);
    if (byAuth) return byAuth;
  }

  if (email) {
    return (
      list.find((e) => e.email && String(e.email).toLowerCase() === email) || null
    );
  }

  return null;
}

/**
 * Value to write onto employees.user_id when linking a login.
 * Prefer app users.id (FK target); fall back to auth id only if no app row.
 */
export function userIdForEmployeeLink(user) {
  if (!user) return null;
  return user._appUserId || user.id || null;
}
