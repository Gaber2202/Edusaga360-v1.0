import { describe, it, expect } from 'vitest';
import {
  resolveEmployeeForUser,
  userIdForEmployeeLink,
  employeeLinkIdsForUser,
} from '../lib/employeeLink';

describe('resolveEmployeeForUser', () => {
  const employees = [
    { id: 'e1', email: 'a@school.com', user_id: 'app-1', name_ar: 'A' },
    { id: 'e2', email: 'b@school.com', user_id: null, name_ar: 'B' },
    { id: 'e3', email: 'c@school.com', user_id: 'auth-legacy', name_ar: 'C' },
  ];

  it('matches by app users.id (_appUserId)', () => {
    const emp = resolveEmployeeForUser(employees, {
      id: 'auth-xyz',
      _appUserId: 'app-1',
      email: 'other@school.com',
    });
    expect(emp?.id).toBe('e1');
  });

  it('falls back to email when not linked by user_id', () => {
    const emp = resolveEmployeeForUser(employees, {
      id: 'auth-new',
      _appUserId: 'app-missing',
      email: 'b@school.com',
    });
    expect(emp?.id).toBe('e2');
  });

  it('matches legacy auth id stored on user_id', () => {
    const emp = resolveEmployeeForUser(employees, {
      id: 'auth-legacy',
      email: 'nomatch@x.com',
    });
    expect(emp?.id).toBe('e3');
  });

  it('returns null when nothing matches', () => {
    expect(
      resolveEmployeeForUser(employees, {
        id: 'x',
        _appUserId: 'y',
        email: 'z@z.com',
      }),
    ).toBeNull();
  });
});

describe('userIdForEmployeeLink', () => {
  it('prefers _appUserId', () => {
    expect(userIdForEmployeeLink({ id: 'auth', _appUserId: 'app' })).toBe('app');
    expect(userIdForEmployeeLink({ id: 'auth' })).toBe('auth');
  });
});

describe('employeeLinkIdsForUser', () => {
  it('normalizes email', () => {
    expect(employeeLinkIdsForUser({ id: 'a', email: 'A@B.COM' }).email).toBe('a@b.com');
  });
});
