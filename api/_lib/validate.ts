import type { VercelRequest, VercelResponse } from "@vercel/node";

// Every string in these request bodies comes from an untrusted client, and most
// of them end up interpolated into a Claude prompt — where length converts
// directly into billed input tokens. Vercel accepts bodies up to ~4.5 MB, which
// at Sonnet 4.6's $3/M input rate is a couple of dollars of input *per request*
// if it reaches the model unbounded, and the rate limiter allows 10 requests a
// minute. api/resolve.ts already capped `upc` and the label photo; these helpers
// apply the same discipline to every other field on every other route.
//
// The caps are also the second half of the prompt-injection defence: a bounded,
// control-character-free, fence-safe string can't smuggle prompt structure past
// the <untrusted-*> blocks that the prompt builders wrap it in.

export const LIMITS = {
  /** Brand and product names — long enough for real label text, short enough to be free. */
  name: 200,
  /** A serving-size line, e.g. "2 softgels (1.4 g)". */
  servingSize: 120,
  /** One ingredient name. */
  ingredientName: 120,
  /** The unstructured Open Food Facts ingredient string — the longest legitimate field. */
  ingredientsText: 4_000,
  /** One entry in proprietaryBlends / otherIngredients / claims. */
  listItem: 200,
  /** How many entries survive in each of those lists. */
  listItems: 40,
  /** Structured ingredients accepted (only the first MAX_INGREDIENTS_RESEARCHED are researched). */
  ingredients: 40,
  /** A cache key: a UPC digit string or a 40-char sha1 hex digest. */
  productKey: 128,
  /** Free text the model returns and the UI renders — headlines, notes, flag details. */
  modelText: 600,
  /** The model's longer prose fields (verdict summary, research consensus). */
  modelParagraph: 1_200,
} as const;

/** JSON bodies for the text routes. Nothing legitimate comes close to this. */
export const MAX_JSON_BODY_BYTES = 64 * 1024;
/** api/resolve.ts also carries a base64 label photo, so it needs its own ceiling. */
export const MAX_PHOTO_BODY_BYTES = 8 * 1024 * 1024;

// Characters replaced with a space before a value is allowed near a prompt.
// None of them appear in a real supplement label, and each is a way to fake
// structure the reader can't see: C0 controls forge line breaks inside a fenced
// block, and the zero-width/bidi set can hide or visually reorder an injected
// instruction. Expressed as code points so this file stays free of the very
// characters it filters.
function isStrippedCodePoint(code: number): boolean {
  return (
    code <= 0x08 || // C0 controls up to backspace (includes NUL)
    code === 0x0b || code === 0x0c || // vertical tab, form feed
    (code >= 0x0e && code <= 0x1f) || // remaining C0 controls
    code === 0x7f || // DEL
    (code >= 0x200b && code <= 0x200f) || // zero-width spaces + LTR/RTL marks
    code === 0x2028 || code === 0x2029 || // line / paragraph separators
    (code >= 0x202a && code <= 0x202e) || // bidi embedding + override
    code === 0xfeff // BOM / zero-width no-break space
  );
}

function stripInvisibles(value: string): string {
  let out = "";
  for (const ch of value) out += isStrippedCodePoint(ch.codePointAt(0) ?? 0) ? " " : ch;
  return out;
}

// Defangs the fence markers used by the prompt builders so a value can never
// close its own <untrusted-*> block early and have the remainder read as
// instructions.
const FENCE_MARKERS = /<\/?untrusted[a-z-]*>/gi;

/**
 * Coerces an untrusted value into a bounded, prompt-safe string, or `undefined`
 * if it isn't a usable string. The cap is a hard truncation — callers never see
 * more than `max` characters no matter what was sent.
 */
export function boundedString(value: unknown, max: number): string | undefined {
  if (typeof value !== "string") return undefined;
  const cleaned = stripInvisibles(value).replace(FENCE_MARKERS, "").replace(/\s+/g, " ").trim();
  if (!cleaned) return undefined;
  return cleaned.length > max ? `${cleaned.slice(0, max)}…` : cleaned;
}

/** Same bounding applied element-wise, with a cap on how many elements survive. */
export function boundedStringArray(value: unknown, maxItems: number, maxLen: number): string[] {
  if (!Array.isArray(value)) return [];
  const out: string[] = [];
  for (const item of value) {
    const s = boundedString(item, maxLen);
    if (s) out.push(s);
    if (out.length >= maxItems) break;
  }
  return out;
}

/**
 * Finite numbers inside a plausible range only. Anything else — NaN, Infinity,
 * a numeric string, a dose of 1e308 — becomes `undefined` so it renders as
 * "unknown" rather than reaching the prompt or the dose-safety comparison.
 */
export function boundedNumber(value: unknown, min: number, max: number): number | undefined {
  if (typeof value !== "number" || !Number.isFinite(value)) return undefined;
  if (value < min || value > max) return undefined;
  return value;
}

/**
 * Rejects oversized bodies before anything else runs. This is an early-out, not
 * the real guarantee — `content-length` is client-supplied and can be omitted —
 * so every route still bounds each field individually after parsing. What this
 * buys is not spending CPU parsing a multi-megabyte body we would only discard.
 */
export function rejectOversizedBody(req: VercelRequest, res: VercelResponse, maxBytes: number): boolean {
  const header = req.headers["content-length"];
  const declared = typeof header === "string" ? Number.parseInt(header, 10) : NaN;
  if (Number.isFinite(declared) && declared > maxBytes) {
    res.status(413).json({ error: "Request too large." });
    return true;
  }
  return false;
}

/**
 * Bounds the free text the model itself produced, before it is cached and
 * rendered. The citation and review sanitizers already drop invented PMIDs and
 * unsourced certifications; this covers the remaining free-form fields, where
 * the risk is a prompt-injected label convincing the model to emit a wall of
 * text (or invisible characters) that then gets served to every later scanner.
 */
export function boundedModelText(value: unknown, max: number = LIMITS.modelText): string {
  return boundedString(value, max) ?? "";
}
