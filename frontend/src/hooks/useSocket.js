import { useEffect, useRef } from 'react';
import { guardianSocket, vaniSocket, connectSockets, disconnectSockets } from '@/services/socket';
import { useGuardianStore } from '@/features/guardian/store/guardianStore';
import { useVaniStore } from '@/features/vani/store/vaniStore';

export const useSocket = (userId) => {
  const initialized = useRef(false);
  const addAlert = useGuardianStore(s => s.addAlert);
  const addStreamTx = useGuardianStore(s => s.addStreamTx);
  const setVaniState = useVaniStore(s => s.setState);

  useEffect(() => {
    if (!userId || initialized.current) return;
    initialized.current = true;

    connectSockets(userId);

    // ── Guardian events ─────────────────────────────────────────────────
    guardianSocket.on('guardian:alert', (payload) => {
      addAlert({ ...payload, alertedAt: Date.now() });
    });

    guardianSocket.on('guardian:safe', (payload) => {
      // Safe — just update stream, no modal
      addStreamTx({ ...payload, decision: 'ALLOW' });
    });

    guardianSocket.on('tx:stream', (tx) => {
      addStreamTx(tx);
    });

    // ── Vani events ─────────────────────────────────────────────────────
    vaniSocket.on('vani:transcript', (data) => {
      setVaniState('transcript', data.transcript);
    });

    vaniSocket.on('vani:understanding', (data) => {
      setVaniState('dialogueAction', data);
    });

    vaniSocket.on('vani:confirm_ready', (data) => {
      setVaniState('confirmPayload', data);
      setVaniState('phase', 'confirming');
    });

    vaniSocket.on('vani:result', (data) => {
      setVaniState('result', data);
      setVaniState('phase', 'success');
    });

    vaniSocket.on('vani:cancelled', () => {
      setVaniState('phase', 'idle');
    });

    return () => {
      disconnectSockets();
      initialized.current = false;
    };
  }, [userId]);
};
