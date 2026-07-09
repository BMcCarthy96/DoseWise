import type { VercelRequest, VercelResponse } from "@vercel/node";
import { createHash } from "crypto";
import Anthropic from "@anthropic-ai/sdk";
import { checkRateLimit, clientIp } from "./_lib/ratelimit";
import { findDsldLabelByUpc, findDsldIdByName, getDsldLabel, DsldLabel } from "./_lib/dsld";
import { getOffProductByUpc } from "./_lib/off";
import { getCachedReport } from "./_lib/cache";

interface VisionIngredient {
  name: string;
  amount?: number;
  unit?: string;
  dvPercent?: number;
}

interface VisionExtraction {
  brand: string;
  productName: string;
  servingSize?: string;
  ingredients: VisionIngredient[];
  proprietaryBlends?: string[];
}

function productKeyForUpc(upc: string): string {
  return upc.replace(/\D/g, "");
}

function productKeyForBrandName(brand: string, name: string): string {
  return createHash("sha1").update(`${brand.toLowerCase()}|${name.toLowerCase()}`).digest("hex");
}

async function extractLabelFromPhoto(base64: string): Promise<VisionExtraction | null> {
  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  const prompt = `Look at this photo of a dietary supplement's Supplement Facts label and packaging. Return ONLY a JSON object with this exact structure:
{
  "brand": "brand name",
  "productName": "product name",
  "servingSize": "e.g. 1 Tablet(s)",
  "ingredients": [
    { "name": "ingredient name", "amount": number, "unit": "mg | mcg | g | IU", "dvPercent": number }
  ],
  "proprietaryBlends": ["blend name if any ingredients are hidden inside a proprietary/branded blend"]
}
If an amount or %DV isn't legible or the ingredient is inside a proprietary blend, omit that field rather than guessing.
Return ONLY the JSON object, no other text.`;

  const response = await client.messages.create({
    model: "claude-sonnet-4-6",
    max_tokens: 1536,
    messages: [
      {
        role: "user",
        content: [
          { type: "image", source: { type: "base64", media_type: "image/jpeg", data: base64 } },
          { type: "text", text: prompt },
        ],
      },
    ],
  });

  const textBlock = response.content.find((b) => b.type === "text");
  if (!textBlock || textBlock.type !== "text") return null;
  const jsonText = textBlock.text.trim().replace(/^```json\n?/, "").replace(/\n?```$/, "");
  try {
    return JSON.parse(jsonText);
  } catch {
    return null;
  }
}

function dsldLabelToProduct(label: DsldLabel) {
  return {
    productKey: label.upc ? productKeyForUpc(label.upc) : productKeyForBrandName(label.brand, label.name),
    product: {
      source: "dsld" as const,
      dsldId: label.dsldId,
      upc: label.upc,
      brand: label.brand,
      name: label.name,
      servingSize: label.servingSize,
      offMarket: label.offMarket,
    },
    label,
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

  const body = req.body ?? {};
  const upc: string | undefined = typeof body.upc === "string" ? body.upc.slice(0, 20) : undefined;
  const base64: string | undefined = typeof body.base64 === "string" ? body.base64 : undefined;

  if (!upc && !base64) {
    res.status(400).json({ error: "Provide either a upc or a base64 label photo." });
    return;
  }

  try {
    if (upc) {
      const productKey = productKeyForUpc(upc);
      const cached = getCachedReport(productKey);
      if (cached) {
        res.status(200).json({ productKey, cached: true, report: cached });
        return;
      }

      const label = await findDsldLabelByUpc(upc);
      if (label) {
        res.status(200).json(dsldLabelToProduct(label));
        return;
      }

      const offProduct = await getOffProductByUpc(upc);
      if (offProduct) {
        res.status(200).json({
          productKey,
          product: { source: "off" as const, upc, brand: offProduct.brand, name: offProduct.name },
          label: { ingredientsText: offProduct.ingredientsText },
        });
        return;
      }

      res.status(200).json({ productKey, status: "unknown" });
      return;
    }

    // Label photo path
    if (!base64 || base64.length < 100 || base64.length > 6_000_000) {
      res.status(400).json({ error: "Invalid image" });
      return;
    }
    const extraction = await extractLabelFromPhoto(base64);
    if (!extraction) {
      res.status(502).json({ error: "Could not read the label — please retake the photo with better lighting." });
      return;
    }

    const productKey = productKeyForBrandName(extraction.brand, extraction.productName);
    const cached = getCachedReport(productKey);
    if (cached) {
      res.status(200).json({ productKey, cached: true, report: cached });
      return;
    }

    // Best-effort enrichment against DSLD by name (may fail silently — the
    // vision extraction is already a complete, if less precise, label).
    let enriched: DsldLabel | null = null;
    const dsldId = await findDsldIdByName(`${extraction.brand} ${extraction.productName}`);
    if (dsldId) enriched = await getDsldLabel(dsldId);

    if (enriched) {
      res.status(200).json(dsldLabelToProduct(enriched));
      return;
    }

    res.status(200).json({
      productKey,
      product: {
        source: "vision" as const,
        brand: extraction.brand,
        name: extraction.productName,
        servingSize: extraction.servingSize,
      },
      label: {
        brand: extraction.brand,
        name: extraction.productName,
        servingSize: extraction.servingSize,
        ingredients: (extraction.ingredients ?? []).map((i) => ({ ...i, isBlendComponent: false })),
        proprietaryBlends: extraction.proprietaryBlends ?? [],
        otherIngredients: [],
        claims: [],
        offMarket: false,
      },
    });
  } catch {
    res.status(502).json({ error: "Lookup failed — please try again." });
  }
}
