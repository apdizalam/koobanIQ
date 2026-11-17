import { randomUUID } from 'node:crypto';

/**
 * Unique per test run. CI runs several jobs at the same time against the
 * same test database; with this id in every test email (and in private
 * database names), one run's cleanup can never delete another run's data.
 */
export const RUN_ID = randomUUID().slice(0, 8);

/** Email domain for one test file in this run, plus a pattern that matches only it. */
export function testDomain(name: string) {
  const domain = `@${name}-${RUN_ID}.test.kobaniq.invalid`;
  const escaped = domain.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return { DOMAIN: domain, DOMAIN_RE: new RegExp(`${escaped}$`) };
}
