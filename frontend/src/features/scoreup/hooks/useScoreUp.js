import { useCallback } from 'react';
import { useScoreUpStore } from '../store/useScoreUpStore';
import { scoreupApi }      from '../scoreup.api';
import { toast }           from '@/components/ui/Toast';

/**
 * useScoreUp
 * Thin hook so components don't import the store + api separately.
 * ScoreUp.jsx has its own inline fetch; this hook is for other consumers.
 */
export function useScoreUp() {
  const { data, isLoading, setData, setLoading, setError } = useScoreUpStore();

  const fetchScore = useCallback(async (force = false) => {
    if (data && !force) return data;
    setLoading(true);
    try {
      const res  = await (force ? scoreupApi.refresh() : scoreupApi.getScore());
      const payload = res?.data ?? res;
      setData(payload);
      return payload;
    } catch (err) {
      setError(err?.message ?? 'Unknown error');
      toast.error('Could not load credit score');
      return null;
    }
  }, [data, setData, setLoading, setError]);

  const refreshScore = useCallback(async () => {
    toast.info('Refreshing your credit score…');
    const result = await fetchScore(true);
    if (result) toast.success('Score updated!');
    return result;
  }, [fetchScore]);

  return { data, isLoading, fetchScore, refreshScore };
}
