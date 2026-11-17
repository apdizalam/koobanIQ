import { act, cleanup, fireEvent, render, screen } from '@testing-library/react-native';
import i18n from '../src/i18n';
import { detectLanguage } from '../src/i18n/language';
import { DesignSystemPreview } from '../src/screens/DesignSystemPreview';
import { ThemeProvider } from '../src/theme';

afterEach(async () => {
  await cleanup();
  await act(async () => {
    await i18n.changeLanguage('en');
  });
});

describe('detectLanguage', () => {
  it('uses Somali when the phone is set to Somali', () => {
    expect(detectLanguage(['so'])).toBe('so');
    expect(detectLanguage(['ar', 'SO'])).toBe('so');
  });

  it('falls back to English for every other language', () => {
    expect(detectLanguage(['en'])).toBe('en');
    expect(detectLanguage(['fr', null])).toBe('en');
    expect(detectLanguage([])).toBe('en');
  });
});

describe('language switch on the preview screen', () => {
  const renderScreen = () =>
    render(
      <ThemeProvider preference="light">
        <DesignSystemPreview scheme="light" onToggleScheme={() => undefined} />
      </ThemeProvider>,
    );

  it('switches every visible text to Somali and back, without a restart', async () => {
    await renderScreen();
    expect(screen.getByText('KOBANIQ design system')).toBeTruthy();
    expect(screen.getByText('Continue')).toBeTruthy();

    await act(async () => {
      fireEvent.press(screen.getByTestId('language-so'));
    });
    expect(screen.getByText('Nidaamka naqshadda KOBANIQ')).toBeTruthy();
    expect(screen.getByText('Sii wad')).toBeTruthy();
    // The strong-match badge appears twice: in the badge row and on the job card.
    expect(screen.getAllByText('Isku-beeg xooggan · 92%')).toHaveLength(2);
    expect(screen.queryByText('Continue')).toBeNull();

    await act(async () => {
      fireEvent.press(screen.getByTestId('language-en'));
    });
    expect(screen.getByText('Continue')).toBeTruthy();
  });
});
