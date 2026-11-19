import { AppError } from '../lib/errors.js';
import { aiPersonalDataValue } from '../services/settingsService.js';

/**
 * Owner decision: real users' profile data is never sent to the AI while
 * KOBANIQ uses the Gemini free tier. AI features that send a user's profile
 * (CVs) call this first, on the backend, for every request:
 * - allowed when the Admin Dashboard setting is ALLOWED (super admin only,
 *   after a paid tier and the privacy requirements are verified), or
 * - for test accounts (fictional data), marked by a super admin.
 * Default is BLOCKED; calling the API directly does not get around it.
 */
export async function assertPersonalDataAllowed(user: { testAccount?: boolean | null }) {
  if (user.testAccount === true) return;
  if ((await aiPersonalDataValue()) === 'allowed') return;
  throw new AppError(
    403,
    'AI_PERSONAL_DATA_BLOCKED',
    'Creating CVs with AI is not available yet. KOBANIQ uses a free AI service during development, which must not receive personal data',
  );
}
