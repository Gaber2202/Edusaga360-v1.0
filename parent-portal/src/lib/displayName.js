export function parentDisplayName(user) {
  if (!user) return '';
  const fromParts = [user.first_name, user.last_name].filter(Boolean).join(' ');
  return fromParts || user.name || user.full_name || user.email || '';
}
