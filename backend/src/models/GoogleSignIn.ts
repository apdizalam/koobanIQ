import { Schema, model } from 'mongoose';

/**
 * `googleSignIns` collection (TIQ-39): one short-lived record per "Continue with
 * Google" attempt. It ties Google's answer to the app that asked, and it holds
 * the one-time code the app swaps for a session. Deleted automatically after
 * 10 minutes (TTL index) and deleted at once when the sign-in finishes.
 */
const googleSignInSchema = new Schema(
  {
    /** Random value sent to Google and checked when Google sends the user back. */
    state: { type: String, required: true, unique: true },
    /** PKCE secret: proves to Google that this server started the sign-in. */
    codeVerifier: { type: String, required: true },
    /** Where the browser goes when Google is done: the app's own link. */
    returnUrl: { type: String, required: true },
    /** SHA-256 of the one-time code handed to the app (the code itself is never stored). */
    handoffHash: { type: String, index: { unique: true, sparse: true } },
    /** What Google said about the person (set after the callback). */
    google: {
      sub: { type: String },
      email: { type: String },
      emailVerified: { type: Boolean },
    },
    expiresAt: { type: Date, required: true, index: { expires: 0 } },
  },
  { timestamps: true },
);

export const GoogleSignIn = model('GoogleSignIn', googleSignInSchema);
