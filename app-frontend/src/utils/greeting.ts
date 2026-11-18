/** "Good morning / afternoon / evening" by the phone's clock (0–23). */
export function greetingFor(hour: number): 'morning' | 'afternoon' | 'evening' {
  if (hour < 12) return 'morning';
  if (hour < 18) return 'afternoon';
  return 'evening';
}

/** What to call the user until the profile has a name (TIQ-6): the part of the email before "@". */
export const displayName = (email: string) => email.split('@')[0] || email;

/** Up to two letters for the avatar circle. */
export const initials = (name: string) => name.slice(0, 2).toUpperCase();
