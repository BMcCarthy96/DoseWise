import type { VercelRequest, VercelResponse } from "@vercel/node";
import Anthropic from "@anthropic-ai/sdk";
import { checkRateLimit, clientIp } from "./_lib/ratelimit";
import { getCachedReport, setCachedReport } from "./_lib/cache";
import { extractJsonObject } from "./_lib/trustReport";
import type { ReviewConsensus } from "../src/types";

interface ReviewsRequestBody {
  productKey: string;
  brand: string;
  name: string;
}

const isRealUrl = (u: unknown): u is string => typeof u === "string" && /^https?:\/\/\S+$/.test(u);

// Anti-fabrication guardrail for web-search output: only surface a third-party
// certification or a review source if it is backed by a real URL the user can
// click and verify. An unsourced "USP Verified" claim gets dropped rather than
// shown, because a false certification is more harmful than showing nothing.
function sanitizeReviews(reviews: ReviewConsensus): ReviewConsensus {
  return {
    thirdParty: (reviews.thirdParty ?? []).filter((t) => isRealUrl(t.url)),
    consensus: {
      sentiment: reviews.consensus?.sentiment ?? "mixed",
      summary: typeof reviews.consensus?.summary === "string" ? reviews.consensus.summary : "",
      sources: (reviews.consensus?.sources ?? []).filter((sc) => isRealUrl(sc.url)),
    },
  };
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") {
    res.status(405).json({ error: "Method not allowed" });
    return;
  }

  const rl = checkRateLimit(clientIp(req));
  if (!rl.ok) {
    res.setHeader("Retry-After", String(rl.retryAfter));
    res.status(429).json({ error: "Rate limit reached — please try again in a minute." });
    return;
  }

  const body: ReviewsRequestBody = req.body ?? {};
  if (!body.productKey || !body.brand || !body.name) {
    res.status(400).json({ error: "Missing productKey, brand, or name." });
    return;
  }

  const cached = await getCachedReport(body.productKey);
  if (cached?.reviews) {
    res.status(200).json({ productKey: body.productKey, reviews: cached.reviews });
    return;
  }

  const prompt = `Research the supplement "${body.name}" by "${body.brand}" using web search. Accuracy is critical: a false certification claim is worse than reporting nothing. Find:
1. Third-party testing/certification status: is it USP Verified, NSF Certified, NSF Certified for Sport, or graded by Labdoor? ONLY report a certification if you can confirm it from an authoritative source (ideally the certifier's own listing, e.g. quality-supplements.org, nsf.org, labdoor.com) AND include that source URL. If you cannot find and link a source confirming it, do NOT include an entry claiming it — absence of proof is not proof.
2. Any FDA warning letters, tainted-product alerts, or health-fraud mentions for this brand or product (include the source URL).
3. The general public review consensus (Amazon, Reddit, forums, review sites) — overall sentiment and a short summary of common praise/complaints, each backed by a real source URL.

Return ONLY a single JSON object matching this exact type, no markdown fences, no commentary:
{
  "thirdParty": [{ "org": "USP" | "NSF" | "Labdoor" | "other", "status": "string describing exactly what the source confirms", "url": "REQUIRED — the source URL confirming this" }],
  "consensus": { "sentiment": "positive" | "mixed" | "negative", "summary": "2-3 sentence summary", "sources": [{ "title": "string", "url": "REQUIRED real URL" }] }
}
Rules: every "thirdParty" entry MUST have a real "url" or it must be omitted. Every "consensus.sources" entry MUST have a real "url". If you find nothing credible for a section, use an empty array rather than guessing. Never fabricate a URL. Return ONLY the JSON object.`;

  try {
    const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
    const response = await client.messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: 2048,
      tools: [{ type: "web_search_20260209", name: "web_search", max_uses: 5 } as any],
      messages: [{ role: "user", content: prompt }],
    });

    const textBlock = [...response.content].reverse().find((b) => b.type === "text");
    if (!textBlock || textBlock.type !== "text") throw new Error("No response from AI");
    const reviews = sanitizeReviews(extractJsonObject(textBlock.text) as ReviewConsensus);

    const existing = await getCachedReport(body.productKey);
    if (existing) {
      existing.reviews = reviews;
      existing.meta.searchesUsed = (existing.meta.searchesUsed ?? 0) + 5;
      await setCachedReport(body.productKey, existing);
    }

    res.status(200).json({ productKey: body.productKey, reviews });
  } catch {
    res.status(502).json({ error: "Could not gather reviews right now — please try again." });
  }
}
