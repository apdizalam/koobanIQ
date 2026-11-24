import { useTranslation } from 'react-i18next';
import { Link, useParams } from 'react-router';
import { useAuth } from '../auth/authContext';
import { useLoad } from '../hooks/useLoad';
import { INTERVIEW_STATUS_BADGE, fetchInterview, jobLabel } from '../services/interviewsApi';
import { formatDate } from '../utils/format';

/**
 * Admin → one interview practice: the AI's questions (to review their
 * quality) with each answer's score. The user's answers and the AI feedback
 * on them are private and never sent to the dashboard.
 */
export function InterviewDetailPage() {
  const { t, i18n } = useTranslation();
  const { request } = useAuth();
  const id = useParams().id ?? '';
  const { state, reload } = useLoad(`interview:${id}`, () => fetchInterview(request, id));
  const interview = state.status === 'ready' ? state.data : null;
  const none = t('admin.interviews.detail.none');

  return (
    <>
      <p>
        <Link to="/interviews" className="table-link">
          {t('admin.interviews.back')}
        </Link>
      </p>

      {state.status === 'error' ? (
        <div className="alert alert-row" role="alert">
          <span>{t('admin.interviews.detail.notFound')}</span>
          <button type="button" className="button-secondary" onClick={reload}>
            {t('admin.interviews.retry')}
          </button>
        </div>
      ) : null}

      {interview ? (
        <>
          <header className="page-header">
            <h1 className="break-anywhere" lang={interview.language}>
              {t('admin.interviews.detail.title', { role: jobLabel(interview) })}
            </h1>
            <p className="muted">
              {interview.email ?? t('admin.interviews.deletedUser')} ·{' '}
              {t(`admin.interviews.types.${interview.type}`)} ·{' '}
              {t(`common.language.${interview.language}`)} ·{' '}
              {formatDate(interview.createdAt, i18n.language, true)}{' '}
              <span className={`badge ${INTERVIEW_STATUS_BADGE[interview.status]}`}>
                {t(`admin.interviews.statuses.${interview.status}`)}
              </span>
            </p>
          </header>

          <section className="card">
            <dl className="details">
              <dt>{t('admin.interviews.detail.score')}</dt>
              <dd>
                {interview.averageScore !== null
                  ? t('admin.interviews.scoreValue', { score: interview.averageScore })
                  : none}
              </dd>
              <dt>{t('admin.interviews.detail.answered')}</dt>
              <dd>
                {t('admin.interviews.answeredOf', {
                  answered: interview.answered,
                  length: interview.length,
                })}
              </dd>
              <dt>{t('admin.interviews.detail.finishedAt')}</dt>
              <dd>
                {interview.finishedAt
                  ? formatDate(interview.finishedAt, i18n.language, true)
                  : none}
              </dd>
            </dl>
          </section>

          <h2 className="section-title">{t('admin.interviews.detail.questions')}</h2>
          <p className="muted">{t('admin.interviews.detail.privacy')}</p>
          <div className="quiz-questions">
            {interview.questions.map((q) => (
              <article key={q.id} className="card quiz-question" lang={interview.language}>
                <p className="muted quiz-question-meta">
                  {t('admin.interviews.detail.question', { number: q.number, focus: q.focus })}{' '}
                  {q.score !== null ? (
                    <span className="badge badge-active">
                      {t('admin.interviews.scoreValue', { score: q.score })}
                    </span>
                  ) : (
                    <span className="badge badge-user">
                      {t('admin.interviews.detail.notAnswered')}
                    </span>
                  )}
                </p>
                <p className="quiz-question-text">{q.question}</p>
              </article>
            ))}
          </div>
        </>
      ) : null}
    </>
  );
}
