import { router, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Text, View } from 'react-native';
import { useAuth } from '../../auth/authContext';
import { aiErrorText } from '../../cv/aiErrorText';
import { deleteSchedule, fetchSchedules, setScheduleEnabled } from '../../services/jobsApi';
import { useTheme } from '../../theme';
import type { ResearchSchedule } from '../../types/jobs';
import { formatDateTime } from '../../utils/format';
import { Button } from '../ui/Button';
import { Checkbox } from '../ui/Checkbox';
import { DashboardCard } from '../ui/DashboardCard';
import { FormMessage } from '../ui/FormMessage';

/**
 * The user's scheduled searches (TIQ-21): when each runs, the next and last
 * run, why a run was skipped, on / off, delete, and a link to the last results.
 */
export function ScheduleList() {
  const { t, i18n } = useTranslation();
  const { colors, typography, spacing, radius } = useTheme();
  const { getAccessToken } = useAuth();
  const [schedules, setSchedules] = useState<ResearchSchedule[] | null>(null);
  const [problem, setProblem] = useState<string | null>(null);

  useFocusEffect(
    useCallback(() => {
      let active = true;
      getAccessToken()
        .then(fetchSchedules)
        .then(
          (data) => active && setSchedules(data.schedules),
          (err) => {
            if (!active) return;
            setSchedules([]);
            setProblem(aiErrorText(err, t));
          },
        );
      return () => {
        active = false;
      };
    }, [getAccessToken, t]),
  );

  const replace = (next: ResearchSchedule) =>
    setSchedules((list) => (list ?? []).map((s) => (s.id === next.id ? next : s)));

  async function toggle(s: ResearchSchedule) {
    setProblem(null);
    try {
      const { schedule } = await setScheduleEnabled(await getAccessToken(), s.id, !s.enabled);
      replace(schedule);
    } catch (err) {
      setProblem(aiErrorText(err, t));
    }
  }

  async function remove(s: ResearchSchedule) {
    setProblem(null);
    try {
      await deleteSchedule(await getAccessToken(), s.id);
      setSchedules((list) => (list ?? []).filter((x) => x.id !== s.id));
    } catch (err) {
      setProblem(aiErrorText(err, t));
    }
  }

  const when = (s: ResearchSchedule) => {
    const base = t(`mobile.jobs.schedule.when.${s.frequency}`, {
      time: s.time,
      minute: s.time.slice(3),
      day: t(
        `mobile.jobs.schedule.weekdays.${s.weekday ?? 0}` as 'mobile.jobs.schedule.weekdays.0',
      ),
    });
    return `${base} (${s.timeZone})`;
  };
  const what = (s: ResearchSchedule) =>
    [
      s.regions.map((r) => t(`common.region.${r}`)).join(', '),
      s.sourceKeys.map((k) => t(`mobile.jobs.sourceNames.${k}`, { defaultValue: k })).join(', '),
      s.filters?.titles?.[0] ?? '',
    ]
      .filter(Boolean)
      .join(' · ');

  if (schedules === null) return null;
  return (
    <View testID="jobs-schedules" style={{ gap: spacing.md }}>
      {problem ? <FormMessage text={problem} /> : null}
      {schedules.length === 0 ? (
        <DashboardCard
          title={t('mobile.jobs.schedule.emptyTitle')}
          body={t('mobile.jobs.schedule.emptyBody')}
        />
      ) : (
        schedules.map((s) => (
          <View
            key={s.id}
            testID={`schedule-${s.id}`}
            style={{
              backgroundColor: colors.surface,
              borderColor: colors.border,
              borderWidth: 1,
              borderRadius: radius.card,
              padding: spacing.card,
              gap: spacing.sm,
            }}
          >
            <Text style={[typography.h3, { color: colors.text }]}>{when(s)}</Text>
            <Text style={[typography.bodySmall, { color: colors.textMuted }]}>{what(s)}</Text>
            <Text
              testID={`schedule-${s.id}-next`}
              style={[typography.body, { color: colors.text }]}
            >
              {s.enabled && s.nextRunAt
                ? t('mobile.jobs.schedule.next', {
                    when: formatDateTime(s.nextRunAt, i18n.language),
                  })
                : t('mobile.jobs.schedule.off')}
            </Text>
            {s.lastRunAt ? (
              <Text style={[typography.bodySmall, { color: colors.textMuted }]}>
                {t('mobile.jobs.schedule.last', {
                  when: formatDateTime(s.lastRunAt, i18n.language),
                  count: s.runCount,
                })}
              </Text>
            ) : null}
            {s.lastSkip ? (
              <Text
                testID={`schedule-${s.id}-skip`}
                style={[typography.bodySmall, { color: colors.warningText }]}
              >
                {t(`mobile.jobs.schedule.skips.${s.lastSkip}`)}
              </Text>
            ) : null}
            <Checkbox
              testID={`schedule-${s.id}-enabled`}
              label={t('mobile.jobs.schedule.enabled')}
              checked={s.enabled}
              onChange={() => void toggle(s)}
            />
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm }}>
              {s.lastRunId ? (
                <Button
                  variant="secondary"
                  testID={`schedule-${s.id}-results`}
                  label={t('mobile.jobs.schedule.lastResults')}
                  onPress={() =>
                    router.push({ pathname: '/research/[id]', params: { id: s.lastRunId! } })
                  }
                />
              ) : null}
              <Button
                variant="ghost"
                testID={`schedule-${s.id}-delete`}
                label={t('mobile.jobs.schedule.delete')}
                onPress={() => void remove(s)}
              />
            </View>
          </View>
        ))
      )}
    </View>
  );
}
