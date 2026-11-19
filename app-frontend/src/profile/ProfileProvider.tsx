import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { useAuth } from '../auth/authContext';
import {
  addProfileItem,
  deleteProfileItem,
  fetchProfile,
  savePersonal,
  savePreferences,
  updateProfileItem,
} from '../services/profileApi';
import type { Preferences, Profile, ProfileSection } from '../types/profile';

export type ProfileStatus = 'loading' | 'ready' | 'error';

export interface ProfileState {
  status: ProfileStatus;
  profile: Profile | null;
  /** Loads the profile again from the server. */
  reload: () => Promise<void>;
  savePersonal: (values: Record<string, unknown>) => Promise<void>;
  savePreferences: (values: Partial<Preferences>) => Promise<void>;
  addItem: (section: ProfileSection, values: Record<string, unknown>) => Promise<void>;
  updateItem: (
    section: ProfileSection,
    id: string,
    values: Record<string, unknown>,
  ) => Promise<void>;
  deleteItem: (section: ProfileSection, id: string) => Promise<void>;
}

const ProfileContext = createContext<ProfileState | null>(null);

/**
 * The signed-in user's profile, shared by the Profile tab, its edit screens and
 * Home. Always from the server (GET /profile), so it is the same after an app
 * restart and on any device; every save answers with the whole updated profile.
 */
export function ProfileProvider({ children }: { children: ReactNode }) {
  const { getAccessToken } = useAuth();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [status, setStatus] = useState<ProfileStatus>('loading');

  const reload = useCallback(async () => {
    try {
      const { profile: fresh } = await fetchProfile(await getAccessToken());
      setProfile(fresh);
      setStatus('ready');
    } catch {
      setStatus('error');
    }
  }, [getAccessToken]);

  useEffect(() => {
    let active = true;
    getAccessToken()
      .then(fetchProfile)
      .then(
        ({ profile: fresh }) => {
          if (!active) return;
          setProfile(fresh);
          setStatus('ready');
        },
        () => active && setStatus('error'),
      );
    return () => {
      active = false;
    };
  }, [getAccessToken]);

  /** Runs a save; the server's answer (the whole profile) replaces what is shown. */
  const run = useCallback(
    async (save: (token: string) => Promise<{ profile: Profile }>) => {
      const { profile: saved } = await save(await getAccessToken());
      setProfile(saved);
      setStatus('ready');
    },
    [getAccessToken],
  );

  const value = useMemo<ProfileState>(
    () => ({
      status,
      profile,
      reload,
      savePersonal: (values) => run((token) => savePersonal(token, values)),
      savePreferences: (values) => run((token) => savePreferences(token, values)),
      addItem: (section, values) => run((token) => addProfileItem(token, section, values)),
      updateItem: (section, id, values) =>
        run((token) => updateProfileItem(token, section, id, values)),
      deleteItem: (section, id) => run((token) => deleteProfileItem(token, section, id)),
    }),
    [status, profile, reload, run],
  );

  return <ProfileContext.Provider value={value}>{children}</ProfileContext.Provider>;
}

export function useProfile(): ProfileState {
  const state = useContext(ProfileContext);
  if (!state) throw new Error('useProfile must be used inside <ProfileProvider>');
  return state;
}
