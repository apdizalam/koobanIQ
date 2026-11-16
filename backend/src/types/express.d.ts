import type { UserDocument } from '../models/User.js';

declare global {
  namespace Express {
    interface Request {
      /** Set by requireAuth: the signed-in user. */
      user?: UserDocument;
    }
  }
}

export {};
