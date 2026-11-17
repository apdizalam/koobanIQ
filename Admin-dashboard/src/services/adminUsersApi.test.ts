import { describe, expect, it, vi } from 'vitest';
import type { AuthState } from '../auth/authContext';
import type { AdminUser } from '../types/adminUsers';
import { availableActions, runUserAction, usersQuery } from './adminUsersApi';

const user = (over: Partial<AdminUser> = {}): AdminUser => ({
  id: 'u1',
  email: 'amina@example.com',
  role: 'user',
  status: 'active',
  emailVerified: false,
  preferredLanguage: 'so',
  createdAt: '2026-11-17T00:00:00.000Z',
  lastActiveAt: null,
  ...over,
});

describe('usersQuery', () => {
  it('leaves out empty filters and always sends page + limit', () => {
    expect(usersQuery({ q: '  ', role: '', status: '', page: 1 })).toBe('page=1&limit=20');
    expect(usersQuery({ q: ' amina ', role: 'admin', status: 'suspended', page: 3 })).toBe(
      'q=amina&role=admin&status=suspended&page=3&limit=20',
    );
  });
});

describe('availableActions', () => {
  it('offers the opposite of the current status and role, plus delete', () => {
    expect(availableActions(user(), 'me')).toEqual(['suspend', 'makeAdmin', 'delete']);
    expect(availableActions(user({ status: 'suspended', role: 'admin' }), 'me')).toEqual([
      'reactivate',
      'makeUser',
      'delete',
    ]);
  });

  it('offers nothing on your own account', () => {
    expect(availableActions(user({ id: 'me' }), 'me')).toEqual([]);
  });
});

describe('runUserAction', () => {
  it('sends the right request for each action', async () => {
    const request = vi.fn(async () => ({ user: user() }));
    // The real `request` is generic; this fake always answers with a user.
    const send = request as unknown as AuthState['request'];
    await runUserAction(send, 'u1', 'suspend');
    await runUserAction(send, 'u1', 'reactivate');
    await runUserAction(send, 'u1', 'makeAdmin');
    await runUserAction(send, 'u1', 'makeUser');
    await expect(runUserAction(send, 'u1', 'delete')).resolves.toBeNull();

    expect(request.mock.calls).toEqual([
      ['/admin/users/u1/status', { method: 'PATCH', body: { status: 'suspended' } }],
      ['/admin/users/u1/status', { method: 'PATCH', body: { status: 'active' } }],
      ['/admin/users/u1/role', { method: 'PATCH', body: { role: 'admin' } }],
      ['/admin/users/u1/role', { method: 'PATCH', body: { role: 'user' } }],
      ['/admin/users/u1', { method: 'DELETE' }],
    ]);
  });
});
