import { router, type Href } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, Text, View } from 'react-native';
import { useAuth } from '../../../auth/authContext';
import { requestErrorKey } from '../../../auth/errorKey';
import { TabScreen } from '../../../components/layout/TabScreen';
import { CompletionBar } from '../../../components/profile/CompletionBar';
import { ProfileGate } from '../../../components/profile/ProfileGate';
import { Button } from '../../../components/ui/Button';
import { DashboardCard } from '../../../components/ui/DashboardCard';
import { LanguageSwitcher } from '../../../components/ui/LanguageSwitcher';
import { LineIcon } from '../../../components/ui/LineIcon';
import type { Language } from '../../../i18n/language';
import { useProfile } from '../../../profile/ProfileProvider';
import { useSkills } from '../../../profile/SkillsProvider';
import { PROFILE_SECTIONS, type Profile } from '../../../types/profile';
import { useTheme } from '../../../theme';

type SaveState = 'idle' | 'saving' | 'saved' | 'network' | 'generic';

type Row = { key: string; href: Href; summary: string };

/**
 * Profile tab (TIQ-6): completion, one row per part of the profile (each opens
 * its edit screen), the app language (PRD FR-I18N-02, saved to the account) and
 * Log out. Everything comes from the server, so it is the same after a restart.
 */
export default function ProfileTab() {
  const { t } = useTranslation();
  const { user, saveLanguage, signOut } = useAuth();
  const { reload } = useProfile();
  const skillsState = useSkills();
  const { colors, typography, spacing, radius } = useTheme();
  const [save, setSave] = useState<SaveState>('idle');
  const [leaving, setLeaving] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  async function changeLanguage(language: Language) {
    setSave('saving');
    try {
      await saveLanguage(language);
      setSave('saved');
    } catch (err) {
      setSave(requestErrorKey(err) === 'network' ? 'network' : 'generic');
    }
  }

  async function logOut() {
    setLeaving(true);
    await signOut();
    router.replace('/welcome');
  }

  function rows(profile: Profile): Row[] {
    const p = profile.personal;
    const prefs = profile.preferences;
    const count = (n: number) =>
      n === 0 ? t('mobile.profile.notAdded') : t('mobile.profile.entries', { count: n });
    const prefCount =
      prefs.titles.length +
      prefs.regions.length +
      prefs.cities.length +
      prefs.employerTypes.length +
      prefs.workModes.length +
      prefs.jobTypes.length;
    return [
      {
        key: 'personal',
        href: '/profile-edit/personal',
        summary:
          [p.fullName, p.headline].filter(Boolean).join(' · ') || t('mobile.profile.notAdded'),
      },
      {
        key: 'skills',
        href: '/skills',
        summary:
          skillsState.status === 'ready' && skillsState.counts.total > 0
            ? t('mobile.skills.summary', {
                assessed: skillsState.counts.assessed,
                total: skillsState.counts.total,
              })
            : t('mobile.profile.notAdded'),
      },
      ...PROFILE_SECTIONS.map((section) => ({
        key: section,
        href: { pathname: '/profile-edit/[section]', params: { section } } as Href,
        summary: count(profile[section].length),
      })),
      {
        key: 'preferences',
        href: '/profile-edit/preferences',
        summary: prefCount === 0 ? t('mobile.profile.notAdded') : t('mobile.profile.prefsSet'),
      },
    ];
  }

  return (
    <TabScreen
      testID="profile-screen"
      title={t('mobile.tabs.profile')}
      subtitle={user?.email}
      subtitleTestID="profile-email"
      refreshing={refreshing}
      onRefresh={async () => {
        setRefreshing(true);
        await Promise.all([reload(), skillsState.reload()]);
        setRefreshing(false);
      }}
    >
      <ProfileGate>
        {(profile) => (
          <View style={{ gap: spacing.md }}>
            <CompletionBar percent={profile.completion} />
            {rows(profile).map((row) => (
              <Pressable
                key={row.key}
                testID={`profile-row-${row.key}`}
                accessibilityRole="button"
                accessibilityLabel={`${t(`mobile.profile.sections.${row.key}` as 'mobile.profile.sections.personal')}, ${row.summary}`}
                onPress={() => router.push(row.href)}
                style={({ pressed }) => ({
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: spacing.md,
                  backgroundColor: colors.surface,
                  borderColor: colors.border,
                  borderWidth: 1,
                  borderRadius: radius.card,
                  padding: spacing.card,
                  opacity: pressed ? 0.8 : 1,
                })}
              >
                <View style={{ flex: 1, gap: spacing.xxs }}>
                  <Text style={[typography.bodyStrong, { color: colors.text }]}>
                    {t(`mobile.profile.sections.${row.key}` as 'mobile.profile.sections.personal')}
                  </Text>
                  <Text
                    numberOfLines={1}
                    style={[typography.bodySmall, { color: colors.textMuted }]}
                  >
                    {row.summary}
                  </Text>
                </View>
                <LineIcon name="chevron-right" color={colors.textMuted} size={20} />
              </Pressable>
            ))}
          </View>
        )}
      </ProfileGate>

      <DashboardCard title={t('common.language.label')} body={t('mobile.profile.languageHint')}>
        <LanguageSwitcher onChange={(language) => void changeLanguage(language)} />
        {save === 'saved' ? (
          <Text
            testID="profile-language-saved"
            style={[typography.bodySmall, { color: colors.successText }]}
          >
            {t('mobile.profile.languageSaved')}
          </Text>
        ) : null}
        {save === 'network' || save === 'generic' ? (
          <Text
            testID="profile-language-error"
            accessibilityRole="alert"
            style={[typography.bodySmall, { color: colors.errorText }]}
          >
            {t(`mobile.profile.languageError.${save}`)}
          </Text>
        ) : null}
      </DashboardCard>

      <Button
        variant="secondary"
        label={t('mobile.profile.logout')}
        onPress={() => void logOut()}
        loading={leaving}
        testID="profile-logout"
      />
    </TabScreen>
  );
}
