'use strict';

const Groq = require('groq-sdk');
const env = require('../../config/env');
const { redis, safeRedis, TTL } = require('../../config/redis');
const { startTimer, safeJsonParse } = require('../utils/helpers');

// ─────────────────────────────────────────────────────────────────────────────
// Groq SDK singleton — re-used across all modules
// ─────────────────────────────────────────────────────────────────────────────
const groq = new Groq({ apiKey: env.GROQ_API_KEY });

// ─────────────────────────────────────────────────────────────────────────────
// Internal call wrapper — handles retries, timing, and error normalization
// ─────────────────────────────────────────────────────────────────────────────
const callGroq = async ({ systemPrompt, userContent, maxTokens = 150, jsonMode = false, cacheKey = null }) => {
  // 1. Cache check (only for deterministic prompts like ScoreUp)
  if (cacheKey) {
    const cached = await safeRedis(() => redis.get(`groq:${cacheKey}`));
    if (cached) {
      return { text: cached, fromCache: true, latencyMs: 0 };
    }
  }

  const endTimer = startTimer();

  const requestPayload = {
    model: env.GROQ_MODEL,
    max_tokens: maxTokens,
    temperature: 0.4,  // lower = more consistent, less creative → good for fintech
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userContent },
    ],
    ...(jsonMode && { response_format: { type: 'json_object' } }),
  };

  let lastError;
  for (let attempt = 1; attempt <= 2; attempt++) {
    try {
      const completion = await groq.chat.completions.create(requestPayload);
      const text = completion.choices[0]?.message?.content?.trim() ?? '';
      const latencyMs = endTimer();

      console.log(
        `⚡ [Groq] ${cacheKey || 'uncached'} | ${Math.round(latencyMs)}ms | tokens: ${completion.usage?.total_tokens ?? '?'}`
      );

      // Cache result if key provided
      if (cacheKey && text) {
        await safeRedis(() => redis.setex(`groq:${cacheKey}`, TTL.GROQ_RESPONSE, text));
      }

      return { text, fromCache: false, latencyMs };
    } catch (err) {
      lastError = err;
      console.warn(`⚠️  [Groq] Attempt ${attempt} failed: ${err.message}`);
      if (attempt < 2) await new Promise((r) => setTimeout(r, 300));
    }
  }

  throw new Error(`Groq inference failed after 2 attempts: ${lastError?.message}`);
};

// ─────────────────────────────────────────────────────────────────────────────
// MODULE 1: GUARDIAN — Hinglish fraud explanation
// Input: transaction + risk result → Output: 1-sentence Hinglish warning
// ─────────────────────────────────────────────────────────────────────────────
const generateGuardianMessage = async (tx, riskResult) => {
  const systemPrompt = `You are PaySense Guardian, a financial security AI for Indian Paytm users.
A real-time risk engine flagged a transaction. Write exactly ONE Hinglish warning sentence (max 20 words).
Rules:
- Start with "Rukiye —" (means "Stop —")
- Mention the SPECIFIC reason from the flags (not generic)
- Mention the amount
- End with a clear action: "Pehle verify karein" or "Ruk jaiye"
- NO greetings. NO markdown. NO extra sentences.
Example: "Rukiye — ₹25,000 ek naye UPI ID ko ja raha hai jisko aapne kabhi pay nahi kiya — pehle verify karein."`;

  const userContent = `Amount: ₹${(tx.amountPaise / 100).toFixed(0)}
Payee UPI: ${tx.payeeUpi}
Risk Score: ${riskResult.score}/100
Decision: ${riskResult.decision}
Risk Flags: ${riskResult.flags.join(' | ')}`;

  // Use fallback if Groq is slow — better UX than waiting 2s
  const fallbacks = {
    BLOCK: `Rukiye — yeh transaction suspicious lag raha hai, ₹${(tx.amountPaise / 100).toFixed(0)} bhejne se pehle verify karein.`,
    WARN: `Savdhan — ₹${(tx.amountPaise / 100).toFixed(0)} ki payment ke liye yeh UPI ID naya hai, ek baar confirm karein.`,
  };

  try {
    const result = await callGroq({ systemPrompt, userContent, maxTokens: 80 });
    return result.text || fallbacks[riskResult.decision] || fallbacks.WARN;
  } catch {
    return fallbacks[riskResult.decision] || fallbacks.WARN;
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// MODULE 1: GUARDIAN — Weekly spend insight nudge
// Input: spend summary → Output: personalized insight message
// ─────────────────────────────────────────────────────────────────────────────
const generateSpendInsight = async (spendSummary, userId) => {
  const systemPrompt = `You are PaySense, a friendly AI financial advisor for Indian users.
Write ONE actionable spend insight in Hinglish (max 25 words).
Rules:
- Be specific about category and percentage change
- Use "aap" (you, formal)
- One clear suggestion
- NO greetings. NO markdown.`;

  const userContent = `Top category: ${spendSummary.topCategory}
This week spend: ₹${spendSummary.thisWeekTotal}
Last week spend: ₹${spendSummary.lastWeekTotal}
Change: ${spendSummary.changePercent > 0 ? '+' : ''}${spendSummary.changePercent}%
Biggest anomaly: ${spendSummary.anomaly || 'none'}`;

  const cacheKey = `spend_insight_${userId}_${new Date().toISOString().slice(0, 10)}`;

  try {
    const result = await callGroq({ systemPrompt, userContent, maxTokens: 80, cacheKey });
    return result.text;
  } catch {
    return `Aapka ${spendSummary.topCategory} spend ${Math.abs(spendSummary.changePercent)}% ${spendSummary.changePercent > 0 ? 'badh gaya' : 'kam hua'} is hafte.`;
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// MODULE 2: VANI — NLU intent extraction (JSON mode — structured output)
// Input: Hinglish transcript → Output: { intent, entities, confidence }
// ─────────────────────────────────────────────────────────────────────────────
const extractIntent = async (transcript) => {
  const systemPrompt = `You are an NLU engine for an Indian UPI payments app.
Analyze the Hinglish/Hindi user utterance and extract the intent and entities.
Respond ONLY with valid JSON matching this EXACT schema — no extra text:
{
  "intent": "PAY_PERSON" | "CHECK_BALANCE" | "GET_SUMMARY" | "PAY_BILL" | "CHECK_SCOREUP" | "CANCEL" | "CONFIRM" | "UNKNOWN",
  "entities": {
    "payeeName": "string or null",
    "amountText": "the exact amount words spoken or null",
    "amountNumber": "number or null (extract if clearly numeric)",
    "timeframe": "today | this_week | this_month | last_week | null",
    "billType": "electricity | gas | water | broadband | mobile | null"
  },
  "confidence": 0.0
}
Examples:
- "Ramesh ko paanch sau bhejo" → PAY_PERSON, payeeName=Ramesh, amountText=paanch sau
- "Mera balance kya hai" → CHECK_BALANCE
- "Is hafte kitna kharch kiya" → GET_SUMMARY, timeframe=this_week
- "Haan" or "confirm" → CONFIRM
- "Nahi" or "cancel" → CANCEL`;

  try {
    const result = await callGroq({
      systemPrompt,
      userContent: transcript,
      maxTokens: 200,
      jsonMode: true,
    });

    const parsed = safeJsonParse(result.text);
    if (!parsed || !parsed.intent) throw new Error('Invalid JSON from Groq NLU');
    return parsed;
  } catch (err) {
    console.warn('[Groq NLU] Extraction failed, returning UNKNOWN:', err.message);
    return {
      intent: 'UNKNOWN',
      entities: { payeeName: null, amountText: null, amountNumber: null, timeframe: null, billType: null },
      confidence: 0.0,
    };
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// MODULE 2: VANI — Conversational response generation (Hindi TTS text)
// Input: action result → Output: natural Hindi response string
// ─────────────────────────────────────────────────────────────────────────────
const generateVaniResponse = async (action, context) => {
  const systemPrompt = `You are Vani, a friendly Hindi voice assistant for Paytm.
Speak in natural Hinglish (mix of Hindi + English numbers/names).
Be brief — max 15 words. Be warm and conversational.
NO markdown. NO asterisks. Just the spoken text.`;

  const userContent = `Action: ${action}
Context: ${JSON.stringify(context)}`;

  const fallbacks = {
    PAYMENT_SUCCESS: `${context.payee} ko ₹${context.amount} bhej diye. Done!`,
    PAYMENT_CONFIRM: `${context.payee} ko ₹${context.amount} bhejein? Confirm karne ke liye "haan" bolein.`,
    BALANCE_RESULT: `Aapka available balance ₹${context.balance} hai.`,
    SUMMARY_RESULT: `Is hafte aapne ₹${context.total} kharch kiye.`,
    CLARIFY_PAYEE: `Kisko bhejna hai? Contact ka naam batao.`,
    CLARIFY_AMOUNT: `Kitna bhejna hai?`,
    UNKNOWN_INTENT: `Samajh nahi aaya. Dobara try karein ya tap karke pay karein.`,
  };

  try {
    const result = await callGroq({ systemPrompt, userContent, maxTokens: 60 });
    return result.text || fallbacks[action] || fallbacks.UNKNOWN_INTENT;
  } catch {
    return fallbacks[action] || fallbacks.UNKNOWN_INTENT;
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// MODULE 3: SCOREUP — Personalized credit coaching message
// Input: credit signals + event type → Output: punchy Hindi nudge (≤140 chars)
// ─────────────────────────────────────────────────────────────────────────────
const generateCoachingMessage = async (creditSignals, event, userId) => {
  const systemPrompt = `You are ScoreUp, a gamified credit health coach inside Paytm.
Write ONE punchy coaching message in Hinglish (max 130 characters).
Rules:
- Use 1-2 relevant emojis
- Focus on either GAIN framing (what they unlock) OR LOSS framing (what they'll lose)
- Mention Postpaid limit or credit score specifically
- Make it feel like a CRED push notification — exciting, personal
- NO greetings. NO markdown.
Examples:
- "🔥 4 din ki streak! ₹500 aur bharo Postpaid → ₹3,000 limit boost mil sakta hai!"
- "⚠️ Utilization 82% ho gaya — ₹1,200 abhi bharo warna score gir sakta hai"`;

  const { score, streak, postpaidUtilized, postpaidLimit } = creditSignals;
  const utilPct = Math.round((postpaidUtilized / postpaidLimit) * 100);

  const userContent = `Event: ${event}
Credit Score: ${score}/100
Streak: ${streak} consecutive on-time payments
Postpaid Utilization: ${utilPct}% (₹${postpaidUtilized} of ₹${postpaidLimit})`;

  const cacheKey = `coaching_${userId}_${event}_${new Date().toISOString().slice(0, 10)}`;

  const fallbacks = {
    ON_TIME_PAYMENT: `✅ Payment on time! Streak ${streak} din ka — aise hi chalta rahe!`,
    MISSED_PAYMENT: `⚠️ EMI miss ho gaya — jaldi bharo warna credit score gir sakta hai.`,
    HIGH_UTILIZATION: `⚠️ ${utilPct}% utilization — ₹${Math.ceil(postpaidUtilized * 0.3)} abhi bharo, score improve hoga!`,
    STREAK_MILESTONE: `🔥 ${streak} din ki streak! Paytm Postpaid limit boost ke liye eligible ho sakte hain!`,
    LIMIT_INCREASE: `🎉 Aap Postpaid limit increase ke liye eligible hain! Details check karein.`,
    WEEKLY_SUMMARY: `📊 Is hafte ka credit score: ${score}/100. Ek payment aur — score badhega!`,
  };

  try {
    const result = await callGroq({ systemPrompt, userContent, maxTokens: 80, cacheKey });
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