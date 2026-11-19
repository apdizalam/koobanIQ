import { router } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Text, View } from 'react-native';
import { requestErrorKey, type RequestErrorKey } from '../../../auth/errorKey';
import { AuthScreen } from '../../../components/layout/AuthScreen';
import { ProfileGate } from '../../../components/profile/ProfileGate';
import { Button } from '../../../components/ui/Button';
import { Chip } from '../../../components/ui/Chip';
import { FormMessage } from '../../../components/ui/FormMessage';
import { Input } from '../../../components/ui/Input';
import { useProfile } from '../../../profile/ProfileProvider';
import { ApiError } from '../../../services/api';
import {
  EMPLOYER_TYPES,
  JOB_TYPES,
  REGION_KEYS,
  WORK_MODES,
  type Preferences,
} from '../../../types/profile';
import { useTheme } from '../../../theme';

type ChoiceKey = 'regions' | 'employerTypes' | 'workModes' | 'jobTypes';

const CHOICES: { key: ChoiceKey; values: readonly string[]; labels: string }[] = [
  { key: 'regions', values: REGION_KEYS, labels: 'common.region' },
  { key: 'employerTypes', values: EMPLOYER_TYPES, labels: 'common.employerType' },
  { key: 'workModes', values: WORK_MODES, labels: 'mobile.profile.workModes' },
  { key: 'jobTypes', values: JOB_TYPES, labels: 'mobile.profile.jobTypes' },
];

const splitList = (text: string) =>
  text
    .split(',')
    .map((part) => part.trim())
    .filter(Boolean);

/** The form, once the profile is loaded. */
function PreferencesForm({ initial }: { initial: Preferences }) {
  const { t } = useTranslation();
  const { colors, typography, spacing } = useTheme();
  const { savePreferences } = useProfile();
  const [chosen, setChosen] = useState<Record<ChoiceKey, string[]>>({
    regions: initial.regions,
    employerTypes: initial.employerTypes,
    workModes: initial.workModes,
    jobTypes: initial.jobTypes,
  });
  const [titles, setTitles] = useState(initial.titles.join(', '));
  const [cities, setCities] = useState(initial.cities.join(', '));
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [failure, setFailure] = useState<RequestErrorKey | null>(null);
  const [busy, setBusy] = useState(false);

  const toggle = (key: ChoiceKey, value: string) =>
    setChosen((now) => ({
      ...now,
      [key]: now[key].includes(value) ? now[key].filter((v) => v !== value) : [...now[key], value],
    }));

  async function save() {
    if (busy) return;
    setBusy(true);
    setErrors({});
    setFailure(null);
    try {
      await savePreferences({ ...chosen, titles: splitList(titles), cities: splitList(cities) });
      router.back();
    } catch (err) {
      const details = err instanceof ApiError ? err.details : {};
      if (Object.keys(details).length > 0) setErrors(details);
      else setFailure(requestErrorKey(err));
      setBusy(false);
    }
  }

  return (
    <View style={{ gap: spacing.lg }} testID="preferences-form">
      <Input
        testID="field-titles"
        label={t('mobile.profile.fields.titles')}
        value={titles}
        onChangeText={setTitles}
        placeholder={t('mobile.profile.hints.list')}
        errorMessage={errors.titles || undefined}
        editable={!busy}
      />
      {CHOICES.map(({ key, values, labels }) => (
        <View key={key} style={{ gap: spacing.sm }}>
          <Text style={[typography.labelMedium, { color: colors.text }]}>
            {t(`mobile.profile.fields.${key}`)}
          </Text>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm }}>
            {values.map((value) => (
              <Chip
                key={value}
                testID={`pref-${key}-${value}`}
                label={t(`${labels}.${value}` as 'common.region.somalia')}
                selected={chosen[key].includes(value)}
                onPress={() => toggle(key, value)}
              />
            ))}
          </View>
          {errors[key] ? (
            <Text style={[typography.bodySmall, { color: colors.errorText }]}>{errors[key]}</Text>
          ) : null}
        </View>
      ))}
      <Input
        testID="field-cities"
        label={t('mobile.profile.fields.cities')}
        value={cities}
        onChangeText={setCities}
        placeholder={t('mobile.profile.hints.list')}
        errorMessage={errors.cities || undefined}
        editable={!busy}
      />
      {failure ? <FormMessage text={t(`mobile.auth.errors.${failure}`)} /> : null}
      <Button
        label={busy ? t('mobile.profile.saving') : t('mobile.profile.save')}
        onPress={() => void save()}
        loading={busy}
        testID="preferences-save"
      />
    </View>
  );
}

/** Profile → Job preferences: titles, regions, cities, employer types, work modes, job types. */
export default function PreferencesScreen() {
  const { t } = useTranslation();
  return (
    <AuthScreen
      title={t('mobile.profile.sections.preferences')}
      subtitle={t('mobile.profile.sectionHints.preferences')}
    >
      <ProfileGate>{(profile) => <PreferencesForm initial={profile.preferences} />}</ProfileGate>
    </AuthScreen>
  );
}
