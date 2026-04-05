'use strict';

const Groq = require('groq-sdk');
const env  = require('../../config/env');
const { redis, safeRedis, TTL } = require('../../config/redis');
const { startTimer, safeJsonParse } = require('../utils/helpers');

const groq = new Groq({ apiKey: env.GROQ_API_KEY });

// ─────────────────────────────────────────────────────────────────────────────
// callGroq — shared wrapper: retry × 2, caching, timing
// ─────────────────────────────────────────────────────────────────────────────
const callGroq = async ({ systemPrompt, userContent, maxTokens = 150, jsonMode = false, cacheKey = null }) => {
  if (cacheKey) {
    const cached = await safeRedis(() => redis.get(`groq:${cacheKey}`));
    if (cached) return { text: cached, fromCache: true, latencyMs: 0 };
  }

  const endTimer = startTimer();
  const payload  = {
    model:       env.GROQ_MODEL,
    max_tokens:  maxTokens,
    temperature: 0.4,
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user',   content: userContent  },
    ],
    ...(jsonMode && { response_format: { type: 'json_object' } }),
  };

  let lastError;
  for (let attempt = 1; attempt <= 2; attempt++) {
    try {
      const completion = await groq.chat.completions.create(payload);
      const text       = completion.choices[0]?.message?.content?.trim() ?? '';
      const latencyMs  = endTimer();
      console.log(`⚡ [Groq] ${cacheKey || 'uncached'} | ${Math.round(latencyMs)}ms | ${completion.usage?.total_tokens ?? '?'} tokens`);
      if (cacheKey && text) await safeRedis(() => redis.setex(`groq:${cacheKey}`, TTL.GROQ_RESPONSE, text));
      return { text, fromCache: false, latencyMs };
    } catch (err) {
      lastError = err;
      console.warn(`⚠️  [Groq] Attempt ${attempt} failed: ${err.message}`);
      if (attempt < 2) await new Promise((r) => setTimeout(r, 300));
    }
  }
  throw new Error(`Groq inference failed: ${lastError?.message}`);
};

// ─────────────────────────────────────────────────────────────────────────────
// generateGuardianMessage
// FIX 5: Uses fraudType.groqContext so each fraud type gets a specific
//         Hinglish explanation, not a generic "suspicious transaction" message.
// ─────────────────────────────────────────────────────────────────────────────
const generateGuardianMessage = async (tx, riskResult) => {
  const fraudType    = riskResult.fraudType;
  const fraudContext = fraudType?.groqContext
    || 'This transaction has multiple suspicious signals that match fraud patterns.';

  const systemPrompt =
    `You are PaySense Guardian, a financial security AI for Indian Paytm users.
A real-time fraud engine flagged a transaction. Write ONE Hinglish warning (max 20 words).
Rules:
- Start with "Rukiye —"
- Reference THIS specific fraud context: ${fraudContext}
- Mention the exact amount
- End with "Pehle verify karein" OR "Ruk jaiye"
- NO greetings. NO markdown. ONE sentence only.`;

  const userContent =
    `Amount: ₹${(tx.amountPaise / 100).toFixed(0)}
Payee UPI: ${tx.payeeUpi}
Fraud Type: ${fraudType?.label || 'Suspicious'}
Risk Score: ${riskResult.score}/100
Top Flags: ${riskResult.flags.slice(0, 3).join(' | ')}`;

  // Type-specific fallbacks — fire even when Groq is unavailable
  const typeFallbacks = {
    PHISHING_ATTEMPT:   `Rukiye — ₹${(tx.amountPaise/100).toFixed(0)} ek phishing UPI ID ko ja raha hai, yeh KYC scam ho sakta hai — ruk jaiye.`,
    SOCIAL_ENGINEERING: `Rukiye — ₹${(tx.amountPaise/100).toFixed(0)} ki payment ek anjaan ID ko ja rahi hai, social engineering scam ho sakta hai — pehle verify karein.`,
    ACCOUNT_TAKEOVER:   `Rukiye — naye device se ₹${(tx.amountPaise/100).toFixed(0)} ki payment suspicious hai, apna UPI PIN abhi badlein.`,
    VELOCITY_FRAUD:     `Rukiye — bahut zyada transactions ek sath ho rahi hain, ₹${(tx.amountPaise/100).toFixed(0)} ki payment rok lein — pehle verify karein.`,
    AMOUNT_ANOMALY:     `Rukiye — ₹${(tx.amountPaise/100).toFixed(0)} aapke normal kharche se bahut zyada hai — pehle verify karein.`,
    TEMPORAL_ANOMALY:   `Savdhan — raat ko anjaan UPI ID ko ₹${(tx.amountPaise/100).toFixed(0)} bhejne se pehle ek baar sochein.`,
    BLOCK:              `Rukiye — yeh transaction suspicious lag raha hai — ₹${(tx.amountPaise/100).toFixed(0)} bhejne se pehle verify karein.`,
    WARN:               `Savdhan — ₹${(tx.amountPaise/100).toFixed(0)} ki payment ke liye yeh UPI ID naya hai — ek baar confirm karein.`,
  };

  const fallback = typeFallbacks[fraudType?.id] ?? typeFallbacks[riskResult.decision] ?? typeFallbacks.BLOCK;

  try {
    const result = await callGroq({ systemPrompt, userContent, maxTokens: 80 });
    return result.text || fallback;
  } catch {
    return fallback;
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// generateSpendInsight — weekly spend nudge for Guardian Insights
// ─────────────────────────────────────────────────────────────────────────────
const generateSpendInsight = async (spendSummary, userId) => {
  const systemPrompt =
    `You are PaySense, a friendly Indian financial advisor.
Write ONE Hinglish spend insight (max 25 words). Be specific about category + change %.
Use "aap". One clear suggestion. NO greetings, NO markdown.`;

  const userContent =
    `Top: ${spendSummary.topCategory} | This week: ₹${spendSummary.thisWeekTotal} | Last week: ₹${spendSummary.lastWeekTotal} | Change: ${spendSummary.changePercent > 0 ? '+' : ''}${spendSummary.changePercent}% | Anomaly: ${spendSummary.anomaly || 'none'}`;

  const cacheKey = `spend_${userId}_${new Date().toISOString().slice(0, 10)}`;

  try {
    const result = await callGroq({ systemPrompt, userContent, maxTokens: 80, cacheKey });
    return result.text;
  } catch {
    return `Aapka ${spendSummary.topCategory} spend ${Math.abs(spendSummary.changePercent)}% ${spendSummary.changePercent > 0 ? 'badh gaya' : 'kam hua'} is hafte.`;
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// extractIntent — Vani NLU (JSON mode structured output)
// ─────────────────────────────────────────────────────────────────────────────
const extractIntent = async (transcript) => {
  const systemPrompt =
    `You are an NLU engine for an Indian UPI payments app.
Extract intent and entities from Hinglish/Hindi. Respond ONLY with valid JSON:
{"intent":"PAY_PERSON"|"CHECK_BALANCE"|"GET_SUMMARY"|"PAY_BILL"|"CHECK_SCOREUP"|"CANCEL"|"CONFIRM"|"UNKNOWN","entities":{"payeeName":null,"amountText":null,"amountNumber":null,"timeframe":null,"billType":null},"confidence":0.0}`;

  try {
    const result = await callGroq({ systemPrompt, userContent: transcript, maxTokens: 200, jsonMode: true });
    const parsed = safeJsonParse(result.text);
    if (!parsed?.intent) throw new Error('Invalid NLU JSON');
    return parsed;
  } catch {
    return { intent:'UNKNOWN', entities:{ payeeName:null, amountText:null, amountNumber:null, timeframe:null, billType:null }, confidence:0.0 };
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// generateVaniResponse — TTS text for Vani voice responses
// ─────────────────────────────────────────────────────────────────────────────
const generateVaniResponse = async (action, context) => {
  const systemPrompt =
    `You are Vani, Paytm's Hindi voice assistant. Speak natural Hinglish. Max 15 words. Warm, conversational. NO markdown.`;

  const fallbacks = {
    PAYMENT_SUCCESS: `${context.payee} ko ₹${context.amount} bhej diye. Done!`,
    PAYMENT_CONFIRM: `${context.payee} ko ₹${context.amount} bhejein? "Haan" bolein.`,
    BALANCE_RESULT:  `Aapka available balance ₹${context.balance} hai.`,
    SUMMARY_RESULT:  `Is hafte aapne ₹${context.total} kharch kiye.`,
    CLARIFY_PAYEE:   `Kisko bhejna hai? Contact ka naam batao.`,
    CLARIFY_AMOUNT:  `Kitna bhejna hai?`,
    SCORE_RESULT:    `Aapka credit score ${context.score} hai — ${context.level} level.`,
    UNKNOWN_INTENT:  `Samajh nahi aaya. Dobara try karein.`,
  };

  try {
    const result = await callGroq({
      systemPrompt,
      userContent: `Action: ${action}\nContext: ${JSON.stringify(context)}`,
      maxTokens:   60,
    });
    return result.text || fallbacks[action] || fallbacks.UNKNOWN_INTENT;
  } catch {
    return fallbacks[action] || fallbacks.UNKNOWN_INTENT;
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// generateCoachingMessage — ScoreUp credit nudge
// ─────────────────────────────────────────────────────────────────────────────
const generateCoachingMessage = async (creditSignals, event, userId) => {
  const systemPrompt =
    `You are ScoreUp, a gamified credit coach inside Paytm. ONE punchy Hinglish message (max 130 chars).
Use 1-2 emojis. GAIN or LOSS framing. Mention Postpaid limit or score. CRED-style urgency. NO greetings.`;

  const { score, streak, postpaidUtilized, postpaidLimit } = creditSignals;
  const utilPct = Math.round((postpaidUtilized / postpaidLimit) * 100);

  const fallbacks = {
    ON_TIME_PAYMENT:  `✅ Payment on time! Streak ${streak} din — aise hi chalta rahe!`,
    MISSED_PAYMENT:   `⚠️ EMI miss ho gaya — jaldi bharo warna credit score gir sakta hai.`,
    HIGH_UTILIZATION: `⚠️ ${utilPct}% utilization — ₹${Math.ceil(postpaidUtilized*0.3/100)} abhi bharo, score badhega!`,
    STREAK_MILESTONE: `🔥 ${streak} din ki streak! Postpaid limit boost ke liye eligible!`,
    LIMIT_INCREASE:   `🎉 Limit increase ke liye eligible hain — details check karein!`,
    WEEKLY_SUMMARY:   `📊 Is hafte ka score: ${score}/100. Ek payment aur — score badhega!`,
    BILL_DUE_SOON:    `⚠️ Bill due hone wala hai — abhi pay karo warna score girta hai.`,
  };

  const cacheKey = `coaching_${userId}_${event}_${new Date().toISOString().slice(0, 10)}`;

  try {
    const result = await callGroq({
      systemPrompt,
      userContent: `Event:${event} Score:${score} Streak:${streak} Util:${utilPct}%`,
      maxTokens:   80,
      cacheKey,
    });
    return result.text || fallbacks[event] || fallbacks.WEEKLY_SUMMARY;
  } catch {
    return fallbacks[event] || fallbacks.WEEKLY_SUMMARY;
  }
};

module.exports = {
  generateGuardianMessage,
  generateSpendInsight,
  extractIntent,
  generateVaniResponse,
  generateCoachingMessage,
};