// NIH ODS Dietary Supplement Label Database (DSLD) v9 client.
// https://api.ods.od.nih.gov/dsld/v9/ — free, keyless.
//
// Critical gotcha (confirmed by live testing): UPCs are indexed in spaced
// UPC-A human-readable form, e.g. "0 74312 02100 8" (1-5-5-1 grouping). A
// query with the raw 12-digit string returns zero hits, so we always try the
// spaced form first.

const DSLD_BASE = "https://api.ods.od.nih.gov/dsld/v9";

export interface DsldIngredient {
  name: string;
  category?: string;
  quantity?: number;
  unit?: string;
  dvPercent?: number;
  isBlendComponent: boolean;
}

export interface DsldLabel {
  dsldId: number;
  upc?: string;
  brand: string;
  name: string;
  servingSize?: string;
  offMarket: boolean;
  claims: string[];
  ingredients: DsldIngredient[];
  proprietaryBlends: string[];
  otherIngredients: string[];
}

function toUpcA(digits: string): string | null {
  const clean = digits.replace(/\D/g, "");
  if (clean.length === 12) return clean;
  if (clean.length === 13 && clean.startsWith("0")) return clean.slice(1);
  return null; // UPC-E (8-digit) and other formats aren't handled here — falls through to Open Food Facts / photo path
}

function toSpacedUpcA(upcA: string): string {
  return `${upcA[0]} ${upcA.slice(1, 6)} ${upcA.slice(6, 11)} ${upcA.slice(11, 12)}`;
}

async function searchFilterFirstId(query: string): Promise<string | null> {
  const url = `${DSLD_BASE}/search-filter?q=${encodeURIComponent(query)}`;
  const res = await fetch(url);
  if (!res.ok) return null;
  const data = await res.json();
  const hit = data?.hits?.[0];
  return hit?._id ?? null;
}

// search-filter does relevance-scored full-text search, not exact matching —
// a garbage UPC still returns "closest" hits instead of nothing. We only
// trust a hit once we've fetched its label and confirmed upcSku actually
// matches the digits we searched for, so this returns the label directly
// rather than an unverified id.
export async function findDsldLabelByUpc(upcDigits: string): Promise<DsldLabel | null> {
  const upcA = toUpcA(upcDigits);
  if (!upcA) return null;
  const spaced = toSpacedUpcA(upcA);
  const candidateId = (await searchFilterFirstId(`"${spaced}"`)) ?? (await searchFilterFirstId(`"${upcA}"`));
  if (!candidateId) return null;

  const label = await getDsldLabel(candidateId);
  if (!label?.upc) return null;
  const labelUpcDigits = label.upc.replace(/\D/g, "");
  return labelUpcDigits === upcA ? label : null;
}

export async function findDsldIdByName(name: string): Promise<string | null> {
  const url = `${DSLD_BASE}/browse-products?q=${encodeURIComponent(name)}`;
  const res = await fetch(url);
  if (!res.ok) return null;
  const data = await res.json();
  const hit = data?.hits?.[0];
  return hit?._id ?? null;
}

export async function getDsldLabel(id: string | number): Promise<DsldLabel | null> {
  const res = await fetch(`${DSLD_BASE}/label/${id}`);
  if (!res.ok) return null;
  const raw = await res.json();
  return normalizeDsldLabel(raw);
}

function normalizeDsldLabel(raw: any): DsldLabel {
  const ingredients: DsldIngredient[] = [];
  const proprietaryBlends: string[] = [];

  for (const row of raw.ingredientRows ?? []) {
    const q = row.quantity?.[0];
    const hasOwnDose = q?.quantity != null;
    const nested = row.nestedRows ?? [];

    if (!hasOwnDose && nested.length > 0) {
      // A blend: the parent row names the blend, nested rows are its components
      // without individually disclosed doses.
      proprietaryBlends.push(row.name);
      for (const sub of nested) {
        ingredients.push({
          name: sub.name,
          category: sub.category,
          isBlendComponent: true,
        });
      }
      continue;
    }

    ingredients.push({
      name: row.name,
      category: row.category,
      quantity: q?.quantity,
      unit: q?.unit,
      dvPercent: q?.dailyValueTargetGroup?.[0]?.percent,
      isBlendComponent: false,
    });
  }

  const servingSizes = raw.servingSizes?.[0];
  const servingSize = servingSizes
    ? `${servingSizes.minQuantity ?? servingSizes.maxQuantity ?? 1} ${servingSizes.unit ?? ""}`.trim()
    : undefined;

  return {
    dsldId: raw.id,
    upc: raw.upcSku || undefined,
    brand: raw.brandName ?? "Unknown brand",
    name: raw.fullName ?? "Unknown product",
    servingSize,
    offMarket: Boolean(raw.offMarket),
    claims: (raw.claims ?? []).map((c: any) => c.langualCodeDescription).filter(Boolean),
    ingredients,
    proprietaryBlends,
    otherIngredients: (raw.otheringredients?.ingredients ?? []).map((i: any) => i.name),
  };
}
