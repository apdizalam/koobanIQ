import type { Language } from '../i18n/language';

let chosenWhileSignedOut = false;

/** The admin picked a language on the login page during this visit. */
export function markLanguageChosenWhileSignedOut() {
  chosenWhileSignedOut = true;
}

/** Reads and clears the "picked on the login page" flag (used once, at sign-in). */
export function takeLanguageChosenWhileSignedOut(): boolean {
  const chosen = chosenWhileSignedOut;
  chosenWhileSignedOut = false;
  return chosen;
}

export type LanguageDecision =
  | { action: 'none' }
  | { action: 'adopt'; language: Language }
  | { action: 'save'; language: Language };

/**
 * When an admin signs in (or a session is restored), which language wins?
 * - The account's saved language, so the choice follows the admin to any device;
 * - unless they picked one on the login page just now: then that one is saved.
 */
export function decideLanguageOnSignIn(
  current: Language,
  saved: Language,
  pickedOnLoginPage: boolean,
): LanguageDecision {
  if (current === saved) return { action: 'none' };
  return pickedOnLoginPage
    ? { action: 'save', language: current }
    : { action: 'adopt', language: saved };
}
