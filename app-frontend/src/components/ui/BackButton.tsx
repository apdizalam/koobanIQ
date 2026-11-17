import { router } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Pressable } from 'react-native';
import { useTheme } from '../../theme';
import { Icon } from './Icon';

/** Figma "03 · Log in" back button: 44px rounded square with an arrow. */
export function BackButton({ onPress }: { onPress?: () => void }) {
  const { t } = useTranslation();
  const { colors, radius, sizes } = useTheme();
  return (
    <Pressable
      testID="back"
      onPress={onPress ?? (() => router.back())}
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
