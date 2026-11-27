import { renderToString } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { ANDROID_APK } from './androidApk';
import { Home } from './pages/Home';
import { LANGS } from './routes';
import { TEXTS, fmt } from './texts';

/** "Try KOBANIQ": the Android testing version next to the two store badges. */
describe('Android testing version on the home page', () => {
  it('is a real Expo build file: https, .apk, not expired', () => {
    const url = new URL(ANDROID_APK.url);
    expect(url.protocol).toBe('https:');
    expect(url.hostname).toBe('expo.dev');
    expect(url.pathname).toMatch(/^\/artifacts\/eas\/[\w-]+\.apk$/);
    expect(ANDROID_APK.sizeMb).toBeGreaterThan(10);
    // Fails on purpose once Expo has deleted the file: update androidApk.ts then.
    expect(new Date(`${ANDROID_APK.expiresOn}T00:00:00Z`).getTime()).toBeGreaterThan(Date.now());
  });

  for (const lang of LANGS) {
    it(`${lang}: three options — App Store and Google Play still "coming soon", plus the APK download`, () => {
      const t = TEXTS[lang];
      const html = renderToString(<Home t={t} lang={lang} />);
      const stores = html.slice(
        html.indexOf('<ul class="stores"'),
        html.indexOf('</ul>', html.indexOf('<ul class="stores"')),
      );
      expect(stores.match(/<li/g)).toHaveLength(3);
      expect(stores.match(new RegExp(t.hero.soonBadge, 'g'))).toHaveLength(2);
      expect(stores).toContain(t.hero.appStore);
      expect(stores).toContain(t.hero.googlePlay);
      expect(stores).toContain(`href="${ANDROID_APK.url}"`);
      expect(stores).toContain('download=""');
      expect(stores).toContain(t.hero.android);
      expect(stores).toContain(fmt(t.hero.androidAction, { size: ANDROID_APK.sizeMb }));
      // Install help, collapsed by default.
      expect(html).toContain(`<summary>${t.hero.installTitle}</summary>`);
      expect(html).not.toMatch(/<details[^>]*open/);
    });
  }
});
