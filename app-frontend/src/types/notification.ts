/** A new strong job match (TIQ-22): tapping it opens the job. */
export interface StrongMatchNotification {
  id: string;
  type: 'strong_match';
  jobId: string;
  /** The app writes the text in its current language from these. */
  values: { title: string; employer: string; score: number };
  read: boolean;
  createdAt: string;
}

/** An admin announcement (TIQ-33), written in both languages; the app shows its own. */
export interface AnnouncementNotification {
  id: string;
  type: 'announcement';
  jobId: null;
  message: { title: { en: string; so: string }; body: { en: string; so: string } };
  read: boolean;
  createdAt: string;
}

/** In-app notifications, as GET /notifications returns them. */
export type AppNotification = StrongMatchNotification | AnnouncementNotification;

export interface NotificationSettings {
  push: boolean;
  email: boolean;
  /** False until the server can email every user (domain verified). */
  emailAvailable: boolean;
}
