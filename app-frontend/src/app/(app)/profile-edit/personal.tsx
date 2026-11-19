import { router } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { AuthScreen } from '../../../components/layout/AuthScreen';
import { ProfileForm } from '../../../components/profile/ProfileForm';
import { ProfileGate } from '../../../components/profile/ProfileGate';
import { PERSONAL_FIELDS } from '../../../profile/fields';
import { useProfile } from '../../../profile/ProfileProvider';

/**
 * Profile → Personal info (name, preferred title, profession, region, city, phone,
 * email shown on CVs, summary).
 */
export default function PersonalInfoScreen() {
  const { t } = useTranslation();
  const { savePersonal } = useProfile();
  return (
    <AuthScreen
      title={t('mobile.profile.sections.personal')}
      subtitle={t('mobile.profile.personalHint')}
    >
      <ProfileGate>
        {(profile) => (
          <ProfileForm
            testID="personal-form"
            fields={PERSONAL_FIELDS}
            initial={profile.personal}
            mode="update"
            onSubmit={async (body) => {
              await savePersonal(body);
              router.back();
            }}
          />
        )}
      </ProfileGate>
    </AuthScreen>
  );
}
