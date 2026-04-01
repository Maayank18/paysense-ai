'use strict';

const { extractIntent } = require('../../../shared/services/groqClient');
const { parseHindiAmount, parseHindiAmountToPaise, parseTimeframe } = require('./hindiNumParser');
const { VANI } = require('../../../shared/constants');
const { startTimer } = require('../../../shared/utils/helpers');

// ─────────────────────────────────────────────────────────────────────────────
// understandTranscript
// Two-pass NLU pipeline:
//   Pass 1 — Rule-based pre-processor (instant, catches >60% of cases)
//   Pass 2 — Groq LLaMA fallback for ambiguous/complex utterances
//
// This hybrid approach achieves:
//   - ~10ms for simple commands (rule-based)
//   - ~80ms for complex commands (Groq)
//   - Zero Groq calls for obvious cases (saves tokens + latency)
// ─────────────────────────────────────────────────────────────────────────────
const understandTranscript = async (transcript) => {
  const endTimer = startTimer();
  const normalized = transcript.toLowerCase().trim();

  // ── Pass 1: Rule-based fast path ──────────────────────────────────────
  const ruleResult = applyRules(normalized);

  if (ruleResult && ruleResult.confidence >= 0.85) {
    const latency = endTimer();
    console.log(`⚡ [NLU] Rule-based match in ${latency.toFixed(1)}ms: ${ruleResult.intent}`);
    return { ...ruleResult, latencyMs: Math.round(latency), source: 'rule' };
  }

  // ── Pass 2: Groq LLaMA NLU ───────────────────────────────────────────
  try {
    const groqResult = await extractIntent(transcript);
    const enriched = enrichWithParsers(groqResult, normalized);
    const latency = endTimer();

    console.log(`⚡ [NLU] Groq NLU in ${latency.toFixed(1)}ms: ${enriched.intent} (conf=${enriched.confidence})`);
    return { ...enriched, latencyMs: Math.round(latency), source: 'groq' };
  } catch (err) {
    console.error('[NLU] Groq fallback failed:', err.message);

    // Last resort: return rule result even at low confidence, or UNKNOWN
    const latency = endTimer();
    return ruleResult
      ? { ...ruleResult, latencyMs: Math.round(latency), source: 'rule_fallback' }
      : {
          intent: VANI.INTENTS.UNKNOWN,
          entities: { payeeName: null, amountText: null, amountNumber: null, amountPaise: null, timeframe: null, billType: null },
          confidence: 0.0,
          latencyMs: Math.round(latency),
          source: 'error_fallback',
        };
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// applyRules — deterministic intent matching from keyword patterns
// ─────────────────────────────────────────────────────────────────────────────
const applyRules = (text) => {
  const entities = {
    payeeName: null,
    amountText: null,
    amountNumber: null,
    amountPaise: null,
    timeframe: null,
    billType: null,
  };

  // Shared: extract timeframe
  entities.timeframe = parseTimeframe(text);

  // CONFIRM — "haan", "yes", "confirm", "theek hai"
  if (/^(haan|ha|yes|confirm|theek hai|bilkul|done|ok|okay|send kar|bhejo)/.test(text)) {
    return { intent: VANI.INTENTS.CONFIRM, entities, confidence: 0.98 };
  }

  // CANCEL — "nahi", "no", "cancel", "mat bhejo"
  if (/^(nahi|nah|no|cancel|band karo|ruk|rukke|mat bhejo|back)/.test(text)) {
    return { intent: VANI.INTENTS.CANCEL, entities, confidence: 0.98 };
  }

  // CHECK_BALANCE — "balance", "kitna paisa hai", "wallet"
  if (/(balance|paisa hai|wallet|account|kitna paisa|paisa kitna|mera paisa)/.test(text)) {
    return { intent: VANI.INTENTS.CHECK_BALANCE, entities, confidence: 0.95 };
  }

  // GET_SUMMARY — "kitna kharch", "kharcha", "spend", "transactions"
  if (/(kharcha|kharch|spend|spending|transactions?|history|kitna gaya|kya kharcha)/.test(text)) {
    return {
      intent: VANI.INTENTS.GET_SUMMARY,
      entities: { ...entities, timeframe: entities.timeframe || 'this_week' },
      confidence: 0.92,
    };
  }

  // CHECK_SCOREUP — "credit", "score", "postpaid", "scoreup"
  if (/(credit|score|scoreup|postpaid|limit|cibil)/.test(text)) {
    return { intent: VANI.INTENTS.CHECK_SCOREUP, entities, confidence: 0.93 };
  }

  // PAY_BILL — "bijli", "bill", "electricity", "gas", "recharge"
  const billMatch = text.match(/(bijli|electricity|gas|paani|water|mobile|broadband|internet|jio|airtel|vi|bsnl)/);
  if (billMatch) {
    entities.billType = mapBillType(billMatch[1]);
    return { intent: VANI.INTENTS.PAY_BILL, entities, confidence: 0.90 };
  }

  // PAY_PERSON — "bhejo", "transfer", "de do", "send"
  if (/(bhejo|bhej do|bhej|transfer|de do|send|pay|dede|bhijwa)/.test(text)) {
    // Extract payee name (word before "ko")
    const payeeMatch = text.match(/(\w+)\s+ko\s/);
    if (payeeMatch) entities.payeeName = capitalize(payeeMatch[1]);

    // Extract amount from Hindi words
    const amountPaise = parseHindiAmountToPaise(text);
    if (amountPaise) {
      entities.amountPaise = amountPaise;
      entities.amountNumber = amountPaise / 100;
    }

    return {
      intent: VANI.INTENTS.PAY_PERSON,
      entities,
      confidence: entities.payeeName && entities.amountPaise ? 0.92 : 0.75,
    };
  }

  return null; // No rule matched — delegate to Groq
};

// ─────────────────────────────────────────────────────────────────────────────
// enrichWithParsers — post-process Groq output with Hindi parsers
// Groq often misses amount in words — our parser catches them
// ─────────────────────────────────────────────────────────────────────────────
const enrichWithParsers = (groqResult, originalText) => {
  const entities = { ...groqResult.entities };

  // If Groq didn't extract amount but amountText exists, parse it
  if (entities.amountText && !entities.amountNumber) {
    const parsed = parseHindiAmount(entities.amountText);
    if (parsed) {
      entities.amountNumber = parsed;
      entities.amountPaise = parsed * 100;
    }
  }

  // If amount is still missing, try parsing from full transcript
  if (!entities.amountPaise && originalText) {
    const parsed = parseHindiAmountToPaise(originalText);
    if (parsed) {
      entities.amountPaise = parsed;
      entities.amountNumber = parsed / 100;
    }
  }

  // If timeframe missing, parse from transcript
  if (!entities.timeframe && originalText) {
    entities.timeframe = parseTimeframe(originalText);
  }

  // Capitalize payee name
  if (entities.payeeName) {
    entities.payeeName = capitalize(entities.payeeName);
  }

  return { ...groqResult, entities };
};

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────
const capitalize = (s) => s.charAt(0).toUpperCase() + s.slice(1).toLowerCase();

const mapBillType = (word) => {
  const map = {
    bijli: 'electricity', electricity: 'electricity',
    gas: 'gas',
    paani: 'water', water: 'water',
    mobile: 'mobile',
    broadband: 'broadband', internet: 'broadband',
    jio: 'mobile', airtel: 'mobile', vi: 'mobile', bsnl: 'mobile',
  };
  return map[word] || 'other';
};

module.exports = { understandTranscript };