import { useCallback } from 'react';
import { guardianApi } from '../guardianApi';
import { useGuardianStore } from '../guardianStore';
import { guardianSocket } from '@/services/socket';
import { haptic } from '@/utils/helpers';
import { toast } from '@/components/ui/Toast';

/**
 * useGuardian — encapsulates all Guardian interactions for the Pay page.
 *
 * Usage:
 *   const { scorePayment, confirmPayment, isScoring } = useGuardian();
 *
 * scorePayment → calls REST /api/guardian/score and fires socket tx:initiate
 * confirmPayment → calls REST /api/guardian/confirm/:txId
 */
export function useGuardian() {
  const {
    setScoringLoading,
    setScoringResult,
    isScoringLoading,
    addAlert,
    clearAlert,
  } = useGuardianStore();

  /**
   * scorePayment — score a transaction BEFORE the user taps Pay.
   * Fires both the REST endpoint (for immediate response) and the socket
   * event (to update the live feed + trigger Guardian modal).
   *
   * @param {object} payload - { amountPaise, payeeUpi, payeeName, category, note }
   * @param {string} userId
   * @returns {object} riskResult
   */
  const scorePayment = useCallback(async (payload, userId) => {
    setScoringLoading(true);
    haptic('light');

    try {
      // Fire socket event so live feed + modal trigger via socket pipeline
      if (guardianSocket.connected) {
        guardianSocket.emit('tx:initiate', {
          ...payload,
          userId,
          deviceId: navigator.userAgent.slice(0, 40),
        });
      }

      // Parallel REST call for immediate structured response
      const res = await guardianApi.score(payload);
      const result = res.data;
      setScoringResult(result);

      // If risk is elevated and socket didn't fire the modal (offline fallback)
      if (result.decision !== 'ALLOW' && !guardianSocket.connected) {
        addAlert({ ...result, amountPaise: payload.amountPaise, payeeUpi: payload.payeeUpi });
      }

      return result;
    } catch (err) {
      setScoringLoading(false);
      // Guardian failure should NOT block the payment — degrade gracefully
      console.warn('[Guardian] Scoring failed — allowing payment:', err.message);
      toast.warn('Guardian check failed. Proceed with caution.');
      return { decision: 'ALLOW', score: 0, flags: [], message: null };
    }
  }, [setScoringLoading, setScoringResult, addAlert]);

  /**
   * confirmPayment — confirm a transaction the user chose to proceed with.
   */
  const confirmPayment = useCallback(async (txId) => {
    try {
      await guardianApi.confirm(txId);
      clearAlert();
      haptic('medium');
    } catch (err) {
      console.warn('[Guardian] Confirm failed:', err.message);
      clearAlert(); // Clear anyway — don't block user
    }
  }, [clearAlert]);

  /**
   * loadInsights — fetch spend insights for the Insights page.
   */
  const loadInsights = useCallback(async (period = 'week') => {
    const { setInsights, setInsightsLoading } = useGuardianStore.getState();
    setInsightsLoading(true);
    try {
      const res = await guardianApi.getInsights(period);
      setInsights(res.data);
      return res.data;
    } catch (err) {
      setInsightsLoading(false);
      toast.error('Could not load insights');
      return null;
    }
  }, []);

  return {
    scorePayment,
    confirmPayment,
    loadInsights,
    isScoring: isScoringLoading,
  };
}