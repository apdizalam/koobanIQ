/**
 * Backend API base URL. Set EXPO_PUBLIC_API_URL in app-frontend/.env
 * (see .env.example). On a phone, "localhost" is the phone itself, so use
 * the computer's Wi-Fi address, e.g. http://192.168.100.125:5000/api/v1.
 */
export const API_BASE_URL: string =
  process.env.EXPO_PUBLIC_API_URL ?? 'http://localhost:5000/api/v1';
