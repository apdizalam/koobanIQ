import { Redirect, useLocalSearchParams } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Text } from 'react-native';
import { AuthScreen } from '../../../../components/layout/AuthScreen';
import { ProfileForm } from '../../../../components/profile/ProfileForm';
import { ProfileGate } from '../../../../components/profile/ProfileGate';
import { SECTION_FIELDS } from '../../../../profile/fields';
import { useProfile } from '../../../../profile/ProfileProvider';
import { isProfileSection } from '../../../../types/profile';
import { useTheme } from '../../../../theme';
import { goBackOrHome } from '../../../../components/ui/BackButton';

/** Profile → add a new entry (`id` = "new") or edit / delete an existing one. */
export default function SectionItemScreen() {
  const { t } = useTranslation();
  const { colors, typography } = useTheme();
  const { addItem, updateItem, deleteItem } = useProfile();
  const { section, id } = useLocalSearchParams<{ section: string; id: string }>();
  if (!isProfileSection(section)) return <Redirect href="/profile" />;
  const isNew = id === 'new';

  return (
    <AuthScreen
      title={t(isNew ? 'mobile.profile.addTitle' : 'mobile.profile.editTitle', {
        section: t(`mobile.profile.sections.${section}`),
      })}
      subtitle={t(`mobile.profile.sectionHints.${section}`)}
    >
      <ProfileGate>
        {(profile) => {
          const item = isNew ? {} : profile[section].find((entry) => entry.id === id);
          // Opened for an entry that no longer exists (deleted on another device).
          if (!item) {
            return (
              <Text style={[typography.body, { color: colors.textMuted }]}>
                {t('mobile.profile.itemGone')}
              </Text>
            );
          }
          return (
            <ProfileForm
              testID={`${section}-form`}
              fields={SECTION_FIELDS[section]}
              initial={item}
              mode={isNew ? 'create' : 'update'}
              onSubmit={async (body) => {
                if (isNew) await addItem(section, body);
                else await updateItem(section, id, body);
                goBackOrHome();
              }}
              onDelete={
                isNew
                  ? undefined
                  : async () => {
                      await deleteItem(section, id);
                      goBackOrHome();
                    }
              }
            />
          );
        }}
      </ProfileGate>
    </AuthScreen>
  );
}
