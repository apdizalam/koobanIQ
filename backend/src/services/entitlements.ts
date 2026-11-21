import type { Types } from 'mongoose';
import type { AiFeature } from '../models/UsageRecord.js';

/**
 * Which features a user may use (TIQ-23). KOBANIQ is free for everyone: no
 * plans, no subscriptions, no payments, no usage limits, so the answer is
 * always yes. Features ask here (through runAi) so paid plans could be added
 * later without touching feature code. Never reads usage records.
 */
export async function isFeatureAllowed(
  userId: Types.ObjectId,
  feature: AiFeature,
): Promise<boolean> {
  // The same answer for every user and feature while the app is free.
  void userId;
  void feature;
  return true;
}
