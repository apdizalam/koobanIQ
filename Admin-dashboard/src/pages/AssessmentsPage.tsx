import { useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useSearchParams } from 'react-router';
import { useAuth } from '../auth/authContext';
import { StatCard } from '../components/ui/StatCard';
import { useLoad } from '../hooks/useLoad';
import {
  QUIZZES_PAGE_SIZE,
  QUIZ_STATUSES,
  fetchQuizzes,
  isQuizStatus,
  type QuizStatus,
} from '../services/quizzesApi';
import { formatDate } from '../utils/format';

const STATUS_BADGE: Record<QuizStatus, string> = {
  in_progress: 'badge-user',
  finished: 'badge-active',
  cancelled: 'badge-suspended',
};

/**
 * Admin → Skills & assessments (TIQ-33): every skill quiz with its result, and
 * how many questions admins flagged. Status, skill search and page live in the
 * address.
 */
export function AssessmentsPage() {
  const { t, i18n } = useTranslation();
  const { request } = useAuth();
  const [params, setParams] = useSearchParams();
  const fromUrl = params.get('status');
  const status: '' | QuizStatus = isQuizStatus(fromUrl) ? fromUrl : '';
  const skill = params.get('skill') ?? '';
  const page = Math.max(1, Number(params.get('page')) || 1);
  const [skillInput, setSkillInput] = useState(skill);

  const { state, reload } = useLoad(`quizzes:${status}:${skill}:${page}`, () =>
    fetchQuizzes(request, { status, skill, page }),
  );
  const data = state.status === 'ready' ? state.data : null;
  const value = (n: number | undefined) => (state.status === 'loading' ? null : (n ?? 0));
  const from = data && data.total > 0 ? (data.page - 1) * data.limit + 1 : 0;
  const to = data ? Math.min(data.page * data.limit, data.total) : 0;

  function go(next: { status?: '' | QuizStatus; skill?: string; page?: number }) {
    const merged = { status, skill, page: 1, ...next };
    const out: Record<string, string> = {};
    if (merged.status) out.status = merged.status;
    if (merged.skill.trim()) out.skill = merged.skill.trim();
    if (merged.page > 1) out.page = String(merged.page);
    setParams(out, { replace: true });
  }

  function search(e: FormEvent) {
    e.preventDefault();
    go({ skill: skillInput });
  }

  return (
    <>
      <header className="page-header">
        <h1>{t('admin.quizzes.title')}</h1>
        <p className="muted">{t('admin.quizzes.subtitle')}</p>
      </header>

      <section className="stat-grid" aria-label={t('admin.quizzes.title')}>
        <StatCard label={t('admin.quizzes.cards.finished')} value={value(data?.summary.finished)} />
        <StatCard
          label={t('admin.quizzes.cards.inProgress')}
          value={value(data?.summary.inProgress)}
        />
        <StatCard
          label={t('admin.quizzes.cards.cancelled')}
          value={value(data?.summary.cancelled)}
        />
        <StatCard
          label={t('admin.quizzes.cards.flagged')}
          value={value(data?.summary.flaggedQuestions)}
        />
      </section>

      <div className="toolbar">
        <label className="select-field">
          <span>{t('admin.quizzes.statusFilter')}</span>
          <select
            value={status}
            onChange={(e) => go({ status: e.target.value as '' | QuizStatus })}
          >
            <option value="">{t('admin.quizzes.all')}</option>
            {QUIZ_STATUSES.map((s) => (
              <option key={s} value={s}>
                {t(`admin.quizzes.statuses.${s}`)}
              </option>
            ))}
          </select>
        </label>
        <form className="search-form" onSubmit={search} role="search">
          <label className="select-field">
            <span>{t('admin.quizzes.skillFilter')}</span>
            <input
              className="input"
              value={skillInput}
              maxLength={60}
              placeholder={t('admin.quizzes.skillPlaceholder')}
              onChange={(e) => setSkillInput(e.target.value)}
            />
          </label>
          <button type="submit" className="button-secondary">
            {t('admin.quizzes.search')}
          </button>
        </form>
      </div>

      {state.status === 'error' ? (
        <div className="alert alert-row" role="alert">
          <span>{t('admin.quizzes.error')}</span>
          <button type="button" className="button-secondary" onClick={reload}>
            {t('admin.quizzes.retry')}
          </button>
        </div>
      ) : (
        <div className="table-card" aria-busy={state.status === 'loading'}>
          <table className="table">
            <thead>
              <tr>
                <th scope="col">{t('admin.quizzes.columns.started')}</th>
                <th scope="col">{t('admin.quizzes.columns.user')}</th>
                <th scope="col">{t('admin.quizzes.columns.skill')}</th>
                <th scope="col" className="col-optional">
                  {t('admin.quizzes.columns.language')}
                </th>
                <th scope="col" className="col-optional">
                  {t('admin.quizzes.columns.status')}
                </th>
                <th scope="col">{t('admin.quizzes.columns.result')}</th>
                <th scope="col" className="col-optional">
                  {t('admin.quizzes.columns.flags')}
                </th>
                <th scope="col">{t('admin.quizzes.columns.actions')}</th>
              </tr>
            </thead>
            <tbody>
              {data && data.items.length === 0 ? (
                <tr>
                  <td colSpan={8} className="muted">
                    {t('admin.quizzes.empty')}
                  </td>
                </tr>
              ) : null}
              {(data?.items ?? []).map((q) => (
                <tr key={q.id}>
                  <td>{formatDate(q.createdAt, i18n.language, true)}</td>
                  <td className="cell-wrap">
                    {q.email ? (
                      <Link to={`/users/${q.userId}`} className="table-link">
                        {q.email}
                      </Link>
                    ) : (
                      <span className="muted">{t('admin.quizzes.deletedUser')}</span>
                    )}
                  </td>
                  <td className="cell-wrap">{q.skillName}</td>
                  <td className="col-optional">{t(`common.language.${q.language}`)}</td>
                  <td className="col-optional">
                    <span className={`badge ${STATUS_BADGE[q.status]}`}>
                      {t(`admin.quizzes.statuses.${q.status}`)}
                    </span>
                  </td>
                  <td>
                    {q.scorePercent !== null && q.level ? (
                      t('admin.quizzes.resultValue', {
                        score: q.scorePercent,
                        level: t(`admin.quizzes.levels.${q.level}`),
                      })
                    ) : (
                      <span className="muted">
                        {t('admin.quizzes.answeredOf', { answered: q.answered, length: q.length })}
                      </span>
                    )}
                  </td>
                  <td className="col-optional">
                    {q.flags > 0 ? <span className="badge badge-test">{q.flags}</span> : 0}
                  </td>
                  <td>
                    <Link to={`/skills/${q.id}`} className="table-link">
                      {t('admin.quizzes.details')}
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {data && data.total > QUIZZES_PAGE_SIZE ? (
        <nav className="pager" aria-label={t('admin.quizzes.title')}>
          <span className="muted">{t('admin.users.range', { from, to, total: data.total })}</span>
          <button
            type="button"
            className="button-secondary"
            disabled={data.page <= 1}
            onClick={() => go({ page: data.page - 1 })}
          >
            {t('admin.users.previous')}
          </button>
          <button
            type="button"
            className="button-secondary"
            disabled={to >= data.total}
            onClick={() => go({ page: data.page + 1 })}
          >
            {t('admin.users.next')}
          </button>
        </nav>
      ) : null}
    </>
  );
}
