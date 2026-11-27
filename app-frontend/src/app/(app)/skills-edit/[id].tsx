import { router, useLocalSearchParams } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Text, View } from 'react-native';
import { AuthScreen } from '../../../components/layout/AuthScreen';
import { ProfileForm } from '../../../components/profile/ProfileForm';
import { Button } from '../../../components/ui/Button';
import type { FieldDef } from '../../../profile/fields';
import { useSkills } from '../../../profile/SkillsProvider';
import { SKILL_LEVELS } from '../../../types/skills';
import { useTheme } from '../../../theme';
import { formatDate } from '../../../utils/format';
import { goBackOrHome } from '../../../components/ui/BackButton';

/** What the user can set. The assessed level is not here: only a quiz sets it. */
const SKILL_FIELDS: FieldDef[] = [
  {
    key: 'name',
    kind: 'text',
    required: true,
    maxLength: 60,
    placeholder: 'mobile.inputs.skill.name',
    help: 'mobile.inputs.skill.nameHelp',
  },
  {
    key: 'selfLevel',
    kind: 'choice',
    required: true,
    choices: SKILL_LEVELS,
    choiceLabels: 'mobile.skills.levels',
  },
  { key: 'category', kind: 'text', maxLength: 40, placeholder: 'mobile.inputs.skill.category' },
  {
    key: 'yearsExp',
    kind: 'year',
    placeholder: 'mobile.inputs.skill.yearsExp',
    help: 'mobile.inputs.skill.yearsExpHelp',
  },
];

/** Add a skill (`id` = "new"), or edit / delete one. */
export default function SkillEditScreen() {
  const { t, i18n } = useTranslation();
  const { colors, typography, spacing, radius } = useTheme();
  const { skills, status, add, update, remove } = useSkills();
  const { id } = useLocalSearchParams<{ id: string }>();
  const isNew = id === 'new';
  const skill = isNew ? null : skills.find((s) => s.id === id);

  return (
    <AuthScreen
      title={t(isNew ? 'mobile.skills.addTitle' : 'mobile.skills.editTitle')}
      subtitle={t('mobile.skills.formHint')}
    >
      {!isNew && !skill ? (
        <Text style={[typography.body, { color: colors.textMuted }]}>
          {status === 'loading' ? t('common.loading') : t('mobile.profile.itemGone')}
        </Text>
      ) : (
        <View style={{ gap: spacing.lg }}>
          {skill?.assessedLevel ? (
            <View
              testID="skill-assessed"
              style={{
                backgroundColor: colors.primarySoft,
                borderRadius: radius.card,
                padding: spacing.card,
                gap: spacing.xs,
              }}
            >
              <Text style={[typography.bodyStrong, { color: colors.text }]}>
                {t('mobile.skills.assessedAs', {
                  level: t(`mobile.skills.levels.${skill.assessedLevel}`),
                })}
              </Text>
              {skill.lastAssessedAt ? (
                <Text style={[typography.bodySmall, { color: colors.textMuted }]}>
                  {t('mobile.skills.assessedOn', {
                    date: formatDate(skill.lastAssessedAt, i18n.language),
                  })}
                </Text>
              ) : null}
              {skill.gaps.length > 0 ? (
                <Text style={[typography.bodySmall, { color: colors.textMuted }]}>
                  {t('mobile.skills.toLearn', { topics: skill.gaps.join(', ') })}
                </Text>
              ) : null}
              <Text style={[typography.bodySmall, { color: colors.textMuted }]}>
                {t('mobile.skills.onlyQuiz')}
              </Text>
            </View>
          ) : null}
          {skill ? (
            <Button
              variant="secondary"
              label={t('mobile.skills.quizThis')}
              onPress={() => router.push({ pathname: '/quiz', params: { skillId: skill.id } })}
              testID="skill-quiz"
            />
          ) : null}
          <ProfileForm
            testID="skill-form"
            fields={SKILL_FIELDS}
            initial={{ ...skill }}
            mode={isNew ? 'create' : 'update'}
            onSubmit={async (body) => {
              if (isNew) await add(body);
              else await update(id, body);
              goBackOrHome();
            }}
            onDelete={
              isNew
                ? undefined
                : async () => {
                    await remove(id);
                    goBackOrHome();
                  }
            }
          />
        </View>
      )}
    </AuthScreen>
  );
}
