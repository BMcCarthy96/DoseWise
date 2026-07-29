import type { VercelRequest, VercelResponse } from "@vercel/node";
import { checkRateLimit, clientIp } from "./_lib/ratelimit";
import { findAlternatives, isIssueCode, type IssueCode } from "./_lib/alternatives";

interface AlternativesRequestBody {
  product?: { brand?: string; name?: string; dsldId?: number };
  issues?: unknown;
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

  const body: AlternativesRequestBody = req.body ?? {};
  const brand = body.product?.brand?.trim();
  const name = body.product?.name?.trim();
  if (!name) {
    res.status(400).json({ error: "Missing product name." });
    return;
  }

  // Only issue codes we actually know how to compare on; anything else is dropped.
  const issues = new Set<IssueCode>(
    (Array.isArray(body.issues) ? body.issues : []).filter(isIssueCode),
  );

  try {
    const alternatives = await findAlternatives(
      { brand: brand ?? "", name, dsldId: body.product?.dsldId },
      issues,
    );
    res.status(200).json({ alternatives });
  } catch {
    res.status(502).json({ error: "Could not look up alternatives right now — please try again." });
  }
}
