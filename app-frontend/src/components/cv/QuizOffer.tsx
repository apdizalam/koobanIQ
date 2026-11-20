import { router } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Text, View } from 'react-native';
import { useSkills } from '../../profile/SkillsProvider';
import type { JobDescription } from '../../types/cv';
import type { Skill } from '../../types/skills';
import { useTheme } from '../../theme';
import { Button } from '../ui/Button';
import { FormMessage } from '../ui/FormMessage';
import { TextLink } from '../ui/TextLink';

const sameName = (a: string, b: string) =>
  a.trim().replace(/\s+/g, ' ').toLowerCase() === b.trim().replace(/\s+/g, ' ').toLowerCase();

/**
 * The first skill this job asks for (required before preferred) that the user
 * has but only rated themselves, or null.
 */
export function quizOfferSkill(job: JobDescription, skills: Skill[]): Skill | null {
  for (const wanted of [...job.extracted.requiredSkills, ...job.extracted.preferredSkills]) {
    const own = skills.find((s) => !s.assessedLevel && sameName(s.name, wanted));
    if (own) return own;
  }
  return null;
}

/**
 * TIQ-11: after a job ad is read, an optional short quiz on one of the job's
 * skills the user has only rated themselves. "Maybe later" just hides it; the
 * CV steps below never wait for it. After the quiz, the report leads back here.
 */
export function QuizOffer({ job }: { job: JobDescription }) {
  const { t } = useTranslation();
  const { colors, typography, spacing, radius } = useTheme();
  const { skills } = useSkills();
  const [closed, setClosed] = useState(false);
  /** The skill a quiz was started for from here (to say the result is saved). */
  const [taken, setTaken] = useState<string | null>(null);

  if (taken) {
    const skill = skills.find((s) => s.id === taken);
    return skill?.assessedLevel ? (
      <FormMessage
        tone="info"
        text={t('mobile.cv.quizOffer.saved', {
          skill: skill.name,
          level: t(`mobile.skills.levels.${skill.assessedLevel}`),
        })}
      />
    ) : null;
  }
  const skill = closed ? null : quizOfferSkill(job, skills);
  if (!skill) return null;

  return (
    <View
      testID="cv-quiz-offer"
      style={{
        backgroundColor: colors.primarySoft,
        borderRadius: radius.card,
        padding: spacing.card,
        gap: spacing.sm,
      }}
    >
      <Text accessibilityRole="header" style={[typography.h3, { color: colors.text }]}>
        {t('mobile.cv.quizOffer.title', { skill: skill.name })}
      </Text>
      <Text style={[typography.body, { color: colors.textMuted }]}>
        {t('mobile.cv.quizOffer.body', { skill: skill.name })}
      </Text>
      <Button
        variant="secondary"
        label={t('mobile.cv.quizOffer.take')}
        onPress={() => {
          setTaken(skill.id);
          router.push({ pathname: '/quiz', params: { skillId: skill.id, fromJob: job.id } });
        }}
        testID="cv-quiz-offer-take"
      />
      <TextLink
        label={t('mobile.cv.quizOffer.later')}
        align="flex-start"
        onPress={() => setClosed(true)}
        testID="cv-quiz-offer-later"
      />
    </View>
  );
}
