import { Redirect, router, useLocalSearchParams } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Pressable, Text, View } from 'react-native';
import { AuthScreen } from '../../../../components/layout/AuthScreen';
import { ProfileGate } from '../../../../components/profile/ProfileGate';
import { Button } from '../../../../components/ui/Button';
import { itemSummary } from '../../../../profile/fields';
import { isProfileSection } from '../../../../types/profile';
import { useTheme } from '../../../../theme';

/** Profile → one list section (experience, education, ...): its entries and "Add". */
export default function SectionListScreen() {
  const { t } = useTranslation();
  const { colors, typography, spacing, radius } = useTheme();
  const { section } = useLocalSearchParams<{ section: string }>();
  if (!isProfileSection(section)) return <Redirect href="/profile" />;

  const words = {
    now: t('mobile.profile.now'),
    level: (level: string) => t(`mobile.profile.levels.${level}` as 'mobile.profile.levels.basic'),
  };

  return (
    <AuthScreen
      title={t(`mobile.profile.sections.${section}`)}
      subtitle={t(`mobile.profile.sectionHints.${section}`)}
    >
      <ProfileGate>
        {(profile) => (
          <View style={{ gap: spacing.md }} testID={`section-${section}`}>
            {profile[section].length === 0 ? (
              <Text style={[typography.body, { color: colors.textMuted }]}>
                {t('mobile.profile.emptySection')}
              </Text>
            ) : null}
            {profile[section].map((item) => {
              const summary = itemSummary(section, item, words);
              return (
                <Pressable
                  key={item.id}
                  testID={`item-${item.id}`}
                  accessibilityRole="button"
                  accessibilityLabel={`${summary.title}, ${summary.detail}`}
                  onPress={() =>
                    router.push({
                      pathname: '/profile-edit/[section]/[id]',
                      params: { section, id: item.id },
                    })
                  }
                  style={({ pressed }) => ({
                    backgroundColor: colors.surface,
                    borderColor: colors.border,
                    borderWidth: 1,
                    borderRadius: radius.card,
                    padding: spacing.card,
                    gap: spacing.xs,
                    opacity: pressed ? 0.8 : 1,
                  })}
                >
                  <Text style={[typography.bodyStrong, { color: colors.text }]}>
                    {summary.title}
                  </Text>
                  {summary.detail ? (
                    <Text style={[typography.bodySmall, { color: colors.textMuted }]}>
                      {summary.detail}
                    </Text>
                  ) : null}
                </Pressable>
              );
            })}
            <Button
              variant="secondary"
              label={t('mobile.profile.add')}
              onPress={() =>
                router.push({
                  pathname: '/profile-edit/[section]/[id]',
                  params: { section, id: 'new' },
                })
              }
              testID={`${section}-add`}
            />
          </View>
        )}
      </ProfileGate>
    </AuthScreen>
  );
}
