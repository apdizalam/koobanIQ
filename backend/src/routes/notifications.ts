import { Router, type Request, type Response } from 'express';
import { AppError } from '../lib/errors.js';
import { requireAuth } from '../middleware/requireAuth.js';
import {
  listNotifications,
  markAllRead,
  markRead,
  registerPushToken,
  removePushToken,
  settingsOf,
  updateSettings,
} from '../services/notificationService.js';

type Body = Record<string, unknown>;
const bodyOf = (body: unknown): Body => (body && typeof body === 'object' ? (body as Body) : {});

/** The signed-in user's notifications (TIQ-22). No route takes a user id. */
export const notificationsRouter = Router();
notificationsRouter.use(requireAuth);

/** GET /api/v1/notifications: the in-app list and the unread count. */
notificationsRouter.get('/', async (req: Request, res: Response) => {
  res.json({ data: await listNotifications(req.user!._id), error: null, meta: {} });
});

/** POST /api/v1/notifications/read-all */
notificationsRouter.post('/read-all', async (req: Request, res: Response) => {
  await markAllRead(req.user!._id);
  res.status(204).end();
});

/** GET /api/v1/notifications/settings */
notificationsRouter.get('/settings', (req: Request, res: Response) => {
  res.json({ data: { settings: settingsOf(req.user!) }, error: null, meta: {} });
});

/** PUT /api/v1/notifications/settings { push?, email? } */
notificationsRouter.put('/settings', async (req: Request, res: Response) => {
  const b = bodyOf(req.body);
  const details: Record<string, string> = {};
  for (const key of Object.keys(b)) {
    if (key !== 'push' && key !== 'email') details[key] = 'fieldNotEditable';
    else if (typeof b[key] !== 'boolean') details[key] = 'enabledInvalid';
  }
  if (Object.keys(details).length > 0) {
    throw new AppError(400, 'VALIDATION_ERROR', 'Some fields are invalid', details);
  }
  const settings = await updateSettings(req.user!, {
    push: b.push as boolean | undefined,
    email: b.email as boolean | undefined,
  });
  res.json({ data: { settings }, error: null, meta: {} });
});

/** POST /api/v1/notifications/push-token { token, platform } */
notificationsRouter.post('/push-token', async (req: Request, res: Response) => {
  const b = bodyOf(req.body);
  await registerPushToken(req.user!._id, b.token, b.platform);
  res.status(204).end();
});

/** DELETE /api/v1/notifications/push-token { token } */
notificationsRouter.delete('/push-token', async (req: Request, res: Response) => {
  await removePushToken(req.user!._id, bodyOf(req.body).token);
  res.status(204).end();
});

/** POST /api/v1/notifications/:id/read */
notificationsRouter.post('/:id/read', async (req: Request, res: Response) => {
  const notification = await markRead(req.user!._id, req.params.id);
  res.json({ data: { notification }, error: null, meta: {} });
});
