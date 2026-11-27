import { describe, expect, it, vi } from 'vitest';
import { NAV_ITEMS } from '../constants/navigation';
import { resources } from '../i18n';
import { WAITLIST_PAGE_SIZE, fetchWaitlist, waitlistQuery } from './waitlistApi';

describe('Waitlist (landing page sign-ups, admins only)', () => {
  it('asks the admin route with the search and page; an empty search is left out', async () => {
    const request = vi.fn().mockResolvedValue({});
    await fetchWaitlist(request, { q: '  hodan  ', page: 2 });
    expect(request).toHaveBeenCalledWith(
      `/admin/waitlist?q=hodan&page=2&limit=${WAITLIST_PAGE_SIZE}`,
    );
    expect(waitlistQuery({ q: '   ', page: 1 })).toBe(`page=1&limit=${WAITLIST_PAGE_SIZE}`);
    expect(waitlistQuery({ q: 'a+b@x.so', page: 1 })).toContain('q=a%2Bb%40x.so');
  });

  it('is in the sidebar, right after Users', () => {
    const keys = NAV_ITEMS.map((i) => i.key);
    expect(keys.indexOf('waitlist')).toBe(keys.indexOf('users') + 1);
    expect(NAV_ITEMS.find((i) => i.key === 'waitlist')).toMatchObject({
      path: '/waitlist',
      available: true,
    });
  });

  it('has every text in English and Somali', () => {
    const en = resources.en.translation.admin.waitlist;
    const so = resources.so.translation.admin.waitlist;
    for (const [key, value] of Object.entries(en)) {
      expect(so[key as keyof typeof so], key).toBeTruthy();
      expect(value, key).toBeTruthy();
    }
    expect(resources.so.translation.admin.nav.items.waitlist).toBeTruthy();
  });
});
