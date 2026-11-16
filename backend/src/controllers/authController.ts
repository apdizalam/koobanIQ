import type { Request, Response } from 'express';
import { parseRegisterBody } from '../lib/validate.js';
import { registerUser } from '../services/authService.js';

/** POST /api/v1/auth/register */
export async function register(req: Request, res: Response) {
  const input = parseRegisterBody(req.body);
  const user = await registerUser(input);
  res.status(201).json({ data: { user }, error: null, meta: {} });
}
