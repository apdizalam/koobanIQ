import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useParams } from 'react-router';
import { useAuth } from '../auth/authContext';
import { useLoad } from '../hooks/useLoad';
import { ApiError } from '../services/api';
import {
  FLAG_REASON_MAX,
  fetchQuiz,
  flagQuestion,
  optionLetter,
  unflagQuestion,
  validReason,
  type QuizDetail,
  type QuizQuestion,
} from '../services/quizzesApi';
import { formatDate } from '../utils/format';

/**
 * Admin → one skill quiz: the result and every answered question with the
 * right answer, the user's choice and the explanation. A question that looks
 * wrong can be flagged with a short reason (the user's result stays).
 */
export function AssessmentDetailPage() {
  const { t, i18n } = useTranslation();
  const { request } = useAuth();
  const id = useParams().id ?? '';
  const { state, reload } = useLoad(`quiz:${id}`, () => fetchQuiz(request, id));
  // After a flag change the page shows the server's newest answer.
  const [updated, setUpdated] = useState<QuizDetail | null>(null);
  const quiz = updated ?? (state.status === 'ready' ? state.data : null);

  const [editing, setEditing] = useState<string | null>(null);
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const failText = (err: unknown) =>
    err instanceof ApiError ? err.message : t('admin.errors.generic');

  async function saveFlag(q: QuizQuestion) {
    if (!validReason(reason)) {
      setError(t('admin.quizzes.detail.reasonMissing'));
      return;
    }
    setBusy(true);
    setError(null);
    try {
      setUpdated(await flagQuestion(request, id, q.id, reason));
      setEditing(null);
    } catch (err) {
      setError(failText(err));
    } finally {
      setBusy(false);
    }
  }

  async function removeFlag(q: QuizQuestion) {
    setBusy(true);
    setError(null);
    try {
      setUpdated(await unflagQuestion(request, id, q.id));
    } catch (err) {
      setError(failText(err));
    } finally {
      setBusy(false);
    }
  }

  const none = t('admin.quizzes.detail.none');

  return (
    <>
      <p>
        <Link to="/skills" className="table-link">
          {t('admin.quizzes.back')}
        </Link>
      </p>

      {state.status === 'error' && !updated ? (
        <div className="alert alert-row" role="alert">
          <span>{t('admin.quizzes.detail.notFound')}</span>
          <button type="button" className="button-secondary" onClick={reload}>
            {t('admin.quizzes.retry')}
          </button>
        </div>
      ) : null}

      {quiz ? (
        <>
          <header className="page-header">
            <h1 className="break-anywhere">
              {t('admin.quizzes.detail.title', { skill: quiz.skillName })}
            </h1>
            <p className="muted">
              {quiz.email ?? t('admin.quizzes.deletedUser')} ·{' '}
              {t(`common.language.${quiz.language}`)} ·{' '}
              {formatDate(quiz.createdAt, i18n.language, true)} ·{' '}
              {t(`admin.quizzes.statuses.${quiz.status}`)}
            </p>
          </header>

          {error ? (
            <p className="alert" role="alert">
              {error}
            </p>
          ) : null}

          {quiz.result ? (
            <section className="card">
              <dl className="details">
                <dt>{t('admin.quizzes.detail.score')}</dt>
                <dd>
                  {t('admin.quizzes.detail.scoreValue', {
                    correct: quiz.result.correct,
                    total: quiz.result.total,
                    score: quiz.result.scorePercent,
                  })}
                </dd>
                <dt>{t('admin.quizzes.detail.level')}</dt>
                <dd>{t(`admin.quizzes.levels.${quiz.result.level}`)}</dd>
                <dt>{t('admin.quizzes.detail.strengths')}</dt>
                <dd>{quiz.result.strengths.join(', ') || none}</dd>
                <dt>{t('admin.quizzes.detail.gaps')}</dt>
                <dd>{quiz.result.gaps.join(', ') || none}</dd>
              </dl>
            </section>
          ) : null}

          <h2 className="section-title">{t('admin.quizzes.detail.questions')}</h2>
          {quiz.questions.length === 0 ? (
            <p className="muted">{t('admin.quizzes.detail.noQuestions')}</p>
          ) : null}
          <div className="quiz-questions">
            {quiz.questions.map((q) => (
              <article key={q.id} className="card quiz-question" lang={quiz.language}>
                <p className="muted quiz-question-meta">
                  {t('admin.quizzes.detail.question', {
                    number: q.number,
                    topic: q.topic,
                    difficulty: t(`admin.quizzes.difficulties.${q.difficulty}`),
                  })}{' '}
                  <span className={`badge ${q.correct ? 'badge-active' : 'badge-suspended'}`}>
                    {t(q.correct ? 'admin.quizzes.detail.correct' : 'admin.quizzes.detail.wrong')}
                  </span>
                </p>
                <p className="quiz-question-text">{q.question}</p>
                <ol className="quiz-options" type="A">
                  {q.options.map((option, i) => (
                    <li
                      key={i}
                      className={
                        i === q.answer
                          ? 'quiz-option-right'
                          : i === q.choice
                            ? 'quiz-option-wrong'
                            : ''
                      }
                    >
                      {option}
                    </li>
                  ))}
                </ol>
                <p>
                  {t('admin.quizzes.detail.rightAnswer')}:{' '}
                  {q.answer !== null ? optionLetter(q.answer) : none} ·{' '}
                  {t('admin.quizzes.detail.userChoice')}: {optionLetter(q.choice)}
                </p>
                <p className="muted">
                  {t('admin.quizzes.detail.explanation')}: {q.explanation}
                </p>

                {q.flag ? (
                  <p className="notice">
                    {t('admin.quizzes.detail.flagged', {
                      by: q.flag.by ?? none,
                      reason: q.flag.reason,
                    })}
                  </p>
                ) : null}

                {editing === q.id ? (
                  <div>
                    <label className="field" htmlFor={`flag-${q.id}`}>
                      {t('admin.quizzes.detail.flagReason')}
                    </label>
                    <textarea
                      id={`flag-${q.id}`}
                      className="input textarea textarea-short"
                      value={reason}
                      maxLength={FLAG_REASON_MAX + 50}
                      disabled={busy}
                      onChange={(e) => setReason(e.target.value)}
                    />
                    <p className="muted field-hint">
                      {t('admin.quizzes.detail.flagHint')} {reason.trim().length}/{FLAG_REASON_MAX}
                    </p>
                    <div className="action-row">
                      <button
                        type="button"
                        className="button-primary"
                        disabled={busy}
                        onClick={() => void saveFlag(q)}
                      >
                        {t('admin.quizzes.detail.flagSave')}
                      </button>
                      <button
                        type="button"
                        className="button-secondary"
                        disabled={busy}
                        onClick={() => setEditing(null)}
                      >
                        {t('admin.quizzes.detail.flagCancel')}
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="action-row">
                    <button
                      type="button"
                      className="button-secondary button-small"
                      disabled={busy}
                      onClick={() => {
                        setError(null);
                        setReason(q.flag?.reason ?? '');
                        setEditing(q.id);
                      }}
                    >
                      {t('admin.quizzes.detail.flag')}
                    </button>
                    {q.flag ? (
                      <button
                        type="button"
                        className="button-secondary button-small"
                        disabled={busy}
                        onClick={() => void removeFlag(q)}
                      >
                        {t('admin.quizzes.detail.unflag')}
                      </button>
                    ) : null}
                  </div>
                )}
              </article>
            ))}
          </div>
        </>
      ) : null}
    </>
  );
}
