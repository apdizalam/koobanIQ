/**
 * The Android testing version offered on the home page ("Try KOBANIQ").
 *
 * Today the APK is the latest EAS "preview" build (staging server, push set up),
 * served by Expo: https://expo.dev/accounts/abdisalam-mohamed/projects/app-frontend/builds
 * Expo keeps internal-distribution builds for a limited time: this one expires
 * on `expiresOn`. Before that date (and after every new Android build) update
 * `url`, `sizeMb`, `buildId` and `expiresOn` here, or move the APK to a lasting
 * home such as a GitHub Release (…/releases/latest/download/kobaniq.apk).
 */
export const ANDROID_APK = {
  url: 'https://expo.dev/artifacts/eas/nOLjAEfHQUI8A7YPBZdHmj-24AOwOPh3MpRB4ZmugVU.apk',
  /** Rounded download size shown on the button. */
  sizeMb: 109,
  /** EAS build e4ddb97f (2026-11-26, app 1.0.0, commit 7c4cfc9). */
  buildId: 'e4ddb97f-2c81-4b52-bbfd-3414494e0734',
  /** Expo deletes the file after this day. */
  expiresOn: '2026-12-10',
} as const;
