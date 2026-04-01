'use strict';

// ─────────────────────────────────────────────────────────────────────────────
// Hindi/Hinglish number word → numeric value converter
// Handles: "paanch sau" → 500, "ek hazaar do sau" → 1200, "do lakh" → 200000
// Also handles Hinglish mix: "500 rupees" → 500, "1.5k" → 1500
// Pure function — zero I/O, synchronous, < 0.1ms
// ─────────────────────────────────────────────────────────────────────────────

// Hindi units (ones and teens)
const ONES = {
  ek: 1, do: 2, teen: 3, char: 4, paanch: 5,
  chhe: 6, saat: 7, aath: 8, nau: 9,
  das: 10, gyarah: 11, barah: 12, terah: 13, chaudah: 14,
  pandrah: 15, solah: 16, satrah: 17, atharah: 18, unnis: 19,
  bees: 20, ikis: 21, bais: 22, teis: 23, chaubis: 24,
  pachchis: 25, chabbis: 26, satais: 27, athais: 28, untis: 29,
  tees: 30, ikattis: 31, battis: 32, taintis: 33, chautis: 34,
  paintis: 35, chattis: 36, saintis: 37, artis: 38, untalis: 39,
  chalis: 40, ikchalis: 41, bayalis: 42, taintalis: 43, chavalis: 44,
  paintalis: 45, chiyalis: 46, saintalis: 47, artalis: 48, unchas: 49,
  pachas: 50, ikyavan: 51, bavan: 52, tirpan: 53, chauvan: 54,
  pachpan: 55, chhappan: 56, sattavan: 57, attavan: 58, unsath: 59,
  saath: 60, iksath: 61, basath: 62, tirsath: 63, chausath: 64,
  painsath: 65, chhiyasath: 66, sarsath: 67, arsath: 68, unhattar: 69,
  sattar: 70, ikattar: 71, bahattar: 72, tihattar: 73, chauhattar: 74,
  pachhattar: 75, chhihattar: 76, satattar: 77, atattar: 78, unasi: 79,
  assi: 80, ikyasi: 81, bayasi: 82, tirasi: 83, chaurasi: 84,
  pachasi: 85, chhiyasi: 86, satasi: 87, athasi: 88, navasi: 89,
  nabbe: 90, ikyaanave: 91, baanave: 92, tiranave: 93, chauranave: 94,
  pachhanave: 95, chhiyaanave: 96, sattaanave: 97, atthaanave: 98, ninyaanave: 99,
};

// Scale multipliers
const SCALES = {
  sau: 100,
  hazaar: 1_000, hazar: 1_000,
  lakh: 1_00_000, lac: 1_00_000,
  crore: 1_00_00_000, karod: 1_00_00_000,
};

// ─────────────────────────────────────────────────────────────────────────────
// parseHindiAmount — main entry point
// Returns null if no valid amount could be parsed
// ─────────────────────────────────────────────────────────────────────────────
const parseHindiAmount = (input) => {
  if (!input || typeof input !== 'string') return null;

  const text = input.toLowerCase().trim();

  // ── 1. Direct numeric extraction (Whisper often transcribes numerals) ──
  // Handles: "500", "₹1500", "Rs 2000", "1.5k", "2.5 lakh"
  const numericResult = extractNumericFromString(text);
  if (numericResult !== null) return numericResult;

  // ── 2. Hindi word parsing ─────────────────────────────────────────────
  return parseHindiWords(text);
};

// ─────────────────────────────────────────────────────────────────────────────
// extractNumericFromString — handles numeric and abbreviated forms
// ─────────────────────────────────────────────────────────────────────────────
const extractNumericFromString = (text) => {
  // Remove currency symbols and common prefixes — NOTE: no dot in char class
  // to preserve decimal points needed for "1.5k" → 1500
  const cleaned = text
    .replace(/[₹]|(?:rs|rupees?|rupaye?|rupe?)\b/gi, '')
    .trim();

  // Pattern: "1.5k" → 1500, "2.5l" → 250000
  const kPattern = /^(\d+(?:\.\d+)?)\s*k$/i;
  const kMatch = cleaned.match(kPattern);
  if (kMatch) return Math.round(parseFloat(kMatch[1]) * 1_000);

  const lPattern = /^(\d+(?:\.\d+)?)\s*l(?:akh)?$/i;
  const lMatch = cleaned.match(lPattern);
  if (lMatch) return Math.round(parseFloat(lMatch[1]) * 1_00_000);

  // Plain integer or float
  const numMatch = cleaned.match(/^(\d+(?:\.\d{1,2})?)$/);
  if (numMatch) {
    const val = parseFloat(numMatch[1]);
    return isNaN(val) || val <= 0 ? null : Math.round(val);
  }

  // Number embedded in text: "bhejo 500 rupees" → 500
  const embeddedMatch = text.match(/\b(\d{1,7})\b/);
  if (embeddedMatch) {
    const val = parseInt(embeddedMatch[1], 10);
    return val > 0 ? val : null;
  }

  return null;
};

// ─────────────────────────────────────────────────────────────────────────────
// parseHindiWords — tokenizes and evaluates Hindi word sequences
// Algorithm: accumulate current value, apply scale multipliers
// ─────────────────────────────────────────────────────────────────────────────
const parseHindiWords = (text) => {
  // Remove filler words common in Hinglish speech
  const fillers = ['ko', 'ka', 'ki', 'se', 'mein', 'aur', 'bhi', 'na', 'please', 'plz', 'ji', 'bhai', 'yaar', 'rupees', 'rupaye', 'rupe'];
  let tokens = text.split(/\s+/).filter((t) => !fillers.includes(t));

  let result = 0;
  let current = 0;

  for (const token of tokens) {
    if (ONES[token] !== undefined) {
      current += ONES[token];
    } else if (SCALES[token] !== undefined) {
      const scale = SCALES[token];
      if (scale >= 1_000) {
        // For hazaar and above: apply to current accumulator, then reset
        result += (current || 1) * scale;
        current = 0;
      } else {
        // For "sau": multiply current (e.g., teen sau = 300)
        current = (current || 1) * scale;
      }
    } else {
      // Try numeric within tokens
      const n = parseInt(token, 10);
      if (!isNaN(n)) current += n;
    }
  }

  const total = result + current;
  return total > 0 ? total : null;
};

// ─────────────────────────────────────────────────────────────────────────────
// parseHindiAmountToPaise — convenience wrapper that returns paise (integer)
// ─────────────────────────────────────────────────────────────────────────────
const parseHindiAmountToPaise = (input) => {
  const rupees = parseHindiAmount(input);
  return rupees !== null ? rupees * 100 : null;
};

// ─────────────────────────────────────────────────────────────────────────────
// parseTimeframe — extract time references from Hinglish
// Returns a standardized timeframe string
// ─────────────────────────────────────────────────────────────────────────────
const parseTimeframe = (text) => {
  if (!text) return null;
  const t = text.toLowerCase();

  if (t.includes('aaj') || t.includes('today')) return 'today';
  if (t.includes('kal') && !t.includes('parso')) return 'yesterday';
  if (t.includes('is hafte') || t.includes('this week') || t.includes('is week')) return 'this_week';
  if (t.includes('pichhle hafte') || t.includes('last week') || t.includes('pichle hafte')) return 'last_week';
  if (t.includes('is mahine') || t.includes('this month') || t.includes('is month')) return 'this_month';
  if (t.includes('pichhle mahine') || t.includes('last month')) return 'last_month';

  return null;
};

module.exports = { parseHindiAmount, parseHindiAmountToPaise, parseTimeframe };