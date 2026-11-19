This is an Expo/React Native mobile application. Prioritize mobile-first patterns, performance, and cross-platform compatibility.

## Expo has changed — do not trust your training data

Expo ships breaking changes every SDK release. APIs you remember are likely renamed, moved, or removed. Before writing any code that touches an Expo, EAS, or React Native API:

1. Read the major version of the `expo` package in `package.json`.
2. Fetch the matching versioned docs: `https://docs.expo.dev/versions/v<major>.0.0/`
3. For anything else, fetch https://docs.expo.dev/llms.txt — an index of all Expo docs with corrections to common LLM misconceptions. Follow its links to the specific page you need; never answer from memory.

## Commands

Use `bunx` instead of `npx` if the project uses bun (`bun.lock` present).

```bash
npx expo install <package>  # ALWAYS use instead of npm/yarn/pnpm/bun add — resolves SDK-compatible versions
npx expo start              # start the dev server
npx expo lint               # lint
npx tsc --noEmit            # typecheck
npx expo-doctor             # diagnose dependency and config issues
npx expo install --fix      # fix incompatible package versions
```

Run lint and typecheck before declaring any task done.

## Navigation & Routing

- Use **Expo Router** for all navigation. Routes live in `src/app/` — every file there is a screen, `_layout.tsx` files define navigators. Keep non-route code (components, hooks, utils) outside `src/app/`.
- Import `Link`, `router`, and `useLocalSearchParams` from `expo-router`.
- Docs: https://docs.expo.dev/router/introduction.md

## Building with EAS

Use EAS to build, sign, and submit the app in the cloud (`eas build`, `eas submit`) and to ship over-the-air updates (`eas update`) — no local Xcode or Android Studio required. Run EAS CLI as `bunx eas-cli <command>` in Bun projects, or `npx eas-cli@latest <command>` otherwise; substitute that for bare `eas` in docs examples.
Docs: https://docs.expo.dev/eas/index.md

## Rules

- If `ios/` and `android/` directories do not exist, they are generated (Continuous Native Generation). Never create or edit them by hand — configure native behavior in `app.json` and config plugins.
- Expo Go only includes its bundled native modules. After adding a library with native code, the app needs a development build: `npx expo run:ios|android` locally, or `eas build --profile development`.
- Prefer recommended Expo modules over third-party libraries, and check your available skills before adding dependencies. Docs: https://docs.expo.dev/versions/latest/index.md

## Folder structure

```
src/app/                   Expo Router routes (every file is a screen; _layout.tsx files are navigators)
  _layout.tsx              root: fonts, theme, translations, AuthProvider, Stack
  index.tsx                start: redirects to /welcome (later: Home when signed in)
  (auth)/                  screens before sign-in: welcome, language, onboarding, login, sign-up
  (app)/                   signed-in screens; its _layout sends signed-out visitors to /welcome
    (tabs)/                bottom tabs: home, cv, jobs, reports, profile (_layout = tab bar)
    profile-edit/          profile edit screens: personal, preferences, [section] list, [section]/[id] entry
    skills.tsx, skills-edit/[id].tsx  skill profile (design 05) and add / edit a skill
    cv-job/                new CV: index = add a job ad (paste / PDF), [id] = job details + CV language
    cv-view/[id].tsx       one CV: missing info, preview, generate again / other language, delete
  design-system.tsx        developer preview of all components (kobaniq://design-system)
assets/icons/              SVG icons used by <Icon>
assets/images/             app icon, splash and favicon (referenced from app.json)
src/components/ui/         one reusable UI component per file (Button, Input, Chip, BackButton, ...)
src/auth/                  sign-in state: AuthProvider/useAuth, refresh token in expo-secure-store
src/components/layout/     page building blocks (Screen, TabScreen, TabComingSoon, AuthScreen, ComingNext)
src/components/onboarding/ onboarding illustrations
src/components/profile/    ProfileForm (one form for every profile part), ProfileGate, CompletionBar
src/components/cv/         JobDetails, CvPreview, MissingInfoList, GenerateMessages
src/cv/                    CvProvider/useCvs (CVs + saved job ads), useGenerateCv, aiErrorText
src/profile/               ProfileProvider/useProfile, SkillsProvider/useSkills (shared state) and fields.ts (field rules)
src/components/index.ts    small re-export of the original ui components
src/constants/             non-design app constants (api.ts)
src/hooks/                 React hooks (useAppFonts, useSchemeOverride)
src/i18n/                  i18next setup using the shared packages/shared/i18n files
src/services/              API calls: api.ts (fetch + ApiError), authApi.ts, meApi.ts (GET/PATCH /me), profileApi.ts, skillsApi.ts, cvApi.ts
src/screens/               screen bodies reused by routes (DesignSystemPreview)
src/theme/                 ALL design tokens: colors.ts, typography.ts, spacing.ts (+ radius, sizes),
                           createTheme.ts and ThemeProvider.tsx. The only place tokens are defined.
src/types/                 domain types shared by several files (match.ts, auth.ts, profile.ts, skills.ts, cv.ts)
src/utils/                 pure helpers (contrast.ts, format.ts, greeting.ts, hitSlop.ts, validation.ts with Zod)
```

Never define colors or
spacing outside `src/theme/`. Keep tests out of `src/app` (Expo Router would treat them as routes).
