import type { Request, Response } from 'express';
import { parseLoginBody, parseRegisterBody } from '../lib/validate.js';
import { loginUser, registerUser } from '../services/authService.js';

/** POST /api/v1/auth/register */
export async function register(req: Request, res: Response) {
  const input = parseRegisterBody(req.body);
  const user = await registerUser(input);
  res.status(201).json({ data: { user }, error: null, meta: {} });
}

/** POST /api/v1/auth/login */
export async function login(req: Request, res: Response) {
  const input = parseLoginBody(req.body);
  const result = await loginUser({ ...input, device: req.get('user-agent') });
  res.status(200).json({ data: result, error: null, meta: {} });
}
