import { router } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Pressable } from 'react-native';
import { useTheme } from '../../theme';
import { Icon } from './Icon';

/**
 * Go back; when there is no previous screen (the screen was opened directly,
 * e.g. after Log out), go to the start instead, which sends the user to Welcome
 * or Home. Never calls back() with nothing to go back to (the GO_BACK error).
 */
export function goBackOrHome() {
  if (router.canGoBack()) router.back();
  else router.replace('/');
}

/** Figma "03 · Log in" back button: 44px rounded square with an arrow. */
export function BackButton({ onPress }: { onPress?: () => void }) {
  const { t } = useTranslation();
  const { colors, radius, sizes } = useTheme();
  return (
    <Pressable
      testID="back"
      onPress={onPress ?? goBackOrHome}
      accessibilityRole="button"
      accessibilityLabel={t('mobile.auth.placeholder.back')}
      style={({ pressed }) => ({
        width: sizes.minTouchTarget,
        height: sizes.minTouchTarget,
        borderRadius: radius.button,
        borderWidth: 1,
        borderColor: colors.border,
        backgroundColor: colors.surface,
        alignItems: 'center',
        justifyContent: 'center',
        opacity: pressed ? 0.78 : 1,
      })}
    >
      <Icon name="arrow-left" size={20} color={colors.text} />
    </Pressable>
  );
}
