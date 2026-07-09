// openFDA client — food enforcement (recalls) and CAERS (adverse events).
// Free; an optional API key (OPENFDA_API_KEY) raises the daily quota.

export interface FdaRecall {
  date: string;
  reason: string;
  classification: string;
  status: string;
}

export interface FdaAdverseEventSummary {
  reportCount: number;
  topReactions: string[];
}

function apiKeyParam(): string {
  return process.env.OPENFDA_API_KEY ? `&api_key=${process.env.OPENFDA_API_KEY}` : "";
}

function formatDate(yyyymmdd: string | null | undefined): string {
  if (!yyyymmdd || yyyymmdd.length !== 8) return "";
  return `${yyyymmdd.slice(0, 4)}-${yyyymmdd.slice(4, 6)}-${yyyymmdd.slice(6, 8)}`;
}

export async function searchFdaRecalls(query: string, limit = 10): Promise<FdaRecall[]> {
  const url = `https://api.fda.gov/food/enforcement.json?search=${encodeURIComponent(query)}&limit=${limit}${apiKeyParam()}`;
  const res = await fetch(url);
  if (!res.ok) return [];
  const data = await res.json();
  return (data.results ?? []).map((r: any) => ({
    date: formatDate(r.report_date),
    reason: r.reason_for_recall ?? "Not specified",
    classification: r.classification ?? "Unclassified",
    status: r.status ?? "Unknown",
  }));
}

export async function getFdaAdverseEventSummary(brand: string): Promise<FdaAdverseEventSummary | null> {
  const searchQuery = `products.name_brand:"${brand}"`;
  const countUrl = `https://api.fda.gov/food/event.json?search=${encodeURIComponent(searchQuery)}&count=reactions.exact${apiKeyParam()}`;
  const res = await fetch(countUrl);
  if (!res.ok) return null;
  const data = await res.json();
  const results = data.results ?? [];
  if (results.length === 0) return null;

  const reportCount = results.reduce((sum: number, r: any) => sum + (r.count ?? 0), 0);
  const topReactions = results.slice(0, 5).map((r: any) => String(r.term).toLowerCase());
  return { reportCount, topReactions };
}
