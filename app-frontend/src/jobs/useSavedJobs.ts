import { useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { useAuth } from '../auth/authContext';
import { fetchSavedJobs, saveJob, unsaveJob } from '../services/jobsApi';
import type { MatchedJob } from '../types/jobs';

/**
 * The user's saved jobs (from the server, loaded each time the screen shows)
 * and a save / unsave toggle that shows the change at once and undoes it if
 * the server refuses.
 */
export function useSavedJobs() {
  const { getAccessToken } = useAuth();
  const [saved, setSaved] = useState<MatchedJob[]>([]);
  const [savedIds, setSavedIds] = useState<Set<string>>(new Set());
  const [failed, setFailed] = useState(false);

  const reload = useCallback(async () => {
    try {
      const { jobs } = await fetchSavedJobs(await getAccessToken());
      setSaved(jobs);
      setSavedIds(new Set(jobs.map((j) => j.job.id)));
    } catch {
      // Saved jobs are a convenience here; the search still works without them.
    }
  }, [getAccessToken]);

  useFocusEffect(
    useCallback(() => {
      void reload();
    }, [reload]),
  );

  const flip = (ids: Set<string>, id: string) => {
    const next = new Set(ids);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    return next;
  };

  const toggleSave = useCallback(
    async (jobId: string) => {
      const wasSaved = savedIds.has(jobId);
      setFailed(false);
      setSavedIds((ids) => flip(ids, jobId));
      try {
        const token = await getAccessToken();
        await (wasSaved ? unsaveJob(token, jobId) : saveJob(token, jobId));
        if (wasSaved) setSaved((list) => list.filter((j) => j.job.id !== jobId));
        else void reload();
      } catch {
        setSavedIds((ids) => flip(ids, jobId));
        setFailed(true);
      }
    },
    [getAccessToken, reload, savedIds],
  );

  return { saved, savedIds, toggleSave, saveFailed: failed, reload };
}
