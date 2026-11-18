import { router } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Text } from 'react-native';
import { useAuth } from '../../../auth/authContext';
import { requestErrorKey } from '../../../auth/errorKey';
import { TabScreen } from '../../../components/layout/TabScreen';
import { Button } from '../../../components/ui/Button';
import { DashboardCard } from '../../../components/ui/DashboardCard';
import { LanguageSwitcher } from '../../../components/ui/LanguageSwitcher';
import type { Language } from '../../../i18n/language';
import { useTheme } from '../../../theme';

type SaveState = 'idle' | 'saving' | 'saved' | 'network' | 'generic';

/**
 * Profile tab: the account, the app language (PRD FR-I18N-02: Profile →
 * Settings; saved to the account so it follows the user to any device) and
 * Log out. Profile details (profession, experience, skills) come with TIQ-6.
 */
export default function ProfileTab() {
  const { t } = useTranslation();
  const { user, saveLanguage, signOut } = useAuth();
  const { colors, typography } = useTheme();
  const [save, setSave] = useState<SaveState>('idle');
  const [leaving, setLeaving] = useState(false);

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

  return (
    <TabScreen testID="profile-screen" title={t('mobile.tabs.profile')}>
      <DashboardCard title={t('mobile.profile.account')}>
        <Text testID="profile-email" style={[typography.bodyStrong, { color: colors.text }]}>
          {user?.email}
        </Text>
      </DashboardCard>

      <DashboardCard
        title={t('mobile.profile.details.title')}
        body={t('mobile.profile.details.body')}
      />

      <DashboardCard title={t('common.language.label')} body={t('mobile.profile.languageHint')}>
        <LanguageSwitcher onChange={(language) => void changeLanguage(language)} />
        {save === 'saved' ? (
          <Text
            testID="profile-language-saved"
            accessibilityRole="text"
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
