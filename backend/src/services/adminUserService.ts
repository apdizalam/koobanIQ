import type { Request } from 'express';
import { Types } from 'mongoose';
import { AppError } from '../lib/errors.js';
import { RefreshToken } from '../models/RefreshToken.js';
import {
  User,
  toPublicUser,
  type Role,
  type UserDocument,
  type UserStatus,
} from '../models/User.js';
import { recordAudit } from './auditService.js';

/** What the admin pages show for a user (public fields + activity). */
export function toAdminUser(user: UserDocument) {
  return { ...toPublicUser(user), lastActiveAt: user.lastActiveAt ?? null };
}

export interface ListUsersQuery {
  q?: string;
  role?: Role;
  status?: UserStatus;
  page: number;
  limit: number;
}

const escapeRegex = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** Users list for the admin: search by email, filter by role/status, newest first, paged. */
export async function listUsers({ q, role, status, page, limit }: ListUsersQuery) {
  const filter: Record<string, unknown> = {};
  if (q) filter.email = { $regex: escapeRegex(q.trim()), $options: 'i' };
  if (role) filter.role = role;
  if (status) filter.status = status;

  const [users, total] = await Promise.all([
    User.find(filter)
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit),
    User.countDocuments(filter),
  ]);
  return { items: users.map(toAdminUser), total, page, limit };
}

async function findUser(id: string): Promise<UserDocument> {
  const user = Types.ObjectId.isValid(id) ? await User.findById(id) : null;
  if (!user) throw new AppError(404, 'USER_NOT_FOUND', 'No account with this id');
  return user;
}

/** One user plus how many sessions (devices) are signed in right now. */
export async function getUserDetail(id: string) {
  const user = await findUser(id);
  const activeSessions = await RefreshToken.countDocuments({
    userId: user._id,
    revokedAt: null,
    expiresAt: { $gt: new Date() },
  });
  return { ...toAdminUser(user), activeSessions };
}

function refuseSelf(req: Request, target: UserDocument) {
  if (String(target._id) === String(req.user!._id)) {
    throw new AppError(409, 'CANNOT_CHANGE_SELF', 'You cannot change your own account here');
  }
}

/** Refuses a change that would leave no active admin. */
async function refuseLastAdmin(target: UserDocument) {
  if (target.role !== 'admin' || target.status !== 'active') return;
  const others = await User.countDocuments({
    _id: { $ne: target._id },
    role: 'admin',
    status: 'active',
  });
  if (others === 0) {
    throw new AppError(409, 'LAST_ADMIN', 'At least one active admin must remain');
  }
}

/** Ends every session of a user (all refresh tokens stop working). */
async function signOutEverywhere(userId: Types.ObjectId) {
  await RefreshToken.updateMany(
    { userId, revokedAt: null },
    { revokedAt: new Date(), revokedReason: 'admin' },
  );
}

/** Suspend (signs the user out everywhere) or reactivate. */
export async function setUserStatus(req: Request, id: string, status: UserStatus) {
  const user = await findUser(id);
  refuseSelf(req, user);
  const before = user.status;
  if (before === status) return toAdminUser(user);
  if (status === 'suspended') await refuseLastAdmin(user);

  user.status = status;
  await user.save();
  if (status === 'suspended') await signOutEverywhere(user._id);
  await recordAudit(req, {
    action: status === 'suspended' ? 'user.suspend' : 'user.reactivate',
    targetType: 'user',
    targetId: String(user._id),
    before: { status: before },
    after: { status },
  });
  return toAdminUser(user);
}

/** Make someone an admin or a normal user. */
export async function setUserRole(req: Request, id: string, role: Role) {
  const user = await findUser(id);
  refuseSelf(req, user);
  const before = user.role;
  if (before === role) return toAdminUser(user);
  if (role !== 'admin') await refuseLastAdmin(user);

  user.role = role;
  await user.save();
  await recordAudit(req, {
    action: 'user.role_change',
    targetType: 'user',
    targetId: String(user._id),
    before: { role: before },
    after: { role },
  });
  return toAdminUser(user);
}

/** Delete an account and its sessions. The audit record keeps who it was. */
export async function deleteUser(req: Request, id: string) {
  const user = await findUser(id);
  refuseSelf(req, user);
  await refuseLastAdmin(user);

  await RefreshToken.deleteMany({ userId: user._id });
  await User.deleteOne({ _id: user._id });
  await recordAudit(req, {
    action: 'user.delete',
    targetType: 'user',
    targetId: String(user._id),
    before: { email: user.email, role: user.role, status: user.status },
  });
}
