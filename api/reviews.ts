import type { VercelRequest, VercelResponse } from "@vercel/node";
import Anthropic from "@anthropic-ai/sdk";
import { checkRateLimit, clientIp } from "./_lib/ratelimit";
import { getCachedReport, setCachedReport } from "./_lib/cache";
import type { ReviewConsensus } from "../src/types";

interface ReviewsRequestBody {
  productKey: string;
  brand: string;
  name: string;
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

  const cached = getCachedReport(body.productKey);
  if (cached?.reviews) {
    res.status(200).json({ productKey: body.productKey, reviews: cached.reviews });
    return;
  }

  const prompt = `Research the supplement "${body.name}" by "${body.brand}" using web search. Find:
1. Third-party testing/certification status: is it USP Verified, NSF Certified, NSF Certified for Sport, or graded by Labdoor? Report what you find, or "not found" if nothing turns up.
2. Any FDA warning letters, tainted-product-alerts, or health-fraud mentions for this brand or product.
3. The general public review consensus (Amazon, Reddit, forums, review sites) — overall sentiment and a short summary of common praise/complaints.

Return ONLY a single JSON object matching this exact type, no markdown fences, no commentary:
{
  "thirdParty": [{ "org": "USP" | "NSF" | "Labdoor" | "other", "status": "string describing what you found", "url": "string, optional" }],
  "consensus": { "sentiment": "positive" | "mixed" | "negative", "summary": "2-3 sentence summary", "sources": [{ "title": "string", "url": "string" }] }
}
If you find nothing credible for a section, use empty arrays rather than guessing. Return ONLY the JSON object.`;

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
    const jsonText = textBlock.text.trim().replace(/^```json\n?/, "").replace(/\n?```$/, "");
    const reviews: ReviewConsensus = JSON.parse(jsonText);

    const existing = getCachedReport(body.productKey);
    if (existing) {
      existing.reviews = reviews;
      existing.meta.searchesUsed = (existing.meta.searchesUsed ?? 0) + 5;
      setCachedReport(body.productKey, existing);
    }

    res.status(200).json({ productKey: body.productKey, reviews });
  } catch {
    res.status(502).json({ error: "Could not gather reviews right now — please try again." });
  }
}
