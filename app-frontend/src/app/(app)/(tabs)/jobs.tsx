import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ActivityIndicator, Text, View } from 'react-native';
import { useAuth } from '../../../auth/authContext';
import { JobResults } from '../../../components/jobs/JobResults';
import { TabScreen } from '../../../components/layout/TabScreen';
import { Button } from '../../../components/ui/Button';
import { Checkbox } from '../../../components/ui/Checkbox';
import { Chip } from '../../../components/ui/Chip';
import { DashboardCard } from '../../../components/ui/DashboardCard';
import { FormMessage } from '../../../components/ui/FormMessage';
import { Input } from '../../../components/ui/Input';
import { aiErrorText } from '../../../cv/aiErrorText';
import { useSavedJobs } from '../../../jobs/useSavedJobs';
import { useProfile } from '../../../profile/ProfileProvider';
import {
  DEFAULT_REPEAT,
  RepeatOptions,
  repeatReady,
  type RepeatValue,
} from '../../../components/jobs/RepeatOptions';
import { ScheduleList } from '../../../components/jobs/ScheduleList';
import {
  createSchedule,
  fetchJobSources,
  normaliseTime,
  parseLinks,
  searchStoredJobs,
  startResearch,
} from '../../../services/jobsApi';
import { deviceTimeZone } from '../../../services/reportsApi';
import { useTheme } from '../../../theme';
import type { JobSource, StoredJobResults, UnavailableJobSource } from '../../../types/jobs';
import { EMPLOYER_TYPES, JOB_TYPES, REGION_KEYS, type RegionKey } from '../../../types/profile';

type Mode = 'search' | 'research' | 'saved' | 'schedules';
const MODES: Mode[] = ['search', 'research', 'saved', 'schedules'];
/** Most career-page links one search takes (backend MAX_CUSTOM_URLS). */
const MAX_LINKS = 5;

const toggle = <T,>(list: T[], value: T) =>
  list.includes(value) ? list.filter((v) => v !== value) : [...list, value];

/** The filters of a new search (only those the user set). */
function researchFilters(title: string, city: string, employerTypes: string[]) {
  const filters: { titles?: string[]; city?: string; employerTypes?: string[] } = {};
  if (title.trim()) filters.titles = [title.trim()];
  if (city.trim()) filters.city = city.trim();
  if (employerTypes.length > 0) filters.employerTypes = employerTypes;
  return Object.keys(filters).length > 0 ? filters : undefined;
}

/**
 * Jobs tab (TIQ-18), two independent ways to find jobs:
 * A. "Search jobs": the jobs KOBANIQ already found, filtered and scored for you;
 * B. "Find new jobs": a new search of the sources you choose (and your own
 *    career-page links), followed on its own screen.
 * Plus your saved jobs. Jobs that don't fit are only shown when asked for.
 */
export default function JobsTab() {
  const { t } = useTranslation();
  const { colors, typography, spacing } = useTheme();
  const { getAccessToken } = useAuth();
  const { profile } = useProfile();
  const { saved, savedIds, toggleSave, saveFailed } = useSavedJobs();
  const [mode, setMode] = useState<Mode>('search');
  const [problem, setProblem] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const preferredRegions = (profile?.preferences.regions ?? []).filter((r): r is RegionKey =>
    (REGION_KEYS as readonly string[]).includes(r),
  );

  // ------------------------------------------------------------ A: stored jobs
  const [q, setQ] = useState('');
  const [regions, setRegions] = useState<RegionKey[]>([]);
  const [jobTypes, setJobTypes] = useState<string[]>([]);
  const [city, setCity] = useState('');
  const [employerTypes, setEmployerTypes] = useState<string[]>([]);
  const [results, setResults] = useState<StoredJobResults | null>(null);

  async function searchStored(lower = false) {
    setBusy(true);
    setProblem(null);
    try {
      const data = await searchStoredJobs(await getAccessToken(), {
        q,
        regions,
        city,
        employerTypes,
        jobTypes,
        lower,
      });
      setResults(data);
    } catch (err) {
      setProblem(aiErrorText(err, t));
    } finally {
      setBusy(false);
    }
  }

  // ------------------------------------------------------------ B: new research
  // Until the user changes them: their preferred regions, else Somaliland and Somalia.
  const [chosenRegions, setResearchRegions] = useState<RegionKey[] | null>(null);
  const researchRegions: RegionKey[] =
    chosenRegions ?? (preferredRegions.length > 0 ? preferredRegions : ['somaliland', 'somalia']);
  const regionsKey = researchRegions.join(',');
  const [sources, setSources] = useState<JobSource[] | null>(null);
  const [unavailable, setUnavailable] = useState<UnavailableJobSource[]>([]);
  const [chosen, setChosen] = useState<string[]>([]);
  const [links, setLinks] = useState('');
  const [title, setTitle] = useState('');
  const [researchCity, setResearchCity] = useState('');
  const [researchEmployerTypes, setResearchEmployerTypes] = useState<string[]>([]);

  // The sources for the chosen regions, loaded when this part is open.
  useEffect(() => {
    if (mode !== 'research') return;
    let active = true;
    getAccessToken()
      .then((token) => fetchJobSources(token, regionsKey.split(',').filter(Boolean) as RegionKey[]))
      .then(
        (data) => {
          if (!active) return;
          setSources(data.sources);
          setUnavailable(data.unavailable);
          setChosen((now) => now.filter((k) => data.sources.some((src) => src.key === k)));
        },
        (err) => {
          if (!active) return;
          setSources([]);
          setProblem(aiErrorText(err, t));
        },
      );
    return () => {
      active = false;
    };
  }, [mode, regionsKey, getAccessToken, t]);

  const linkSource = sources?.find((s) => s.acceptsUrls && chosen.includes(s.key));
  const linkList = parseLinks(links);
  const linksProblem =
    linkSource && linkList.length === 0
      ? t('mobile.jobs.research.linksNeeded')
      : linkList.length > MAX_LINKS
        ? t('mobile.jobs.research.linksTooMany', { max: MAX_LINKS })
        : undefined;
  const [repeat, setRepeat] = useState<RepeatValue>(DEFAULT_REPEAT);
  const [scheduleSaved, setScheduleSaved] = useState(false);
  const canStart =
    chosen.length > 0 &&
    researchRegions.length > 0 &&
    !linksProblem &&
    repeatReady(repeat) &&
    !busy;

  async function startNew() {
    if (!canStart) return;
    setBusy(true);
    setProblem(null);
    setScheduleSaved(false);
    const search = {
      sourceKeys: chosen,
      regions: researchRegions,
      filters: researchFilters(title, researchCity, researchEmployerTypes),
      customUrls: linkSource ? linkList : undefined,
    };
    try {
      if (repeat.repeat) {
        // Saved to run by itself at the chosen local time; the list shows when.
        await createSchedule(await getAccessToken(), {
          ...search,
          frequency: repeat.frequency,
          time: normaliseTime(repeat.time)!,
          ...(repeat.frequency === 'weekly' ? { weekday: repeat.weekday } : {}),
          timeZone: deviceTimeZone(),
        });
        setRepeat(DEFAULT_REPEAT);
        setScheduleSaved(true);
        setMode('schedules');
        return;
      }
      const { run } = await startResearch(await getAccessToken(), search);
      router.push({ pathname: '/research/[id]', params: { id: run.id } });
    } catch (err) {
      setProblem(aiErrorText(err, t));
    } finally {
      setBusy(false);
    }
  }

  // ------------------------------------------------------------ layout
  const row = { flexDirection: 'row' as const, flexWrap: 'wrap' as const, gap: spacing.sm };
  const heading = (text: string) => (
    <Text accessibilityRole="header" style={[typography.h3, { color: colors.text }]}>
      {text}
    </Text>
  );
  const regionChips = (value: RegionKey[], set: (v: RegionKey[]) => void, prefix: string) => (
    <View style={row}>
      {REGION_KEYS.map((r) => (
        <Chip
          key={r}
          testID={`${prefix}-region-${r}`}
          label={t(`common.region.${r}`)}
          selected={value.includes(r)}
          onPress={() => set(toggle(value, r))}
        />
      ))}
    </View>
  );
  /** City and employer type: the same filters for both ways of searching. */
  const placeAndEmployer = (
    cityValue: string,
    setCityValue: (v: string) => void,
    types: string[],
    setTypes: (v: string[]) => void,
    prefix: string,
  ) => (
    <>
      <Input
        testID={`${prefix}-city`}
        label={t('mobile.jobs.filters.city')}
        hint={t('mobile.jobs.filters.cityHint')}
        value={cityValue}
        onChangeText={setCityValue}
        maxLength={60}
      />
      <View style={{ gap: spacing.sm }}>
        {heading(t('mobile.jobs.filters.employerTypes'))}
        <View style={row}>
          {EMPLOYER_TYPES.map((et) => (
            <Chip
              key={et}
              testID={`${prefix}-employer-${et}`}
              label={t(`common.employerType.${et}`)}
              selected={types.includes(et)}
              onPress={() => setTypes(toggle(types, et))}
            />
          ))}
        </View>
        <Text style={[typography.bodySmall, { color: colors.textMuted }]}>
          {t('mobile.jobs.filters.employerTypesHint')}
        </Text>
      </View>
    </>
  );

  return (
    <TabScreen
      testID="jobs-screen"
      title={t('mobile.tabs.jobs')}
      subtitle={t('mobile.jobs.subtitle')}
    >
      <View style={row} accessibilityRole="tablist">
        {MODES.map((m) => (
          <Chip
            key={m}
            testID={`jobs-mode-${m}`}
            label={t(`mobile.jobs.modes.${m}`)}
            selected={mode === m}
            onPress={() => {
              setMode(m);
              setProblem(null);
            }}
          />
        ))}
      </View>
      {problem ? <FormMessage text={problem} /> : null}
      {saveFailed ? <FormMessage text={t('mobile.jobs.saveFailed')} /> : null}

      {mode === 'search' ? (
        <View style={{ gap: spacing.lg }}>
          <Text style={[typography.body, { color: colors.textMuted }]}>
            {t('mobile.jobs.search.intro')}
          </Text>
          <Input
            testID="jobs-q"
            label={t('mobile.jobs.search.q')}
            value={q}
            onChangeText={setQ}
            maxLength={100}
            returnKeyType="search"
            onSubmitEditing={() => void searchStored()}
          />
          <View style={{ gap: spacing.sm }}>
            {heading(t('mobile.jobs.search.regions'))}
            {regionChips(regions, setRegions, 'search')}
            <Text style={[typography.bodySmall, { color: colors.textMuted }]}>
              {t('mobile.jobs.search.regionsHint')}
            </Text>
          </View>
          <View style={{ gap: spacing.sm }}>
            {heading(t('mobile.jobs.search.jobTypes'))}
            <View style={row}>
              {JOB_TYPES.map((jt) => (
                <Chip
                  key={jt}
                  testID={`search-jobtype-${jt}`}
                  label={t(`mobile.profile.jobTypes.${jt}`)}
                  selected={jobTypes.includes(jt)}
                  onPress={() => setJobTypes(toggle(jobTypes, jt))}
                />
              ))}
            </View>
          </View>
          {placeAndEmployer(city, setCity, employerTypes, setEmployerTypes, 'search')}
          <Button
            testID="jobs-search"
            label={t('mobile.jobs.search.button')}
            loading={busy}
            onPress={() => void searchStored()}
          />
          {results ? (
            <View style={{ gap: spacing.md }}>
              <Text
                testID="jobs-searched"
                style={[typography.bodySmall, { color: colors.textMuted }]}
              >
                {t('mobile.jobs.search.searched', { count: results.searched })}
              </Text>
              {results.searched === 0 ? (
                <DashboardCard
                  testID="jobs-none-stored"
                  title={t('mobile.jobs.search.noneStoredTitle')}
                  body={t('mobile.jobs.search.noneStoredBody')}
                  action={{
                    label: t('mobile.jobs.modes.research'),
                    onPress: () => setMode('research'),
                    testID: 'jobs-go-research',
                  }}
                />
              ) : (
                <JobResults
                  recommended={results.recommended}
                  lowerMatch={results.lowerMatch}
                  lowerCount={results.counts.lowerMatch}
                  savedIds={savedIds}
                  onToggleSave={(id) => void toggleSave(id)}
                  onShowLower={() => void searchStored(true)}
                />
              )}
            </View>
          ) : null}
        </View>
      ) : null}

      {mode === 'research' ? (
        <View style={{ gap: spacing.lg }}>
          <Text style={[typography.body, { color: colors.textMuted }]}>
            {t('mobile.jobs.research.intro')}
          </Text>
          <View style={{ gap: spacing.sm }}>
            {heading(t('mobile.jobs.research.regions'))}
            {regionChips(researchRegions, setResearchRegions, 'research')}
          </View>
          <View style={{ gap: spacing.sm }}>
            {heading(t('mobile.jobs.research.sources'))}
            {sources === null ? (
              <ActivityIndicator color={colors.primary} />
            ) : sources.length === 0 ? (
              <FormMessage tone="info" text={t('mobile.jobs.research.noSources')} />
            ) : (
              sources.map((s) => (
                <View key={s.key} style={{ gap: spacing.xs }}>
                  <Checkbox
                    testID={`source-${s.key}`}
                    label={s.name}
                    checked={chosen.includes(s.key)}
                    onChange={() => setChosen(toggle(chosen, s.key))}
                  />
                  {s.attribution ? (
                    <Text style={[typography.bodySmall, { color: colors.textMuted }]}>
                      {t('mobile.jobs.research.attribution', { name: s.attribution })}
                    </Text>
                  ) : null}
                </View>
              ))
            )}
            {linkSource ? (
              <Input
                testID="jobs-links"
                label={t('mobile.jobs.research.links')}
                hint={t('mobile.jobs.research.linksHint', { max: MAX_LINKS })}
                errorMessage={links.trim() ? linksProblem : undefined}
                value={links}
                onChangeText={setLinks}
                multiline
                autoCapitalize="none"
                autoCorrect={false}
                keyboardType="url"
              />
            ) : null}
            {unavailable.length > 0 ? (
              <View style={{ gap: spacing.sm }}>
                <Text style={[typography.labelMedium, { color: colors.textMuted }]}>
                  {t('mobile.jobs.research.unavailableTitle')}
                </Text>
                {unavailable.map((s) => (
                  <View
                    key={s.key}
                    testID={`source-unavailable-${s.key}`}
                    accessible
                    style={{ gap: spacing.xxs, opacity: 0.75 }}
                  >
                    <Text style={[typography.bodyStrong, { color: colors.textMuted }]}>
                      {s.name}
                    </Text>
                    <Text style={[typography.bodySmall, { color: colors.textMuted }]}>
                      {t(`common.sourceReasons.${s.reason}`)}
                    </Text>
                  </View>
                ))}
              </View>
            ) : null}
          </View>
          <Input
            testID="jobs-title"
            label={t('mobile.jobs.research.title')}
            hint={t('mobile.jobs.research.titleHint')}
            value={title}
            onChangeText={setTitle}
            maxLength={100}
          />
          {placeAndEmployer(
            researchCity,
            setResearchCity,
            researchEmployerTypes,
            setResearchEmployerTypes,
            'research',
          )}
          <RepeatOptions value={repeat} onChange={setRepeat} />
          <Button
            testID="jobs-start"
            label={t(repeat.repeat ? 'mobile.jobs.schedule.save' : 'mobile.jobs.research.start')}
            loading={busy}
            disabled={!canStart}
            onPress={() => void startNew()}
          />
        </View>
      ) : null}

      {mode === 'saved' ? (
        <View testID="jobs-saved" style={{ gap: spacing.md }}>
          {saved.length === 0 ? (
            <DashboardCard
              title={t('mobile.jobs.savedEmptyTitle')}
              body={t('mobile.jobs.savedEmptyBody')}
            />
          ) : (
            <JobResults
              testID="jobs-saved-list"
              recommended={saved}
              lowerMatch={[]}
              lowerCount={0}
              savedIds={savedIds}
              onToggleSave={(id) => void toggleSave(id)}
              heading={t('mobile.jobs.savedTitle', { count: saved.length })}
            />
          )}
        </View>
      ) : null}

      {mode === 'schedules' ? (
        <View style={{ gap: spacing.md }}>
          {scheduleSaved ? (
            <View testID="jobs-schedule-saved">
              <FormMessage tone="info" text={t('mobile.jobs.schedule.saved')} />
            </View>
          ) : null}
          <ScheduleList />
        </View>
      ) : null}
    </TabScreen>
  );
}
