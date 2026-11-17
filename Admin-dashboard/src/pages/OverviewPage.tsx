import { useEffect, useState } from 'react';
import { useAuth } from '../auth/authContext';
import { en } from '../i18n/en';

type ServerCheck = 'checking' | 'ok' | 'failed';

/** Placeholder until the Overview task (TIQ-24) adds live counts. */
export function OverviewPage() {
  const { request } = useAuth();
  const [check, setCheck] = useState<ServerCheck>('checking');

  // A real signed-in API call: if the access token has expired, it is refreshed silently.
  useEffect(() => {
    let active = true;
    request('/admin/access')
      .then(() => active && setCheck('ok'))
      .catch(() => active && setCheck('failed'));
    return () => {
      active = false;
    };
  }, [request]);

  return (
    <section className="card">
      <h1>{en.overview.title}</h1>
      <p className="muted">{en.overview.comingSoon}</p>
      <p className={`status status-${check}`} role="status">
        {en.overview.serverCheck[check]}
      </p>
    </section>
  );
}
