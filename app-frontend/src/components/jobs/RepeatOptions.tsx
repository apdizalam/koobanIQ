import { useTranslation } from 'react-i18next';
import { Text, View } from 'react-native';
import { normaliseTime } from '../../services/jobsApi';
import { useTheme } from '../../theme';
import { SCHEDULE_FREQUENCIES, type ScheduleFrequency } from '../../types/jobs';
import { Checkbox } from '../ui/Checkbox';
import { Chip } from '../ui/Chip';
import { Input } from '../ui/Input';

export interface RepeatValue {
  repeat: boolean;
  frequency: ScheduleFrequency;
  /** As typed, e.g. "8:00"; checked with normaliseTime. */
  time: string;
  /** weekly: 0 = Monday … 6 = Sunday. */
  weekday: number;
}

export const DEFAULT_REPEAT: RepeatValue = {
  repeat: false,
  frequency: 'daily',
  time: '08:00',
  weekday: 0,
};

/** Is the repeat part ready to save (a real time)? */
export const repeatReady = (value: RepeatValue) => !value.repeat || !!normaliseTime(value.time);

/**
 * "Repeat this search automatically" (TIQ-21): how often and at what local
 * time; weekly also asks for the day. Times are the phone's local time.
 */
export function RepeatOptions({
  value,
  onChange,
}: {
  value: RepeatValue;
  onChange: (next: RepeatValue) => void;
}) {
  const { t } = useTranslation();
  const { colors, typography, spacing } = useTheme();
  const set = (patch: Partial<RepeatValue>) => onChange({ ...value, ...patch });
  const row = { flexDirection: 'row' as const, flexWrap: 'wrap' as const, gap: spacing.sm };
  const timeOk = !!normaliseTime(value.time);

  return (
    <View style={{ gap: spacing.sm }}>
      <Checkbox
        testID="jobs-repeat"
        label={t('mobile.jobs.schedule.repeat')}
        checked={value.repeat}
        onChange={(repeat) => set({ repeat })}
      />
      {value.repeat ? (
        <View style={{ gap: spacing.md }}>
          <View style={row}>
            {SCHEDULE_FREQUENCIES.map((f) => (
              <Chip
                key={f}
                testID={`jobs-frequency-${f}`}
                label={t(`mobile.jobs.schedule.frequencies.${f}`)}
                selected={value.frequency === f}
                onPress={() => set({ frequency: f })}
              />
            ))}
          </View>
          {value.frequency === 'weekly' ? (
            <View style={row}>
              {[0, 1, 2, 3, 4, 5, 6].map((d) => (
                <Chip
                  key={d}
                  testID={`jobs-weekday-${d}`}
                  label={t(
                    `mobile.jobs.schedule.weekdays.${d}` as 'mobile.jobs.schedule.weekdays.0',
                  )}
                  selected={value.weekday === d}
                  onPress={() => set({ weekday: d })}
                />
              ))}
            </View>
          ) : null}
          <Input
            testID="jobs-repeat-time"
            label={t(
              value.frequency === 'hourly'
                ? 'mobile.jobs.schedule.minuteLabel'
                : 'mobile.jobs.schedule.timeLabel',
            )}
            hint={t('mobile.jobs.schedule.timeHint')}
            errorMessage={timeOk ? undefined : t('mobile.jobs.schedule.timeInvalid')}
            value={value.time}
            onChangeText={(time) => set({ time })}
            keyboardType="numbers-and-punctuation"
            maxLength={5}
          />
          <Text style={[typography.bodySmall, { color: colors.textMuted }]}>
            {t('mobile.jobs.schedule.note')}
          </Text>
        </View>
      ) : null}
    </View>
  );
}
