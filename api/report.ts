import type { VercelRequest, VercelResponse } from "@vercel/node";
import Anthropic from "@anthropic-ai/sdk";
import { checkRateLimit, clientIp } from "./_lib/ratelimit";
import { searchPubmedForIngredient, fetchAbstractsText } from "./_lib/pubmed";
import { searchFdaRecalls, getFdaAdverseEventSummary } from "./_lib/openfda";
import { checkDoseAssessment, flagRiskyIngredient, extractJsonObject } from "./_lib/trustReport";
import { getCachedReport, setCachedReport } from "./_lib/cache";
import type { TrustReport, Citation } from "../src/types";

interface ReportIngredient {
  name: string;
  amount?: number;
  unit?: string;
  dvPercent?: number;
  category?: string;
  isBlendComponent?: boolean;
}

interface ReportRequestBody {
  productKey: string;
  product: {
    source: "dsld" | "off" | "vision";
    dsldId?: number;
    upc?: string;
    brand: string;
    name: string;
    servingSize?: string;
    offMarket?: boolean;
  };
  label?: {
    ingredients?: ReportIngredient[];
    proprietaryBlends?: string[];
    otherIngredients?: string[];
    claims?: string[];
    ingredientsText?: string;
  };
}

const MAX_INGREDIENTS_RESEARCHED = 6;

async function gatherIngredientEvidence(ingredient: ReportIngredient) {
  const articles = await searchPubmedForIngredient(ingredient.name).catch(() => []);
  const abstractsText = await fetchAbstractsText(articles.slice(0, 3).map((a) => a.pmid)).catch(() => "");
  const riskyNote = flagRiskyIngredient(ingredient.name);
  const doseAssessment = ingredient.isBlendComponent ? "unknown" : checkDoseAssessment(ingredient.dvPercent);
  return { ingredient, articles, abstractsText, riskyNote, doseAssessment };
}

interface AllowedCitation {
  pmid: string;
  title: string;
  year?: number;
}

function pubmedUrl(pmid: string): string {
  return `https://pubmed.ncbi.nlm.nih.gov/${pmid}/`;
}

// The only PMIDs the model is ever allowed to cite are the ones we actually
// fetched from PubMed. This map is the ground truth used to (a) tell the model
// exactly what it may cite and (b) scrub anything it returns afterward.
function buildCitationWhitelist(
  evidence: Awaited<ReturnType<typeof gatherIngredientEvidence>>[],
): Map<string, AllowedCitation> {
  const map = new Map<string, AllowedCitation>();
  for (const { articles } of evidence) {
    for (const a of articles) {
      const pmid = a.pmid ? String(a.pmid).replace(/\D/g, "") : "";
      if (pmid) map.set(pmid, { pmid, title: a.title, year: a.year });
    }
  }
  return map;
}

// Anti-fabrication guardrail: replace every citation the model returned with a
// verified one drawn only from the articles we actually fetched. Any PMID the
// model invented (not in the whitelist) is dropped, and the title/year/URL are
// rebuilt from our own fetched metadata so a citation's text can never be
// hallucinated. This is the core of "only factual sources, never made up".
function sanitizeReportCitations(report: TrustReport, whitelist: Map<string, AllowedCitation>): void {
  for (const ing of report.breakdown?.ingredients ?? []) {
    const cleaned: Citation[] = [];
    const seen = new Set<string>();
    for (const c of ing.citations ?? []) {
      const pmid = c?.pmid != null ? String(c.pmid).replace(/\D/g, "") : "";
      if (!pmid || seen.has(pmid)) continue;
      const verified = whitelist.get(pmid);
      if (!verified) continue; // model invented this PMID — drop it
      seen.add(pmid);
      cleaned.push({ pmid, title: verified.title, year: verified.year, url: pubmedUrl(pmid) });
    }
    ing.citations = cleaned;
  }
}

function buildSynthesisPrompt(
  body: ReportRequestBody,
  evidence: Awaited<ReturnType<typeof gatherIngredientEvidence>>[],
  recalls: Awaited<ReturnType<typeof searchFdaRecalls>>,
  adverseEvents: Awaited<ReturnType<typeof getFdaAdverseEventSummary>>,
): string {
  const ingredientBlock = evidence
    .map(({ ingredient, articles, abstractsText, riskyNote, doseAssessment }) => {
      const doseLine = ingredient.isBlendComponent
        ? "Dose hidden inside a proprietary blend — not individually disclosed."
        : `${ingredient.amount ?? "?"} ${ingredient.unit ?? ""} (${ingredient.dvPercent != null ? `${ingredient.dvPercent}% DV` : "no %DV given"}), heuristic dose assessment: ${doseAssessment}.`;
      const riskyLine = riskyNote ? `KNOWN RISK FLAG: ${riskyNote}` : "";
      const articlesLine = articles.length > 0
        ? `CITEABLE SOURCES (use ONLY these PMIDs in "citations" for this ingredient — do not invent any others):\n${articles.map((a) => `- PMID ${a.pmid} — ${a.title} (${a.year ?? "n.d."})`).join("\n")}`
        : `No citeable PubMed sources were found for this ingredient. You MUST use an empty "citations" array for it, and set evidenceGrade to "insufficient" unless a KNOWN RISK FLAG above applies.`;
      return `### ${ingredient.name}\n${doseLine}\n${riskyLine}\n${articlesLine}\n${abstractsText ? `Abstract excerpts:\n${abstractsText.slice(0, 1500)}` : ""}`;
    })
    .join("\n\n");

  const recallsBlock = recalls.length > 0
    ? recalls.map((r) => `- [${r.date}] (${r.classification}) ${r.reason}`).join("\n")
    : "No openFDA enforcement (recall) records found for this brand.";

  const aeBlock = adverseEvents
    ? `${adverseEvents.reportCount} adverse event reports filed in openFDA CAERS mentioning this brand. Most common reported reactions: ${adverseEvents.topReactions.join(", ")}. Remember these are unverified, self-reported, and do not establish causation.`
    : "No openFDA CAERS adverse event records found for this brand.";

  return `You are DoseWise's supplement trust-report engine. Analyze the following supplement and produce ONLY a single JSON object matching this exact TypeScript type (no markdown fences, no commentary):

type TrustReport = {
  reportVersion: 1;
  generatedAt: string; // ISO timestamp
  product: { source: "dsld"|"off"|"vision"; dsldId?: number; upc?: string; brand: string; name: string; servingSize?: string; offMarket?: boolean };
  verdict: { grade: "good"|"caution"|"bad"; score: number; confidence: "low"|"medium"|"high"; headline: string; summary: string };
  breakdown: {
    ingredients: Array<{ name: string; amount?: number; unit?: string; dvPercent?: number; category: "vitamin"|"mineral"|"botanical"|"amino_acid"|"blend"|"other"; evidenceGrade: "A"|"B"|"C"|"D"|"insufficient"; doseAssessment: "below_effective"|"effective"|"above_UL"|"unknown"; note: string; citations: Array<{ pmid?: string; title: string; year?: number; url: string }> }>;
    proprietaryBlends: string[];
    otherIngredients: string[];
  };
  labelTrust: { flags: Array<{ type: "proprietary_blend"|"dose_above_UL"|"banned_or_risky_ingredient"|"unsupported_claim"|"brand_violation"|"off_market"|"data_gap"; severity: "info"|"warn"|"danger"; detail: string }> };
  warnings: { recalls: Array<{ date: string; reason: string; classification: string; status: string; source: "openFDA_enforcement" }>; adverseEventSummary: { reportCount: number; topReactions: string[]; source: "openFDA_CAERS" } | null; researchConsensus: string };
  reviews: null;
  meta: { model: string; cached: false; searchesUsed: number };
};

Guidance (ACCURACY IS THE TOP PRIORITY — never invent data; it is always better to say "not enough data" than to guess):
- "headline" must be a short, plain-language, human verdict a non-expert can read in one glance (e.g. "Generally safe at this dose" or "Contains a flagged stimulant — use caution"), matching "grade".
- Each ingredient's "note" must be 1-2 plain-language sentences written for someone with NO science background: say what the ingredient does in the body and whether this dose looks appropriate. Avoid jargon.
- CITATIONS: populate each ingredient's "citations" array ONLY with PMIDs explicitly listed as CITEABLE SOURCES for that ingredient below. Never invent, guess, or reuse a PMID, title, year, or URL. If no citeable source is listed for an ingredient, its "citations" MUST be an empty array. Citing nothing is strongly preferred over citing anything uncertain.
- "evidenceGrade" must be based strictly on the citeable sources provided. Use "insufficient" honestly whenever evidence is thin or absent — never inflate a grade to look authoritative.
- HONESTY ON THIN DATA: if there is little or no structured ingredient data, or no research evidence at all, set verdict.confidence to "low", state that plainly in verdict.summary, and add a { type: "data_gap", severity: "info", detail: "..." } flag. Do not present a confident-looking verdict when the underlying data is thin.
- Never state adverse-event counts as proof of causation — describe them as unverified, self-reported reports.
- If the product is off-market or discontinued, still generate normally but include an "off_market" flag with severity "info".
- Set meta.searchesUsed to 0 (this call did not use the web-search tool).

PRODUCT
Brand: ${body.product.brand}
Name: ${body.product.name}
Serving size: ${body.product.servingSize ?? "unknown"}
Source: ${body.product.source}
Off-market: ${body.product.offMarket ?? false}
Proprietary blends on label: ${(body.label?.proprietaryBlends ?? []).join(", ") || "none"}
Other/inactive ingredients: ${(body.label?.otherIngredients ?? []).join(", ") || "none listed"}
${body.label?.ingredientsText ? `Raw ingredients text (no structured dose data available): ${body.label.ingredientsText}` : ""}

INGREDIENT EVIDENCE
${ingredientBlock || "No structured active-ingredient list was available for this product."}

FDA ENFORCEMENT (RECALLS)
${recallsBlock}

FDA CAERS (ADVERSE EVENTS)
${aeBlock}

Return ONLY the JSON object.`;
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

  const body: ReportRequestBody = req.body ?? {};
  if (!body.productKey || !body.product) {
    res.status(400).json({ error: "Missing productKey or product." });
    return;
  }

  const cached = await getCachedReport(body.productKey);
  if (cached) {
    res.status(200).json({ ...cached, meta: { ...cached.meta, cached: true } });
    return;
  }

  try {
    const activeIngredients = (body.label?.ingredients ?? [])
      .filter((i) => !!i.name)
      .slice(0, MAX_INGREDIENTS_RESEARCHED);

    const [evidence, recalls, adverseEvents] = await Promise.all([
      Promise.all(activeIngredients.map(gatherIngredientEvidence)),
      searchFdaRecalls(`product_description:"${body.product.brand}"`).catch(() => []),
      getFdaAdverseEventSummary(body.product.brand).catch(() => null),
    ]);

    const prompt = buildSynthesisPrompt(body, evidence, recalls, adverseEvents);

    const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
    const response = await client.messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: 4096,
      system: [{
        type: "text",
        text: "You are a precise, evidence-grounded supplement safety analyst. You always return exactly one valid JSON object and nothing else.",
        cache_control: { type: "ephemeral" },
      }],
      messages: [{ role: "user", content: prompt }],
    });

    const textBlock = response.content.find((b) => b.type === "text");
    if (!textBlock || textBlock.type !== "text") throw new Error("No response from AI");
    const report = extractJsonObject(textBlock.text) as TrustReport;

    report.reportVersion = 1;
    report.generatedAt = new Date().toISOString();
    report.reviews = null;
    report.meta = { model: "claude-sonnet-4-6", cached: false, searchesUsed: 0 };

    // Strip any citation the model invented; keep only verified PubMed sources.
    sanitizeReportCitations(report, buildCitationWhitelist(evidence));

    await setCachedReport(body.productKey, report);
    res.status(200).json(report);
  } catch {
    res.status(502).json({ error: "Analysis failed — please try again." });
  }
}
