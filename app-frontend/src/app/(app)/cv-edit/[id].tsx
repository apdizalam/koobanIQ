import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ActivityIndicator, View } from 'react-native';
import { AuthScreen } from '../../../components/layout/AuthScreen';
import { goBackOrHome } from '../../../components/ui/BackButton';
import { Button } from '../../../components/ui/Button';
import { FormMessage } from '../../../components/ui/FormMessage';
import { Input } from '../../../components/ui/Input';
import { useCvs } from '../../../cv/CvProvider';
import { aiErrorText } from '../../../cv/aiErrorText';
import { CV_EDIT_LIMITS, bulletLines } from '../../../services/cvApi';
import type { Cv, CvEdit } from '../../../types/cv';
import { useTheme } from '../../../theme';

type Texts = { headline: string; summary: string; bullets: Record<string, string> };

/**
 * Edit a CV's wording (TIQ-10, owner decision: wording only): headline, summary
 * and bullet points. Facts (employers, dates, schools, skills) stay as copied
 * from the profile. Saving an approved CV makes a new draft version.
 */
export default function CvEditScreen() {
  const { t } = useTranslation();
  const { colors, spacing } = useTheme();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { loadCv, edit } = useCvs();
  const [cv, setCv] = useState<Cv | null>(null);
  const [failed, setFailed] = useState(false);
  const [texts, setTexts] = useState<Texts | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [problem, setProblem] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let active = true;
    loadCv(id).then(
      (data) => {
        if (!active || !data.content) return;
        const c = data.content;
        setCv(data);
        setTexts({
          headline: c.header.headline,
          summary: c.summary,
          bullets: Object.fromEntries(
            [...c.experience, ...c.projects].map((e) => [e.id, e.bullets.join('\n')]),
          ),
        });
      },
      () => active && setFailed(true),
    );
    return () => {
      active = false;
    };
  }, [id, loadCv]);

  async function save() {
    if (!cv?.content || !texts || busy) return;
    const c = cv.content;
    const found: Record<string, string> = {};
    const headline = texts.headline.trim();
    const summary = texts.summary.trim();
    if (!headline) found.headline = t('mobile.cv.edit.required');
    else if (headline.length > CV_EDIT_LIMITS.headline)
      found.headline = t('mobile.cv.edit.tooLongText');
    if (!summary) found.summary = t('mobile.cv.edit.required');
    else if (summary.length > CV_EDIT_LIMITS.summary)
      found.summary = t('mobile.cv.edit.tooLongText');

    const list = (entries: { id: string }[], max: number) =>
      entries.map((e) => {
        const { bullets, problem: bad } = bulletLines(texts.bullets[e.id] ?? '', max);
        if (bad) found[e.id] = t(`mobile.cv.edit.${bad}`, { max });
        return { id: e.id, bullets };
      });
    const changes: CvEdit = { headline, summary };
    if (c.experience.length > 0) {
      changes.experience = list(c.experience, CV_EDIT_LIMITS.experienceBullets);
    }
    if (c.projects.length > 0) changes.projects = list(c.projects, CV_EDIT_LIMITS.projectBullets);

    setErrors(found);
    setProblem(null);
    if (Object.keys(found).length > 0) return;
    setBusy(true);
    try {
      const saved = await edit(cv.id, changes);
      if (saved.id === cv.id) goBackOrHome();
      // An approved CV stays as it was; the edited text is a new draft version.
      else router.replace({ pathname: '/cv-view/[id]', params: { id: saved.id } });
    } catch (err) {
      setProblem(aiErrorText(err, t));
      setBusy(false);
    }
  }

  const setBullets = (entryId: string, value: string) =>
    setTexts((now) => (now ? { ...now, bullets: { ...now.bullets, [entryId]: value } } : now));

  return (
    <AuthScreen title={t('mobile.cv.edit.title')} subtitle={t('mobile.cv.edit.subtitle')}>
      {!cv && !failed ? (
        <View style={{ paddingVertical: spacing.xxxl }}>
          <ActivityIndicator color={colors.primary} />
        </View>
      ) : null}
      {!cv && failed ? <FormMessage text={t('mobile.cv.view.notFound')} /> : null}

      {cv?.content && texts ? (
        <>
          {cv.status !== 'draft' ? (
            <FormMessage tone="info" text={t('mobile.cv.edit.newVersionNote')} />
          ) : null}
          <Input
            testID="cv-edit-headline"
            label={t('mobile.cv.edit.headline')}
            placeholder={t('mobile.inputs.cv.headline')}
            value={texts.headline}
            onChangeText={(headline) => setTexts({ ...texts, headline })}
            maxLength={CV_EDIT_LIMITS.headline + 20}
            editable={!busy}
            errorMessage={errors.headline}
          />
          <Input
            testID="cv-edit-summary"
            label={t('mobile.cv.edit.summary')}
            placeholder={t('mobile.inputs.cv.summary')}
            value={texts.summary}
            onChangeText={(summary) => setTexts({ ...texts, summary })}
            multiline
            maxLength={CV_EDIT_LIMITS.summary + 50}
            editable={!busy}
            errorMessage={errors.summary}
          />
          {cv.content.experience.map((e) => (
            <Input
              key={e.id}
              testID={`cv-edit-bullets-${e.id}`}
              label={t('mobile.cv.edit.bullets', { name: `${e.title} · ${e.employer}` })}
              value={texts.bullets[e.id] ?? ''}
              onChangeText={(value) => setBullets(e.id, value)}
              multiline
              editable={!busy}
              placeholder={t('mobile.inputs.cv.bullets')}
              hint={t('mobile.cv.edit.bulletsHint', { max: CV_EDIT_LIMITS.experienceBullets })}
              errorMessage={errors[e.id]}
            />
          ))}
          {cv.content.projects.map((p) => (
            <Input
              key={p.id}
              testID={`cv-edit-bullets-${p.id}`}
              label={t('mobile.cv.edit.bullets', { name: p.name })}
              value={texts.bullets[p.id] ?? ''}
              onChangeText={(value) => setBullets(p.id, value)}
              multiline
              editable={!busy}
              placeholder={t('mobile.inputs.cv.bullets')}
              hint={t('mobile.cv.edit.bulletsHint', { max: CV_EDIT_LIMITS.projectBullets })}
              errorMessage={errors[p.id]}
            />
          ))}
          <FormMessage tone="info" text={t('mobile.cv.edit.factsNote')} />
          {problem ? <FormMessage text={problem} /> : null}
          <Button
            label={busy ? t('mobile.profile.saving') : t('mobile.cv.edit.save')}
            onPress={() => void save()}
            loading={busy}
            testID="cv-edit-save"
          />
        </>
      ) : null}
    </AuthScreen>
  );
}
