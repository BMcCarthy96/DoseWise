// PubMed E-utilities client. Free; 3 req/s without a key, 10 req/s with a
// free NCBI API key (set NCBI_API_KEY) — worth having since we query several
// ingredients in parallel per report.

const EUTILS_BASE = "https://eutils.ncbi.nlm.nih.gov/entrez/eutils";

export interface PubmedArticle {
  pmid: string;
  title: string;
  year?: number;
  url: string;
}

function apiKeyParam(): string {
  return process.env.NCBI_API_KEY ? `&api_key=${process.env.NCBI_API_KEY}` : "";
}

export async function searchPubmedForIngredient(ingredient: string, retmax = 5): Promise<PubmedArticle[]> {
  const term = `"${ingredient}"[tiab] AND (supplement* OR supplementation) AND (adverse OR safety OR efficacy OR randomized) AND humans[filter]`;
  const searchUrl = `${EUTILS_BASE}/esearch.fcgi?db=pubmed&term=${encodeURIComponent(term)}&retmax=${retmax}&retmode=json${apiKeyParam()}`;

  const searchRes = await fetch(searchUrl);
  if (!searchRes.ok) return [];
  const searchData = await searchRes.json();
  const ids: string[] = searchData?.esearchresult?.idlist ?? [];
  if (ids.length === 0) return [];

  const summaryUrl = `${EUTILS_BASE}/esummary.fcgi?db=pubmed&id=${ids.join(",")}&retmode=json${apiKeyParam()}`;
  const summaryRes = await fetch(summaryUrl);
  if (!summaryRes.ok) return [];
  const summaryData = await summaryRes.json();

  return ids.map((id) => {
    const item = summaryData?.result?.[id];
    const year = item?.pubdate ? parseInt(String(item.pubdate).slice(0, 4), 10) : undefined;
    return {
      pmid: id,
      title: item?.title ?? "Untitled",
      year: Number.isFinite(year) ? year : undefined,
      url: `https://pubmed.ncbi.nlm.nih.gov/${id}/`,
    };
  });
}

// Best-effort plain-text abstract fetch for the top few PMIDs of an
// ingredient's search results, used as supporting context for the Claude
// synthesis call — not intended for exact per-PMID display.
export async function fetchAbstractsText(pmids: string[]): Promise<string> {
  if (pmids.length === 0) return "";
  const url = `${EUTILS_BASE}/efetch.fcgi?db=pubmed&id=${pmids.join(",")}&rettype=abstract&retmode=text${apiKeyParam()}`;
  const res = await fetch(url);
  if (!res.ok) return "";
  const text = await res.text();
  return text.slice(0, 6000);
}
