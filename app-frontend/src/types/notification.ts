/** In-app notifications (TIQ-22), as GET /notifications returns them. */
export interface AppNotification {
  id: string;
  type: 'strong_match';
  jobId: string;
  /** The app writes the text in its current language from these. */
  values: { title: string; employer: string; score: number };
  read: boolean;
  createdAt: string;
}

export interface NotificationSettings {
  push: boolean;
  email: boolean;
  /** False until the server can email every user (domain verified). */
  emailAvailable: boolean;
}
