'use strict';

const { redis, safeRedis, TTL } = require('../../../config/redis');
const { VANI } = require('../../../shared/constants');
const { safeJsonParse, generateSessionId } = require('../../../shared/utils/helpers');

// ─────────────────────────────────────────────────────────────────────────────
// DialogueSession — persisted in Redis for multi-turn conversations
// Each session is keyed by sessionId and expires after TTL.SESSION (5 min)
// ─────────────────────────────────────────────────────────────────────────────

const sessionKey = (sessionId) => `vani:session:${sessionId}`;

const createSession = (userId) => ({
  sessionId: generateSessionId(),
  userId,
  state: VANI.STATES.IDLE,
  intent: null,
  slots: {
    payee: null,      // display name
    upiId: null,      // resolved UPI ID
    amountPaise: null,
    billType: null,
    timeframe: null,
  },
  turnCount: 0,
  createdAt: new Date().toISOString(),
  lastUpdatedAt: new Date().toISOString(),
});

const loadSession = async (sessionId) => {
  if (!sessionId) return null;
  const raw = await safeRedis(() => redis.get(sessionKey(sessionId)));
  return safeJsonParse(raw);
};

const saveSession = async (session) => {
  await safeRedis(() =>
    redis.setex(sessionKey(session.sessionId), TTL.SESSION, JSON.stringify(session))
  );
};

const deleteSession = async (sessionId) => {
  await safeRedis(() => redis.del(sessionKey(sessionId)));
};

// ─────────────────────────────────────────────────────────────────────────────
// processDialogueTurn
// Core state machine — takes NLU result + session state → returns next action.
//
// Returns:
//   { action, prompt, session, executePayload? }
//   action: 'CLARIFY' | 'CONFIRM' | 'EXECUTE' | 'RESPOND' | 'RESET'
// ─────────────────────────────────────────────────────────────────────────────
const processDialogueTurn = async (nluResult, sessionId, userProfile) => {
  // Load or create session
  let session = await loadSession(sessionId);
  if (!session) session = createSession(userProfile.userId);

  const { intent, entities, confidence } = nluResult;
  session.turnCount += 1;
  session.lastUpdatedAt = new Date().toISOString();

  // ── Hard-stop: CANCEL intent resets everything ────────────────────────
  if (intent === VANI.INTENTS.CANCEL) {
    const resetSession = { ...session, state: VANI.STATES.IDLE, intent: null, slots: resetSlots() };
    await saveSession(resetSession);
    return {
      action: 'RESET',
      prompt: 'Theek hai, cancel kar diya. Kuch aur karna ho toh batao.',
      session: resetSession,
    };
  }

  // ── In-flow CONFIRM ───────────────────────────────────────────────────
  if (intent === VANI.INTENTS.CONFIRM && session.state === VANI.STATES.CONFIRMING) {
    session.state = VANI.STATES.EXECUTING;
    await saveSession(session);
    return {
      action: 'EXECUTE',
      prompt: null, // Frontend executes payment, no prompt needed
      session,
      executePayload: {
        intent: session.intent,
        slots: session.slots,
      },
    };
  }

  // ── New intent or continuing existing flow ────────────────────────────
  if (intent !== VANI.INTENTS.CONFIRM && intent !== VANI.INTENTS.UNKNOWN) {
    session.intent = intent;
    // Merge new entities into existing slots
    session.slots = mergeSlots(session.slots, entities, userProfile);
  }

  // ── Route by intent ───────────────────────────────────────────────────
  switch (session.intent) {

    case VANI.INTENTS.PAY_PERSON:
      return await handlePayPersonFlow(session, userProfile);

    case VANI.INTENTS.CHECK_BALANCE:
      await deleteSession(session.sessionId);
      return {
        action: 'RESPOND',
        prompt: null,
        session,
        executePayload: { intent: VANI.INTENTS.CHECK_BALANCE },
      };

    case VANI.INTENTS.GET_SUMMARY:
      await deleteSession(session.sessionId);
      return {
        action: 'RESPOND',
        prompt: null,
        session,
        executePayload: {
          intent: VANI.INTENTS.GET_SUMMARY,
          timeframe: session.slots.timeframe || 'this_week',
        },
      };

    case VANI.INTENTS.PAY_BILL:
      return await handlePayBillFlow(session);

    case VANI.INTENTS.CHECK_SCOREUP:
      await deleteSession(session.sessionId);
      return {
        action: 'RESPOND',
        prompt: null,
        session,
        executePayload: { intent: VANI.INTENTS.CHECK_SCOREUP },
      };

    default:
      session.state = VANI.STATES.IDLE;
      await saveSession(session);
      return {
        action: 'CLARIFY',
        prompt: 'Samajh nahi aaya. Kya aap UPI payment karna chahte hain ya balance check karna hai?',
        session,
      };
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// handlePayPersonFlow — manages the PAY_PERSON slot-filling flow
// Slots required: payee (resolved to upiId) + amountPaise
// ─────────────────────────────────────────────────────────────────────────────
const handlePayPersonFlow = async (session, userProfile) => {
  const { slots } = session;

  // ── Resolve payee name to UPI ID ──────────────────────────────────────
  if (slots.payee && !slots.upiId) {
    const resolved = resolvePayee(slots.payee, userProfile.frequentPayees || []);
    if (resolved) {
      slots.upiId = resolved.upiId;
    }
  }

  // ── Check what's missing ──────────────────────────────────────────────
  if (!slots.payee && !slots.upiId) {
    session.state = VANI.STATES.CLARIFY_PAYEE;
    await saveSession(session);
    return {
      action: 'CLARIFY',
      prompt: 'Kisko bhejna hai? Contact ka naam batao.',
      session,
      missingSlot: 'payee',
    };
  }

  if (slots.payee && !slots.upiId) {
    // Payee name found but couldn't resolve to UPI ID
    session.state = VANI.STATES.CLARIFY_PAYEE;
    await saveSession(session);
    return {
      action: 'CLARIFY',
      prompt: `"${slots.payee}" naam ka contact nahi mila. Unka UPI ID batao.`,
      session,
      missingSlot: 'upiId',
    };
  }

  if (!slots.amountPaise) {
    session.state = VANI.STATES.CLARIFY_AMOUNT;
    await saveSession(session);
    return {
      action: 'CLARIFY',
      prompt: slots.payee
        ? `${slots.payee} ko kitna bhejna hai?`
        : 'Kitna bhejna hai?',
      session,
      missingSlot: 'amount',
    };
  }

  // ── All slots filled → move to confirmation ───────────────────────────
  session.state = VANI.STATES.CONFIRMING;
  await saveSession(session);

  const amountRupees = slots.amountPaise / 100;
  const displayName = slots.payee || slots.upiId;

  return {
    action: 'CONFIRM',
    prompt: `${displayName} ko ₹${amountRupees} bhejein? Confirm karne ke liye "haan" bolein.`,
    session,
    confirmPayload: {
      payee: displayName,
      upiId: slots.upiId,
      amountPaise: slots.amountPaise,
      amountRupees,
    },
  };
};

// ─────────────────────────────────────────────────────────────────────────────
// handlePayBillFlow — manages bill payment
// ─────────────────────────────────────────────────────────────────────────────
const handlePayBillFlow = async (session) => {
  if (!session.slots.billType) {
    session.state = VANI.STATES.CLARIFY_PAYEE;
    await saveSession(session);
    return {
      action: 'CLARIFY',
      prompt: 'Kaunsa bill bharna hai? Bijli, mobile, gas, ya kuch aur?',
      session,
      missingSlot: 'billType',
    };
  }

  session.state = VANI.STATES.CONFIRMING;
  await saveSession(session);
  return {
    action: 'CONFIRM',
    prompt: `${session.slots.billType} ka bill pay karna hai? Confirm karein.`,
    session,
    confirmPayload: { billType: session.slots.billType },
  };
};

// ─────────────────────────────────────────────────────────────────────────────
// mergeSlots — only overwrite a slot if the new value is non-null
// ─────────────────────────────────────────────────────────────────────────────
const mergeSlots = (existing, entities, userProfile) => {
  const merged = { ...existing };

  if (entities.payeeName) merged.payee = entities.payeeName;
  if (entities.amountPaise) merged.amountPaise = entities.amountPaise;
  if (entities.timeframe) merged.timeframe = entities.timeframe;
  if (entities.billType) merged.billType = entities.billType;

  // Auto-resolve UPI ID if payee was just set
  if (entities.payeeName && !merged.upiId) {
    const resolved = resolvePayee(entities.payeeName, userProfile?.frequentPayees || []);
    if (resolved) merged.upiId = resolved.upiId;
  }

  return merged;
};

// ─────────────────────────────────────────────────────────────────────────────
// resolvePayee — fuzzy match payee name against user's contact list
// ─────────────────────────────────────────────────────────────────────────────
const resolvePayee = (nameInput, frequentPayees) => {
  if (!nameInput || !frequentPayees.length) return null;
  const normalized = nameInput.toLowerCase().trim();

  // Exact alias match first
  const exact = frequentPayees.find((p) =>
    p.alias.some((a) => a.toLowerCase() === normalized)
  );
  if (exact) return exact;

  // Partial match (name contains input)
  const partial = frequentPayees.find((p) =>
    p.alias.some((a) => a.toLowerCase().includes(normalized)) ||
    (p.displayName || '').toLowerCase().includes(normalized)
  );
  return partial || null;
};

const resetSlots = () => ({
  payee: null, upiId: null, amountPaise: null, billType: null, timeframe: null,
});

module.exports = {
  createSession,
  loadSession,
  saveSession,
  deleteSession,
  processDialogueTurn,
  resolvePayee,
};