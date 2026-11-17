import { Schema, Types, model } from 'mongoose';

/**
 * `auditLogs` collection: who did what, to which record, and when.
 * The architecture doc names the first field `adminId`; it is `actorId` here
 * because denied attempts are made by non-admins too.
 */
const auditLogSchema = new Schema(
  {
    actorId: { type: Types.ObjectId, ref: 'User', required: true, index: true },
    /** e.g. "admin.access_denied" */
    action: { type: String, required: true, index: true },
    targetType: { type: String, required: true },
    targetId: { type: String, index: true },
    before: { type: Schema.Types.Mixed },
    after: { type: Schema.Types.Mixed },
    ip: { type: String },
    userAgent: { type: String },
  },
  { timestamps: { createdAt: true, updatedAt: false } },
);

auditLogSchema.index({ createdAt: -1 });

export const AuditLog = model('AuditLog', auditLogSchema);
