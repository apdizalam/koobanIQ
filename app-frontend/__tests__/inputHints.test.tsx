/// <reference types="node" />
import { act, fireEvent, render as rtlRender, screen } from '@testing-library/react-native';
import type { ReactElement } from 'react';
import { readFileSync, readdirSync, statSync } from 'fs';
import { join } from 'path';
import en from '@kobaniq/shared/i18n/en.json';
import so from '@kobaniq/shared/i18n/so.json';
import { ProfileForm } from '../src/components/profile/ProfileForm';
import i18n from '../src/i18n';
import { PERSONAL_FIELDS, SECTION_FIELDS, type FieldDef } from '../src/profile/fields';
import { ThemeProvider } from '../src/theme';

const render = (ui: ReactElement) =>
  rtlRender(<ThemeProvider preference="light">{ui}</ThemeProvider>);

/** Examples inside empty fields and help lines under them, in the app language. */
const read = (dict: unknown, key: string) =>
  key.split('.').reduce<unknown>((o, k) => (o as Record<string, unknown>)?.[k], dict);

const ALL_FIELDS: [string, FieldDef[]][] = [
  ['personal', PERSONAL_FIELDS],
  ...(Object.entries(SECTION_FIELDS) as [string, FieldDef[]][]),
];

afterEach(async () => {
  await act(async () => {
    await i18n.changeLanguage('en');
  });
});

describe('profile fields have their own example and help', () => {
  it('every typed profile field has an example, in English and Somali', () => {
    for (const [section, fields] of ALL_FIELDS) {
      for (const field of fields) {
        if (field.kind === 'choice' || field.kind === 'month' || field.kind === 'url') continue;
        expect({ section, key: field.key, placeholder: field.placeholder }).toEqual(
          expect.objectContaining({ placeholder: expect.any(String) }),
        );
        for (const key of [field.placeholder, field.help].filter(Boolean) as string[]) {
          expect(read(en, key)).toEqual(expect.any(String));
          expect(read(so, key)).toEqual(expect.any(String));
        }
      }
    }
  });

  it('the same field name gets wording for its own section (no one-size-fits-all text)', () => {
    const name = (section: string) =>
      SECTION_FIELDS[section as keyof typeof SECTION_FIELDS].find((f) => f.key === 'name')
        ?.placeholder;
    expect(name('projects')).not.toBe(name('certifications'));
    const description = (section: 'experience' | 'projects') =>
      SECTION_FIELDS[section].find((f) => f.key === 'description')?.placeholder;
    expect(description('experience')).not.toBe(description('projects'));
  });
});

describe('ProfileForm shows the examples and help in the app language', () => {
  const experience = SECTION_FIELDS.experience;

  it('English: examples inside the fields, help under the description, labels kept', async () => {
    await render(
      <ProfileForm fields={experience} initial={{}} mode="create" onSubmit={jest.fn()} />,
    );
    expect(screen.getByPlaceholderText(en.mobile.inputs.experience.title)).toBeTruthy();
    expect(screen.getByPlaceholderText(en.mobile.inputs.experience.employer)).toBeTruthy();
    expect(screen.getByPlaceholderText(en.mobile.inputs.experience.description)).toBeTruthy();
    expect(screen.getByText(en.mobile.inputs.experience.descriptionHelp)).toBeTruthy();
    // The labels stay visible: the examples are extra guidance, not a replacement.
    expect(screen.getByText(`${en.mobile.profile.fields.title} *`)).toBeTruthy();
  });

  it('Somali: switching the language changes every example at once', async () => {
    await render(
      <ProfileForm fields={experience} initial={{}} mode="create" onSubmit={jest.fn()} />,
    );
    await act(async () => {
      await i18n.changeLanguage('so');
    });
    expect(screen.getByPlaceholderText(so.mobile.inputs.experience.title)).toBeTruthy();
    expect(screen.getByPlaceholderText(so.mobile.inputs.experience.description)).toBeTruthy();
    expect(screen.getByText(so.mobile.inputs.experience.descriptionHelp)).toBeTruthy();
    expect(screen.queryByPlaceholderText(en.mobile.inputs.experience.title)).toBeNull();
  });

  it('an example is never sent as data: empty fields stay empty, typed values are sent', async () => {
    const onSubmit = jest.fn(async () => undefined);
    await render(
      <ProfileForm fields={experience} initial={{}} mode="create" onSubmit={onSubmit} />,
    );
    await act(async () => {
      await fireEvent.changeText(screen.getByTestId('field-title'), 'Accountant');
    });
    await act(async () => {
      await fireEvent.press(screen.getByTestId('profile-form-save'));
    });
    expect(onSubmit).toHaveBeenCalledWith({ title: 'Accountant' });
  });

  it('a list field explains how to separate entries', async () => {
    await render(
      <ProfileForm
        fields={SECTION_FIELDS.projects}
        initial={{}}
        mode="create"
        onSubmit={jest.fn()}
      />,
    );
    expect(screen.getByPlaceholderText(en.mobile.inputs.projects.skills)).toBeTruthy();
    expect(screen.getByText(en.mobile.profile.hints.list)).toBeTruthy();
  });
});

/** Every .tsx file of the app (screens and components). */
function sources(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    return statSync(path).isDirectory() ? sources(path) : path.endsWith('.tsx') ? [path] : [];
  });
}

describe('no text field without guidance', () => {
  it('every <Input> in the app has an example (placeholder) or is built from field definitions', () => {
    const root = join(__dirname, '..', 'src');
    const missing: string[] = [];
    for (const file of sources(root)) {
      if (file.includes('DesignSystemPreview') || file.endsWith(join('ui', 'Input.tsx'))) continue;
      const text = readFileSync(file, 'utf8');
      for (const match of text.matchAll(/<Input\b([\s\S]*?)\/>/g)) {
        const props = match[1];
        // Time of day: its help line already shows the format ("e.g. 08:00").
        if (/placeholder=|schedule\.timeHint/.test(props)) continue;
        missing.push(`${file.slice(root.length)}: ${props.trim().split('\n')[0]}`);
      }
    }
    expect(missing).toEqual([]);
  });
});
