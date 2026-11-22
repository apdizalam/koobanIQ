import type { ReactNode } from 'react';
import { CvScreen, JobsScreen, ProfileScreen, QuizScreen } from '../components/AppScreens';
import { Waitlist } from '../components/Waitlist';
import type { Lang } from '../routes';
import type { Texts } from '../texts';

/** Small line icons (24px, current colour), drawn inline so nothing extra loads. */
const ICONS: Record<string, ReactNode> = {
  cv: <path d="M7 3h7l4 4v14H7zM14 3v4h4M10 12h5M10 16h3" />,
  skills: <path d="M12 3l2.6 5.3 5.9.9-4.3 4.1 1 5.8L12 16.4 6.8 19.1l1-5.8L3.5 9.2l5.9-.9z" />,
  match: <path d="M11 4a7 7 0 1 0 0 14 7 7 0 0 0 0-14Zm9 16-4-4" />,
};

const Icon = ({ name }: { name: string }) => (
  <svg
    className="icon"
    width="24"
    height="24"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
    focusable="false"
  >
    {ICONS[name]}
  </svg>
);

/** Line breaks written as \n in the texts. */
const lines = (text: string) =>
  text.split('\n').map((line, i, all) => (
    <span key={i}>
      {line}
      {i < all.length - 1 ? <br /> : null}
    </span>
  ));

const STEP_KEYS = ['profile', 'verify', 'jobs', 'apply'] as const;
const STEP_SCREENS = {
  profile: ProfileScreen,
  verify: QuizScreen,
  jobs: JobsScreen,
  apply: CvScreen,
};
const FEATURE_KEYS = [
  ['cv', 'cv'],
  ['skills', 'skills'],
  ['jobs', 'match'],
] as const;
const FAQ_KEYS = ['free', 'where', 'language', 'experience', 'ai', 'data', 'when'] as const;

export function Home({ t, lang }: { t: Texts; lang: Lang }) {
  return (
    <>
      <section className="hero" aria-labelledby="hero-title">
        <div className="container hero-grid">
          <div className="hero-text">
            <p className="eyebrow">{t.hero.eyebrow}</p>
            <h1 id="hero-title">{lines(t.hero.title)}</h1>
            <p className="hero-body">{t.hero.body}</p>
            <div className="hero-actions">
              <a className="button button-light" href="#waitlist">
                {t.hero.join}
              </a>
              <a className="button button-outline" href="#how">
                {t.hero.how}
              </a>
            </div>
            <p className="hero-soon">{t.hero.soon}</p>
            <ul className="stores" aria-label={t.hero.soon}>
              {[t.hero.appStore, t.hero.googlePlay].map((store) => (
                <li key={store} className="store-badge">
                  <span className="store-name">{store}</span>
                  <span className="store-soon">{t.hero.soonBadge}</span>
                </li>
              ))}
            </ul>
          </div>
          {/* A picture of what the app shows, built from text: nothing to download. */}
          <div className="hero-visual" aria-hidden="true">
            <div className="phone">
              <div className="phone-card">
                <span className="dot dot-success" />
                {t.hero.cardSkill}
              </div>
              <div className="phone-card phone-card-strong">
                <span className="dot dot-success" />
                {t.hero.cardMatch}
              </div>
              <div className="phone-card">
                <span className="dot dot-info" />
                {t.hero.cardCv}
              </div>
            </div>
          </div>
        </div>
      </section>

      <section id="how" className="section" aria-labelledby="how-title">
        <div className="container">
          <h2 id="how-title">{t.how.title}</h2>
          <p className="section-subtitle">{t.how.subtitle}</p>
          {/* Each step beside a picture of the app screen it happens on (alternating sides). */}
          <ol className="steps">
            {STEP_KEYS.map((key, i) => {
              const Screen = STEP_SCREENS[key];
              return (
                <li key={key} className="step">
                  <div className="step-text">
                    <span className="step-number" aria-hidden="true">
                      {i + 1}
                    </span>
                    <h3>{t.how.steps[key].title}</h3>
                    <p>{t.how.steps[key].body}</p>
                  </div>
                  <Screen s={t.how.screens} />
                </li>
              );
            })}
          </ol>
        </div>
      </section>

      <section id="features" className="section section-tint" aria-labelledby="features-title">
        <div className="container">
          <h2 id="features-title">{t.features.title}</h2>
          <p className="section-subtitle">{t.features.subtitle}</p>
          <div className="features">
            {FEATURE_KEYS.map(([key, icon]) => (
              <article key={key} className="card feature">
                <span className="feature-icon">
                  <Icon name={icon} />
                </span>
                <h3>{t.features[key].title}</h3>
                <p>{t.features[key].body}</p>
              </article>
            ))}
          </div>
          <p className="features-more">{t.features.more}</p>
        </div>
      </section>

      <section className="section" aria-labelledby="free-title">
        <div className="container free">
          <h2 id="free-title">{t.free.title}</h2>
          <p>{t.free.body}</p>
        </div>
      </section>

      <section id="faq" className="section section-tint" aria-labelledby="faq-title">
        <div className="container narrow">
          <h2 id="faq-title">{t.faq.title}</h2>
          <div className="faq">
            {FAQ_KEYS.map((key) => (
              <details key={key} className="faq-item">
                <summary>{t.faq.items[key].q}</summary>
                <p>{t.faq.items[key].a}</p>
              </details>
            ))}
          </div>
        </div>
      </section>

      <Waitlist t={t} lang={lang} />
    </>
  );
}
