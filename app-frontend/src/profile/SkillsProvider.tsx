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
import { addSkill, deleteSkill, fetchSkills, updateSkill } from '../services/skillsApi';
import type { Skill, SkillCounts } from '../types/skills';

export type SkillsStatus = 'loading' | 'ready' | 'error';

export interface SkillsState {
  status: SkillsStatus;
  skills: Skill[];
  /** From the server: total, assessed, self-reported. */
  counts: SkillCounts;
  /** Topics quizzes found missing, summed over all skills (from the stored gaps). */
  gapCount: number;
  reload: () => Promise<void>;
  add: (values: Record<string, unknown>) => Promise<void>;
  update: (id: string, values: Record<string, unknown>) => Promise<void>;
  remove: (id: string) => Promise<void>;
}

const EMPTY_COUNTS: SkillCounts = { total: 0, assessed: 0, selfReported: 0 };
const SkillsContext = createContext<SkillsState | null>(null);

/**
 * The signed-in user's skills, shared by the skill profile, its edit screen,
 * the Profile tab and Home. Always loaded again from the server after a change,
 * so the counts are the database's counts.
 */
export function SkillsProvider({ children }: { children: ReactNode }) {
  const { getAccessToken } = useAuth();
  const [skills, setSkills] = useState<Skill[]>([]);
  const [counts, setCounts] = useState<SkillCounts>(EMPTY_COUNTS);
  const [status, setStatus] = useState<SkillsStatus>('loading');

  const load = useCallback(async () => {
    const data = await fetchSkills(await getAccessToken());
    setSkills(data.skills);
    setCounts(data.counts);
    setStatus('ready');
  }, [getAccessToken]);

  const reload = useCallback(async () => {
    try {
      await load();
    } catch {
      setStatus('error');
    }
  }, [load]);

  useEffect(() => {
    let active = true;
    getAccessToken()
      .then(fetchSkills)
      .then(
        (data) => {
          if (!active) return;
          setSkills(data.skills);
          setCounts(data.counts);
          setStatus('ready');
        },
        () => active && setStatus('error'),
      );
    return () => {
      active = false;
    };
  }, [getAccessToken]);

  const value = useMemo<SkillsState>(
    () => ({
      status,
      skills,
      counts,
      gapCount: skills.reduce((sum, skill) => sum + skill.gaps.length, 0),
      reload,
      // After every change the list and counts come again from the server.
      add: async (values) => {
        await addSkill(await getAccessToken(), values);
        await load();
      },
      update: async (id, values) => {
        await updateSkill(await getAccessToken(), id, values);
        await load();
      },
      remove: async (id) => {
        await deleteSkill(await getAccessToken(), id);
        await load();
      },
    }),
    [status, skills, counts, reload, load, getAccessToken],
  );

  return <SkillsContext.Provider value={value}>{children}</SkillsContext.Provider>;
}

export function useSkills(): SkillsState {
  const state = useContext(SkillsContext);
  if (!state) throw new Error('useSkills must be used inside <SkillsProvider>');
  return state;
}
