// Open Food Facts client — fallback product identification when a UPC isn't
// in the NIH DSLD. Supplement coverage is patchy, so this only ever feeds
// brand/name (and raw ingredients text) into the Claude synthesis step; it
// never supplies %DV breakdown data the way DSLD does.

export interface OffProduct {
  brand: string;
  name: string;
  ingredientsText?: string;
}

export async function getOffProductByUpc(upcDigits: string): Promise<OffProduct | null> {
  const clean = upcDigits.replace(/\D/g, "");
  if (!clean) return null;

  const res = await fetch(`https://world.openfoodfacts.org/api/v2/product/${clean}.json`);
  if (!res.ok) return null;
  const data = await res.json();
  if (data?.status !== 1 || !data.product) return null;

  const p = data.product;
  const name = p.product_name || p.generic_name;
  if (!name) return null;

  return {
    brand: p.brands || "Unknown brand",
    name,
    ingredientsText: p.ingredients_text || undefined,
  };
}
