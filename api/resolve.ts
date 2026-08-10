import type { VercelRequest, VercelResponse } from "@vercel/node";
import { createHash } from "crypto";
import Anthropic from "@anthropic-ai/sdk";
import { checkRateLimit, clientIp } from "./_lib/ratelimit";
import { findDsldLabelByUpc, findDsldIdByName, getDsldLabel, DsldLabel } from "./_lib/dsld";
import { getOffProductByUpc } from "./_lib/off";
import { getCachedReport } from "./_lib/cache";
import { extractJsonObject } from "./_lib/trustReport";
import { signResolvePayload, type ResolvePayload } from "./_lib/signing";
import { LIMITS, MAX_PHOTO_BODY_BYTES, boundedNumber, boundedString, boundedStringArray, rejectOversizedBody } from "./_lib/validate";

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

/**
 * Every payload that carries a productKey is signed here, because /api/resolve
 * is the only place a product is ever identified from a trusted source (DSLD,
 * Open Food Facts, or our own vision extraction). /api/report will not write
 * anything to the shared cache without a matching signature — see
 * api/_lib/signing.ts for why that matters.
 */
function signed<T extends ResolvePayload>(payload: T): T & { token?: string } {
  return { ...payload, token: signResolvePayload(payload) };
}

// The client encodes whatever the camera or picker produced, which on web is
// often a PNG. Declaring everything as image/jpeg meant a mislabelled image
// reached the API and came back as an error the user saw as the unhelpful
// "could not read the label", so the type is read from the payload's own magic
// bytes instead of assumed. These four are exactly what the Anthropic API
// accepts — anything else (HEIC, for instance) is rejected here with a message
// that says what to do, rather than failing opaquely one call later.
const MAGIC_BYTES: Array<[string, "image/jpeg" | "image/png" | "image/gif" | "image/webp"]> = [
  ["/9j/", "image/jpeg"],
  ["iVBORw0KGgo", "image/png"],
  ["R0lGOD", "image/gif"],
  ["UklGR", "image/webp"],
];

function detectMediaType(base64: string): "image/jpeg" | "image/png" | "image/gif" | "image/webp" | null {
  for (const [prefix, type] of MAGIC_BYTES) {
    if (base64.startsWith(prefix)) return type;
  }
  return null;
}

async function extractLabelFromPhoto(base64: string, mediaType: NonNullable<ReturnType<typeof detectMediaType>>): Promise<VisionExtraction | null> {
  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  const prompt = `Look at this photo of a dietary supplement. It might show the full Supplement Facts panel, or it might just be the front of the bottle/box with the brand and product name — both are useful. Return ONLY a JSON object with this exact structure:
{
  "brand": "brand name",
  "productName": "product name",
  "servingSize": "e.g. 1 Tablet(s)",
  "ingredients": [
    { "name": "ingredient name", "amount": number, "unit": "mg | mcg | g | IU", "dvPercent": number }
  ],
  "proprietaryBlends": ["blend name if any ingredients are hidden inside a proprietary/branded blend"]
}
Getting "brand" and "productName" right matters most — we can look up the full ingredient list separately once the product is identified. If the photo only shows the front of the package with no visible Supplement Facts panel, that's fine: fill in brand/productName from what's printed on the front and return an empty "ingredients" array rather than guessing at contents you can't see.
If an amount or %DV isn't legible or the ingredient is inside a proprietary blend, omit that field rather than guessing.
If you cannot make out any brand name or product name at all (e.g. the photo is blank, blurry, or shows only a barcode with no readable text), return {"brand": "", "productName": "", "ingredients": []}.
Return ONLY the JSON object, no other text.`;

  const response = await client.messages.create({
    model: "claude-sonnet-4-6",
    max_tokens: 1536,
    messages: [
      {
        role: "user",
        content: [
          { type: "image", source: { type: "base64", media_type: mediaType, data: base64 } },
          { type: "text", text: prompt },
        ],
      },
    ],
  });

  const textBlock = response.content.find((b) => b.type === "text");
  if (!textBlock || textBlock.type !== "text") return null;
  try {
    return extractJsonObject(textBlock.text) as VisionExtraction;
  } catch {
    return null;
  }
}

function dsldLabelToProduct(label: DsldLabel) {
  return signed({
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
  });
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") {
    res.status(405).json({ error: "Method not allowed" });
    return;
  }

  if (rejectOversizedBody(req, res, MAX_PHOTO_BODY_BYTES)) return;

  const rl = await checkRateLimit(clientIp(req));
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
      const cached = await getCachedReport(productKey);
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
        res.status(200).json(signed({
          productKey,
          product: { source: "off" as const, upc, brand: offProduct.brand, name: offProduct.name },
          label: { ingredientsText: offProduct.ingredientsText },
        }));
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
    const mediaType = detectMediaType(base64);
    if (!mediaType) {
      res.status(400).json({ error: "Unsupported image format — please use a JPEG, PNG, GIF, or WebP photo." });
      return;
    }
    const extraction = await extractLabelFromPhoto(base64, mediaType);
    if (!extraction) {
      res.status(502).json({ error: "Could not read the label — please retake the photo with better lighting." });
      return;
    }
    // The extraction is model output derived from a stranger's photo, so it is
    // bounded here rather than downstream: whatever comes out of this is what
    // gets signed, cached, and interpolated into the synthesis prompt.
    const brand = boundedString(extraction.brand, LIMITS.name) ?? "";
    const productName = boundedString(extraction.productName, LIMITS.name) ?? "";
    if (!brand && !productName) {
      res.status(200).json({ productKey: `unidentified-${Date.now()}`, status: "unknown" });
      return;
    }
    const servingSize = boundedString(extraction.servingSize, LIMITS.servingSize);
    const ingredients = (Array.isArray(extraction.ingredients) ? extraction.ingredients : [])
      .slice(0, LIMITS.ingredients)
      .map((i) => ({
        name: boundedString(i?.name, LIMITS.ingredientName) ?? "",
        amount: boundedNumber(i?.amount, 0, 10_000_000),
        unit: boundedString(i?.unit, 16),
        dvPercent: boundedNumber(i?.dvPercent, 0, 1_000_000),
        isBlendComponent: false,
      }))
      .filter((i) => i.name);
    const proprietaryBlends = boundedStringArray(extraction.proprietaryBlends, LIMITS.listItems, LIMITS.listItem);

    const productKey = productKeyForBrandName(brand, productName);
    const cached = await getCachedReport(productKey);
    if (cached) {
      res.status(200).json({ productKey, cached: true, report: cached });
      return;
    }

    // Best-effort enrichment against DSLD by name (may fail silently — the
    // vision extraction is already a complete, if less precise, label).
    let enriched: DsldLabel | null = null;
    const dsldId = await findDsldIdByName(`${brand} ${productName}`);
    if (dsldId) enriched = await getDsldLabel(dsldId);

    if (enriched) {
      res.status(200).json(dsldLabelToProduct(enriched));
      return;
    }

    res.status(200).json(signed({
      productKey,
      product: {
        source: "vision" as const,
        brand,
        name: productName,
        servingSize,
      },
      label: {
        brand,
        name: productName,
        servingSize,
        ingredients,
        proprietaryBlends,
        otherIngredients: [],
        claims: [],
        offMarket: false,
      },
    }));
  } catch {
    res.status(502).json({ error: "Lookup failed — please try again." });
  }
}
