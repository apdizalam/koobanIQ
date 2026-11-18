/* eslint-disable import/no-unresolved, import/namespace, import/no-duplicates --
   expo-router/testing-library is published through the package "exports" map, which the
   lint import resolver cannot follow; TypeScript and Jest resolve it fine. */
import { act, fireEvent } from '@testing-library/react-native';
import { renderRouter, screen } from 'expo-router/testing-library';
import i18n from '../src/i18n';

// The real screens in src/app (Welcome → Language → Onboarding → Sign up / Log in).
const renderApp = (initialUrl = '/') => renderRouter('./src/app', { initialUrl });

/** Navigation is asynchronous, so every tap waits for the next screen. */
const press = (testID: string) =>
  act(async () => {
    fireEvent.press(screen.getByTestId(testID));
  });

afterEach(async () => {
  await act(async () => {
    await i18n.changeLanguage('en');
  });
});

describe('new user flow (Notion 8 · User Flow)', () => {
  it('starts at Welcome', async () => {
    await renderApp();
    expect(screen).toHavePathname('/welcome');
    expect(screen.getByText('Know Your Skills.\nFind Your Opportunity.')).toBeTruthy();
  });

  it('Get started → choose Somali → onboarding in Somali → 3 slides → sign up', async () => {
    await renderApp('/welcome');
    await press('welcome-start');
    expect(screen).toHavePathname('/language');

    await press('choose-so');
    expect(screen.getByText('Dooro luqaddaada')).toBeTruthy();
    await press('language-continue');
    expect(screen).toHavePathname('/onboarding');
    expect(screen.getByText('Ogow waxaad dhab ahaan taqaan')).toBeTruthy();

    await press('onboarding-next');
    await press('onboarding-next');
    expect(screen.getByText('Samee akoonkayga')).toBeTruthy();
    await press('onboarding-next');
    expect(screen).toHavePathname('/sign-up');
  });

  it('Back on onboarding: previous slide, then the language screen', async () => {
    await renderApp('/welcome');
    await press('welcome-start');
    await press('language-continue');
    expect(screen).toHavePathname('/onboarding');

    // Slide 3 shows "Create my account"; Back returns to slide 2 (button says Next again).
    await press('onboarding-next');
    await press('onboarding-next');
    expect(screen.getByText('Create my account')).toBeTruthy();
    await press('back');
    expect(screen.queryByText('Create my account')).toBeNull();
    expect(screen).toHavePathname('/onboarding');

    await press('back');
    await press('back');
    expect(screen).toHavePathname('/language');
  });

  it('Skip jumps straight to sign up', async () => {
    await renderApp('/onboarding');
    await press('onboarding-skip');
    expect(screen).toHavePathname('/sign-up');
  });

  it('"I already have an account" opens Log in', async () => {
    await renderApp('/welcome');
    await press('welcome-login');
    expect(screen).toHavePathname('/login');
  });
});
