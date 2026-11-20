import { router } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ActivityIndicator, Pressable, ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { BackButton } from '../../components/ui/BackButton';
import { Button } from '../../components/ui/Button';
import { Chip } from '../../components/ui/Chip';
import { SkillChip } from '../../components/ui/SkillChip';
import { TextLink } from '../../components/ui/TextLink';
import { useSkills } from '../../profile/SkillsProvider';
import type { Skill } from '../../types/skills';
import { useTheme } from '../../theme';

type Filter = 'assessed' | 'selfReported';

/** Skills grouped by their group name ("Frontend"); no group → "Other skills" (last). */
function groupSkills(skills: Skill[], otherLabel: string) {
  const groups = new Map<string, Skill[]>();
  for (const skill of skills) {
    const name = skill.category?.trim() || otherLabel;
    groups.set(name, [...(groups.get(name) ?? []), skill]);
  }
  return [...groups.entries()].sort(([a], [b]) =>
    a === otherLabel ? 1 : b === otherLabel ? -1 : a.localeCompare(b),
  );
}

/**
 * Skill profile (TIQ-15, design "05 · Skill profile"). Assessed skills are solid
 * navy chips with a check, self-reported ones dashed (product rule 3). Counts
 * come from the server. Quizzes are always optional; nothing here judges the user.
 */
export default function SkillProfileScreen() {
  const { t } = useTranslation();
  const { colors, typography, spacing, radius, sizes } = useTheme();
  const { status, skills, counts, gapCount, reload } = useSkills();
  const [shown, setShown] = useState<Filter[]>(['assessed', 'selfReported']);
  const [dismissed, setDismissed] = useState<string[]>([]);

  const toggle = (filter: Filter) =>
    setShown((now) => (now.includes(filter) ? now.filter((f) => f !== filter) : [...now, filter]));
  const visible = skills.filter((s) =>
    shown.includes(s.assessedLevel ? 'assessed' : 'selfReported'),
  );
  const levelName = (level: string) =>
    t(`mobile.skills.levels.${level}` as 'mobile.skills.levels.mid');
  // Suggest a quiz for one self-reported skill at a time; "Maybe later" moves on.
  const suggestion = skills.find((s) => !s.assessedLevel && !dismissed.includes(s.id));
  const openSkill = (id: string) => router.push({ pathname: '/skills-edit/[id]', params: { id } });

  const stats = [
    { key: 'assessed', value: counts.assessed, color: colors.text },
    { key: 'selfReported', value: counts.selfReported, color: colors.textMuted },
    { key: 'gaps', value: gapCount, color: colors.errorText },
  ] as const;

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }} edges={['top', 'bottom']}>
      <StatusBar style="auto" />
      <ScrollView
        testID="skills-screen"
        contentContainerStyle={{ padding: spacing.screen, gap: spacing.lg }}
      >
        <BackButton />
        <View
          style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}
        >
          <Text accessibilityRole="header" style={[typography.display, { color: colors.text }]}>
            {t('mobile.skills.title')}
          </Text>
          <Pressable
            testID="skills-add"
            accessibilityRole="button"
            accessibilityLabel={t('mobile.skills.add')}
            onPress={() => openSkill('new')}
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
            <Text style={[typography.h1, { color: colors.text }]}>+</Text>
          </Pressable>
        </View>

        {status === 'loading' ? (
          <View testID="skills-loading" style={{ paddingVertical: spacing.xxxl }}>
            <ActivityIndicator color={colors.primary} />
          </View>
        ) : null}

        {status === 'error' ? (
          <View
            testID="skills-error"
            accessibilityRole="alert"
            style={{
              backgroundColor: colors.errorSoft,
              borderRadius: radius.card,
              padding: spacing.card,
              gap: spacing.md,
            }}
          >
            <Text style={[typography.body, { color: colors.errorText }]}>
              {t('mobile.skills.loadError')}
            </Text>
            <Button
              variant="secondary"
              label={t('mobile.home.error.retry')}
              onPress={() => void reload()}
              testID="skills-retry"
            />
          </View>
        ) : null}

        {status === 'ready' ? (
          <>
            <View style={{ flexDirection: 'row', gap: spacing.sm }}>
              {stats.map((stat) => (
                <View
                  key={stat.key}
                  testID={`skills-count-${stat.key}`}
                  accessible
                  accessibilityLabel={`${stat.value} ${t(`mobile.skills.stats.${stat.key}`)}`}
                  style={{
                    flex: 1,
                    backgroundColor: colors.surface,
                    borderColor: colors.border,
                    borderWidth: 1,
                    borderRadius: radius.card,
                    padding: spacing.md,
                    gap: spacing.xs,
                  }}
                >
                  <Text style={[typography.h1, { color: stat.color }]}>{stat.value}</Text>
                  <Text style={[typography.bodySmall, { color: colors.textMuted }]}>
                    {t(`mobile.skills.stats.${stat.key}`)}
                  </Text>
                </View>
              ))}
            </View>

            {skills.length === 0 ? (
              <View
                testID="skills-empty"
                style={{
                  backgroundColor: colors.surface,
                  borderColor: colors.border,
                  borderWidth: 1,
                  borderRadius: radius.card,
                  padding: spacing.card,
                  gap: spacing.md,
                }}
              >
                <Text style={[typography.h3, { color: colors.text }]}>
                  {t('mobile.skills.emptyTitle')}
                </Text>
                <Text style={[typography.body, { color: colors.textMuted }]}>
                  {t('mobile.skills.emptyBody')}
                </Text>
                <Button
                  label={t('mobile.skills.addFirst')}
                  onPress={() => openSkill('new')}
                  testID="skills-add-first"
                />
              </View>
            ) : (
              <>
                <View
                  accessibilityLabel={t('mobile.skills.filterLabel')}
                  style={{ flexDirection: 'row', gap: spacing.sm }}
                >
                  {(['assessed', 'selfReported'] as const).map((filter) => (
                    <Chip
                      key={filter}
                      testID={`skills-filter-${filter}`}
                      label={t(`mobile.skills.stats.${filter}`)}
                      selected={shown.includes(filter)}
                      onPress={() => toggle(filter)}
                    />
                  ))}
                </View>

                {groupSkills(visible, t('mobile.skills.otherGroup')).map(([group, list]) => (
                  <View
                    key={group}
                    testID={`skills-group-${group}`}
                    style={{
                      backgroundColor: colors.surface,
                      borderColor: colors.border,
                      borderWidth: 1,
                      borderRadius: radius.card,
                      padding: spacing.card,
                      gap: spacing.md,
                    }}
                  >
                    <Text
                      accessibilityRole="header"
                      style={[typography.h3, { color: colors.text }]}
                    >
                      {group}
                    </Text>
                    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm }}>
                      {list.map((skill) => (
                        <SkillChip
                          key={skill.id}
                          testID={`skill-${skill.id}`}
                          skill={
                            skill.assessedLevel
                              ? `${skill.name} · ${levelName(skill.assessedLevel)}`
                              : skill.name
                          }
                          status={skill.assessedLevel ? 'assessed' : 'self-reported'}
                          statusLabel={t(
                            skill.assessedLevel
                              ? 'mobile.skills.stats.assessed'
                              : 'mobile.skills.stats.selfReported',
                          )}
                          onPress={() => openSkill(skill.id)}
                        />
                      ))}
                    </View>
                  </View>
                ))}

                {suggestion ? (
                  <View
                    testID="skills-suggestion"
                    style={{
                      backgroundColor: colors.warningSoft,
                      borderRadius: radius.card,
                      padding: spacing.card,
                      gap: spacing.sm,
                    }}
                  >
                    <Text style={[typography.h3, { color: colors.text }]}>
                      {t('mobile.skills.suggestTitle', { skill: suggestion.name })}
                    </Text>
                    <Text style={[typography.body, { color: colors.textMuted }]}>
                      {t('mobile.skills.suggestBody')}
                    </Text>
                    <Button
                      label={t('mobile.skills.takeQuiz')}
                      onPress={() =>
                        router.push({ pathname: '/quiz', params: { skillId: suggestion.id } })
                      }
                      testID="skills-take-quiz"
                    />
                    <TextLink
                      label={t('mobile.skills.maybeLater')}
                      align="flex-start"
                      onPress={() => setDismissed((now) => [...now, suggestion.id])}
                      testID="skills-maybe-later"
                    />
                  </View>
                ) : null}
              </>
            )}
          </>
        ) : null}
      </ScrollView>
    </SafeAreaView>
  );
}
