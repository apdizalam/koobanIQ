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
  addJobDescription,
  deleteCv,
  fetchCv,
  fetchCvs,
  fetchJobDescriptions,
  generateCv,
} from '../services/cvApi';
import type { Cv, CvLanguage, JobDescription } from '../types/cv';

export type CvStatus = 'loading' | 'ready' | 'error';

export interface CvState {
  status: CvStatus;
  /** Newest first, without content. */
  cvs: Cv[];
  /** The user's saved job ads, newest first. */
  jobs: JobDescription[];
  jobById: (id: string) => JobDescription | undefined;
  reload: () => Promise<void>;
  /** The AI reads the ad; the saved job ad comes back (also when it was saved before). */
  addJob: (
    input: { text: string } | { pdf: { data: string; fileName: string } },
  ) => Promise<JobDescription>;
  /** A new CV version for this job ad in the chosen language. */
  generate: (jobId: string, language: CvLanguage) => Promise<Cv>;
  /** One CV with its content. */
  loadCv: (id: string) => Promise<Cv>;
  removeCv: (id: string) => Promise<void>;
}

const CvContext = createContext<CvState | null>(null);

/**
 * The signed-in user's CVs and job ads (TIQ-8/9), shared by the CV tab and the
 * CV screens. Lists are loaded again from the server after every change.
 */
export function CvProvider({ children }: { children: ReactNode }) {
  const { getAccessToken } = useAuth();
  const [cvs, setCvs] = useState<Cv[]>([]);
  const [jobs, setJobs] = useState<JobDescription[]>([]);
  const [status, setStatus] = useState<CvStatus>('loading');

  const fetchAll = useCallback(async () => {
    const token = await getAccessToken();
    const [cvData, jobData] = await Promise.all([fetchCvs(token), fetchJobDescriptions(token)]);
    return { cvs: cvData.cvs, jobs: jobData.jobDescriptions };
  }, [getAccessToken]);

  const reload = useCallback(async () => {
    try {
      const data = await fetchAll();
      setCvs(data.cvs);
      setJobs(data.jobs);
      setStatus('ready');
    } catch {
      setStatus('error');
    }
  }, [fetchAll]);

  useEffect(() => {
    let active = true;
    fetchAll().then(
      (data) => {
        if (!active) return;
        setCvs(data.cvs);
        setJobs(data.jobs);
        setStatus('ready');
      },
      () => active && setStatus('error'),
    );
    return () => {
      active = false;
    };
  }, [fetchAll]);

  const addJob = useCallback<CvState['addJob']>(
    async (input) => {
      const { jobDescription } = await addJobDescription(await getAccessToken(), input);
      setJobs((now) => [jobDescription, ...now.filter((j) => j.id !== jobDescription.id)]);
      return jobDescription;
    },
    [getAccessToken],
  );

  const generate = useCallback<CvState['generate']>(
    async (jobId, language) => {
      const { cv } = await generateCv(await getAccessToken(), jobId, language);
      setCvs((now) => [{ ...cv, content: undefined }, ...now]);
      return cv;
    },
    [getAccessToken],
  );

  const loadCv = useCallback<CvState['loadCv']>(
    async (id) => (await fetchCv(await getAccessToken(), id)).cv,
    [getAccessToken],
  );

  const removeCv = useCallback<CvState['removeCv']>(
    async (id) => {
      await deleteCv(await getAccessToken(), id);
      setCvs((now) => now.filter((c) => c.id !== id));
    },
    [getAccessToken],
  );

  const value = useMemo<CvState>(
    () => ({
      status,
      cvs,
      jobs,
      jobById: (id) => jobs.find((j) => j.id === id),
      reload,
      addJob,
      generate,
      loadCv,
      removeCv,
    }),
    [status, cvs, jobs, reload, addJob, generate, loadCv, removeCv],
  );
  return <CvContext.Provider value={value}>{children}</CvContext.Provider>;
}

export function useCvs(): CvState {
  const value = useContext(CvContext);
  if (!value) throw new Error('useCvs must be used inside <CvProvider>');
  return value;
}
