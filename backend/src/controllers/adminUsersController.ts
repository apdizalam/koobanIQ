import type { Request, Response } from 'express';
import { AppError } from '../lib/errors.js';
import { ROLES, USER_STATUSES, type Role, type UserStatus } from '../models/User.js';
import {
  deleteUser,
  getUserDetail,
  listUsers,
  setUserRole,
  setUserStatus,
} from '../services/adminUserService.js';

const isRole = (v: unknown): v is Role => (ROLES as readonly unknown[]).includes(v);
const isStatus = (v: unknown): v is UserStatus => (USER_STATUSES as readonly unknown[]).includes(v);

/** Whole number in [min, max]; anything else becomes the fallback. */
function intParam(value: unknown, fallback: number, min: number, max: number) {
  const n = Number(value);
  return Number.isInteger(n) ? Math.min(Math.max(n, min), max) : fallback;
}

const invalid = (field: string, key: string) =>
  new AppError(400, 'VALIDATION_ERROR', 'Some fields are invalid', { [field]: key });

const idParam = (req: Request) => String(req.params.id);

/** GET /api/v1/admin/users?q=&role=&status=&page=&limit= */
export async function getUsers(req: Request, res: Response) {
  const { q, role, status } = req.query;
  if (role !== undefined && !isRole(role)) throw invalid('role', 'roleInvalid');
  if (status !== undefined && !isStatus(status)) throw invalid('status', 'statusInvalid');
  const page = intParam(req.query.page, 1, 1, 10_000);
  const limit = intParam(req.query.limit, 20, 1, 100);
  const data = await listUsers({
    q: typeof q === 'string' ? q : undefined,
    role,
    status,
    page,
    limit,
  });
  res.json({ data, error: null, meta: {} });
}

/** GET /api/v1/admin/users/:id */
export async function getUser(req: Request, res: Response) {
  res.json({ data: { user: await getUserDetail(idParam(req)) }, error: null, meta: {} });
}

/** PATCH /api/v1/admin/users/:id/status { status: "active" | "suspended" } */
export async function patchUserStatus(req: Request, res: Response) {
  const status = (req.body as { status?: unknown } | undefined)?.status;
  if (!isStatus(status)) throw invalid('status', 'statusInvalid');
  const user = await setUserStatus(req, idParam(req), status);
  res.json({ data: { user }, error: null, meta: {} });
}

/** PATCH /api/v1/admin/users/:id/role { role: "user" | "admin" } */
export async function patchUserRole(req: Request, res: Response) {
  const role = (req.body as { role?: unknown } | undefined)?.role;
  if (!isRole(role)) throw invalid('role', 'roleInvalid');
  const user = await setUserRole(req, idParam(req), role);
  res.json({ data: { user }, error: null, meta: {} });
}

/** DELETE /api/v1/admin/users/:id */
export async function removeUser(req: Request, res: Response) {
  await deleteUser(req, idParam(req));
  res.status(204).end();
}
