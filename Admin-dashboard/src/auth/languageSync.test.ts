import { describe, expect, it } from 'vitest';
import {
  decideLanguageOnSignIn,
  markLanguageChosenWhileSignedOut,
  takeLanguageChosenWhileSignedOut,
} from './languageSync';

describe('decideLanguageOnSignIn', () => {
  it('does nothing when the screen already shows the saved language', () => {
    expect(decideLanguageOnSignIn('so', 'so', false)).toEqual({ action: 'none' });
    expect(decideLanguageOnSignIn('en', 'en', true)).toEqual({ action: 'none' });
  });

  it('switches to the account language (it follows the admin to any device)', () => {
    expect(decideLanguageOnSignIn('en', 'so', false)).toEqual({ action: 'adopt', language: 'so' });
  });

  it('saves the language picked on the login page just before signing in', () => {
    expect(decideLanguageOnSignIn('so', 'en', true)).toEqual({ action: 'save', language: 'so' });
  });
});

describe('login-page choice flag', () => {
  it('is read once and then cleared', () => {
    expect(takeLanguageChosenWhileSignedOut()).toBe(false);
    markLanguageChosenWhileSignedOut();
    expect(takeLanguageChosenWhileSignedOut()).toBe(true);
    expect(takeLanguageChosenWhileSignedOut()).toBe(false);
  });
});
