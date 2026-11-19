import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Text, View, type KeyboardTypeOptions } from 'react-native';
import { requestErrorKey, type RequestErrorKey } from '../../auth/errorKey';
import { formBody, toFormText, type FieldDef } from '../../profile/fields';
import { ApiError } from '../../services/api';
import { useTheme } from '../../theme';
import { Button } from '../ui/Button';
import { Chip } from '../ui/Chip';
import { FormMessage } from '../ui/FormMessage';
import { Input } from '../ui/Input';

interface ProfileFormProps {
  fields: FieldDef[];
  /** Current values (empty for a new entry). */
  initial: Record<string, unknown>;
  mode: 'create' | 'update';
  onSubmit: (body: Record<string, unknown>) => Promise<void>;
  /** Shown for existing entries: asks once more, then deletes. */
  onDelete?: () => Promise<void>;
  testID?: string;
}

const KEYBOARD: Partial<Record<FieldDef['kind'], KeyboardTypeOptions>> = {
  year: 'number-pad',
  phone: 'phone-pad',
  url: 'url',
  month: 'numbers-and-punctuation',
};

/**
 * One form for every profile part. The server checks each value and answers
 * per field, in the app language; those messages appear under the fields.
 */
export function ProfileForm({
  fields,
  initial,
  mode,
  onSubmit,
  onDelete,
  testID = 'profile-form',
}: ProfileFormProps) {
  const { t } = useTranslation();
  const { colors, typography, spacing } = useTheme();
  const [texts, setTexts] = useState<Record<string, string>>(() =>
    Object.fromEntries(fields.map((f) => [f.key, toFormText(initial[f.key])])),
  );
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [failure, setFailure] = useState<RequestErrorKey | null>(null);
  /** A refusal the server explained (e.g. "You already have this skill"), already in the app language. */
  const [serverMessage, setServerMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [confirming, setConfirming] = useState(false);

  const set = (key: string, value: string) => {
    setTexts((now) => ({ ...now, [key]: value }));
    setFieldErrors((now) => ({ ...now, [key]: '' }));
  };

  async function attempt(action: () => Promise<void>) {
    if (busy) return;
    setBusy(true);
    setFailure(null);
    setServerMessage(null);
    setFieldErrors({});
    try {
      await action();
    } catch (err) {
      const details = err instanceof ApiError ? err.details : {};
      if (Object.keys(details).length > 0) setFieldErrors(details);
      else if (
        err instanceof ApiError &&
        err.status >= 400 &&
        err.status < 500 &&
        err.status !== 401
      )
        setServerMessage(err.message);
      else setFailure(requestErrorKey(err));
      setBusy(false);
      setConfirming(false);
    }
  }

  const label = (field: FieldDef) =>
    `${t(`mobile.profile.fields.${field.key}` as 'mobile.profile.fields.title')}${field.required ? ' *' : ''}`;

  return (
    <View style={{ gap: spacing.lg }} testID={testID}>
      {fields.map((field) =>
        field.kind === 'choice' ? (
          <View key={field.key} style={{ gap: spacing.sm }}>
            <Text style={[typography.labelMedium, { color: colors.text }]}>{label(field)}</Text>
            <View
              accessibilityRole="radiogroup"
              accessibilityLabel={label(field)}
              style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm }}
            >
              {(field.choices ?? []).map((choice) => {
                const selected = texts[field.key] === choice;
                return (
                  <Chip
                    key={choice}
                    testID={`field-${field.key}-${choice}`}
                    label={t(`${field.choiceLabels}.${choice}` as 'common.region.somalia')}
                    selected={selected}
                    // Tapping the chosen one again clears it (unless the field is required).
                    onPress={() => set(field.key, selected && !field.required ? '' : choice)}
                  />
                );
              })}
            </View>
            {fieldErrors[field.key] ? (
              <Text style={[typography.bodySmall, { color: colors.errorText }]}>
                {fieldErrors[field.key]}
              </Text>
            ) : null}
          </View>
        ) : (
          <Input
            key={field.key}
            testID={`field-${field.key}`}
            label={label(field)}
            value={texts[field.key]}
            onChangeText={(value) => set(field.key, value)}
            multiline={field.kind === 'multiline'}
            maxLength={field.maxLength}
            keyboardType={KEYBOARD[field.kind]}
            autoCapitalize={field.kind === 'url' ? 'none' : 'sentences'}
            autoCorrect={field.kind !== 'url'}
            placeholder={
              field.kind === 'month'
                ? field.key === 'endDate'
                  ? t('mobile.profile.hints.endDate')
                  : t('mobile.profile.hints.month')
                : field.kind === 'list'
                  ? t('mobile.profile.hints.list')
                  : field.kind === 'url'
                    ? 'https://'
                    : undefined
            }
            editable={!busy}
            errorMessage={fieldErrors[field.key] || undefined}
          />
        ),
      )}

      {serverMessage ? <FormMessage text={serverMessage} /> : null}
      {failure ? <FormMessage text={t(`mobile.auth.errors.${failure}`)} /> : null}

      <Button
        label={busy ? t('mobile.profile.saving') : t('mobile.profile.save')}
        onPress={() => void attempt(() => onSubmit(formBody(fields, texts, mode)))}
        loading={busy && !confirming}
        testID={`${testID}-save`}
      />

      {onDelete ? (
        confirming ? (
          <View style={{ gap: spacing.sm }}>
            <FormMessage tone="info" text={t('mobile.profile.deleteConfirm')} />
            <Button
              variant="secondary"
              label={t('mobile.profile.deleteYes')}
              onPress={() => void attempt(onDelete)}
              loading={busy}
              testID={`${testID}-delete-yes`}
            />
            <Button
              variant="ghost"
              label={t('mobile.profile.cancel')}
              onPress={() => setConfirming(false)}
              disabled={busy}
            />
          </View>
        ) : (
          <Button
            variant="ghost"
            label={t('mobile.profile.delete')}
            onPress={() => setConfirming(true)}
            disabled={busy}
            testID={`${testID}-delete`}
          />
        )
      ) : null}
    </View>
  );
}
