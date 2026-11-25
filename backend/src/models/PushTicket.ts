import { Schema, model } from 'mongoose';

/**
 * `pushTickets` collection: one record per push Expo accepted, kept until its
 * receipt is checked (about 15 minutes later; Expo keeps receipts for 24 hours).
 * Only the ticket id and the device token, never the message.
 */
const pushTicketSchema = new Schema(
  {
    ticketId: { type: String, required: true, unique: true },
    token: { type: String, required: true },
    /** MongoDB removes unchecked records after 24 hours (Expo no longer has them). */
    createdAt: { type: Date, default: Date.now, index: { expires: 24 * 60 * 60 } },
  },
  { versionKey: false },
);

export const PushTicket = model('PushTicket', pushTicketSchema);
