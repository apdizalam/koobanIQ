import type { ReactNode } from 'react';
import type { Texts } from '../texts';

/**
 * Small pictures of the app's own screens for "How it works" (TIQ-34), drawn
 * in HTML with the app's design (Figma 05 Skill profile, 08 Assessment, 06 Jobs,
 * CV view) and example content that fits KOBANIQ. Being text, they switch
 * language with the page and load nothing extra. Decorative: the step text
 * next to each says the same thing, so screen readers skip them.
 */
type Screens = Texts['how']['screens'];

function Phone({ children, label }: { children: ReactNode; label: string }) {
  return (
    <div className="mock-phone" aria-hidden="true">
      <div className="mock-status">
        <span>9:41</span>
        <span className="mock-example">{label}</span>
      </div>
      <div className="mock-screen">{children}</div>
    </div>
  );
}

const Check = () => (
  <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3">
    <path d="m5 12 4 4 10-10" />
  </svg>
);

export function ProfileScreen({ s }: { s: Screens }) {
  const p = s.profile;
  return (
    <Phone label={s.example}>
      <p className="mock-title">{p.title}</p>
      <div className="mock-stats">
        <span>
          <b>3</b>
          {p.assessed}
        </span>
        <span>
          <b className="mock-muted">2</b>
          {p.self}
        </span>
        <span>
          <b className="mock-error">1</b>
          {p.gaps}
        </span>
      </div>
      <div className="mock-card">
        <p className="mock-card-title">{p.group}</p>
        <div className="mock-chips">
          <span className="mock-chip mock-chip-on">
            <Check />
            {p.chip1}
          </span>
          <span className="mock-chip mock-chip-on">
            <Check />
            {p.chip2}
          </span>
          <span className="mock-chip">{p.chip3}</span>
          <span className="mock-chip">{p.chip4}</span>
        </div>
      </div>
      <div className="mock-hint">{p.hint}</div>
    </Phone>
  );
}

export function QuizScreen({ s }: { s: Screens }) {
  const v = s.verify;
  return (
    <Phone label={s.example}>
      <div className="mock-progress">
        <span>{v.skill}</span>
        <span>{v.progress}</span>
      </div>
      <div className="mock-bar">
        <span style={{ width: '40%' }} />
      </div>
      <div className="mock-tags">
        <span className="mock-tag mock-tag-warn">{v.hard}</span>
        <span className="mock-small">{v.adapted}</span>
      </div>
      <p className="mock-question">{v.question}</p>
      {(['a', 'b', 'c', 'd'] as const).map((key) => (
        <div key={key} className={`mock-option${key === 'b' ? ' mock-option-on' : ''}`}>
          <span className="mock-letter">{key.toUpperCase()}</span>
          <code>{v[key]}</code>
        </div>
      ))}
      <div className="mock-info">{v.note}</div>
      <div className="mock-button">{v.next}</div>
    </Phone>
  );
}

export function JobsScreen({ s }: { s: Screens }) {
  const j = s.jobs;
  return (
    <Phone label={s.example}>
      <p className="mock-title">{j.title}</p>
      <div className="mock-search">{j.search}</div>
      <div className="mock-chips">
        <span className="mock-chip mock-chip-on">{j.all}</span>
        <span className="mock-chip mock-chip-plain">{j.strong}</span>
        <span className="mock-chip mock-chip-plain">{j.good}</span>
      </div>
      <div className="mock-card">
        <p className="mock-card-title">{j.job1}</p>
        <p className="mock-small">
          {j.org1} · {j.place1}
        </p>
        <span className="mock-badge mock-badge-strong">{j.match1}</span>
        <p className="mock-why">{j.why1}</p>
      </div>
      <div className="mock-card">
        <p className="mock-card-title">{j.job2}</p>
        <p className="mock-small">
          {j.org2} · {j.place2}
        </p>
        <span className="mock-badge mock-badge-good">{j.match2}</span>
      </div>
    </Phone>
  );
}

export function CvScreen({ s }: { s: Screens }) {
  const c = s.apply;
  return (
    <Phone label={s.example}>
      <div className="mock-progress">
        <p className="mock-title mock-title-small">{c.title}</p>
        <span className="mock-segment">
          <span className="mock-segment-on">{c.language}</span>
          <span>{c.other}</span>
        </span>
      </div>
      <div className="mock-card mock-cv">
        <p className="mock-cv-name">{c.name}</p>
        <p className="mock-small">{c.headline}</p>
        <p className="mock-cv-heading">{c.summaryTitle}</p>
        <p className="mock-cv-text">{c.summary}</p>
        <p className="mock-cv-heading">{c.skillsTitle}</p>
        <p className="mock-cv-text">{c.skills}</p>
      </div>
      <div className="mock-hint">{c.missing}</div>
      <div className="mock-button">{c.approve}</div>
      <div className="mock-button mock-button-outline">{c.pdf}</div>
    </Phone>
  );
}
