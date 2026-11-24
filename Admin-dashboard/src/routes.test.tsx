/// <reference types="node" />
/* eslint-disable i18next/no-literal-string -- marker texts in a test, not UI text */
// This test runs in Node (Vitest), so it may read files and render to a string.
import { readFileSync } from 'node:fs';
import { renderToString } from 'react-dom/server';
import { MemoryRouter, Route, Routes } from 'react-router';
import { describe, expect, it } from 'vitest';
import { AuthContext, type AuthState } from './auth/authContext';
import { RequireAdmin } from './auth/RequireAdmin';
import { ADMIN_BASE } from './constants/routes';
import { NAV_ITEMS } from './constants/navigation';

/**
 * TIQ-25: the admin lives under /admin on the one KOBANIQ website (the landing
 * page is the home page). Every admin address starts with /admin, and the
 * route guard still keeps admin pages from anyone who is not a signed-in admin.
 */
const app = readFileSync(new URL('./App.tsx', import.meta.url), 'utf8');
const routePaths = [...app.matchAll(/<Route\s+path="([^"]+)"/g)].map((m) => m[1]);

describe('admin addresses under /admin', () => {
  it('the router base is /admin (same as the build base)', () => {
    // In tests Vite's base is "/"; the build uses "/admin/" (checked in the built site by
    // scripts/check-web.mjs). The router base is always the build base without its last slash.
    expect(ADMIN_BASE).toBe(import.meta.env.BASE_URL.replace(/\/$/, ''));
    expect(app).toContain('<BrowserRouter basename={ADMIN_BASE}>');
    expect(readFileSync(new URL('../vite.config.ts', import.meta.url), 'utf8')).toContain(
      "base: '/admin/'",
    );
  });

  it('/admin opens Overview at /admin/overview; /admin/login is the login page', () => {
    expect(app).toContain('<Route index element={<Navigate to="overview" replace />} />');
    expect(routePaths).toContain('overview');
    expect(routePaths).toContain('/login');
    expect(NAV_ITEMS.find((item) => item.key === 'overview')?.path).toBe('/overview');
  });

  it('every menu link that is built has a page (links become /admin/<path>)', () => {
    for (const item of NAV_ITEMS.filter((i) => i.available)) {
      expect(item.path.startsWith('/'), item.path).toBe(true);
      expect(routePaths, item.path).toContain(item.path.slice(1));
    }
  });
});

describe('route guard (RequireAdmin)', () => {
  const auth = (user: AuthState['user']): AuthState =>
    ({
      restoring: false,
      user,
      signIn: async () => {},
      signOut: async () => {},
    }) as unknown as AuthState;

  /** Renders /admin/users with the given signed-in user; returns the HTML. */
  function render(user: AuthState['user']) {
    return renderToString(
      <AuthContext.Provider value={auth(user)}>
        <MemoryRouter basename="/admin" initialEntries={['/admin/users']}>
          <Routes>
            <Route path="/login" element={<p>LOGIN PAGE</p>} />
            <Route
              path="/users"
              element={
                <RequireAdmin>
                  <p>PRIVATE ADMIN DATA</p>
                </RequireAdmin>
              }
            />
          </Routes>
        </MemoryRouter>
      </AuthContext.Provider>,
    );
  }

  it('nobody signed in: the admin page is not shown', () => {
    expect(render(null)).not.toContain('PRIVATE ADMIN DATA');
  });

  it('a regular user typing the address: the admin page is not shown', () => {
    const user = { id: 'u2', email: 'user@example.com', role: 'user' } as AuthState['user'];
    expect(render(user)).not.toContain('PRIVATE ADMIN DATA');
  });

  it('a signed-in admin sees the page', () => {
    const admin = { id: 'u1', email: 'admin@example.com', role: 'admin' } as AuthState['user'];
    expect(render(admin)).toContain('PRIVATE ADMIN DATA');
  });
});
