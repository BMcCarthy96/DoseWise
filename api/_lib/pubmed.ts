// PubMed E-utilities client. Free; 3 req/s without a key, 10 req/s with a
// free NCBI API key (set NCBI_API_KEY) — worth having since we query several
// ingredients in parallel per report.

import type { SourceResult } from "./openfda";
export type { SourceResult, SourceStatus } from "./openfda";
import { fetchWithTimeout } from "./http";

const EUTILS_BASE = "https://eutils.ncbi.nlm.nih.gov/entrez/eutils";
const ESEARCH_TIMEOUT_MS = 6000;
const ESUMMARY_TIMEOUT_MS = 6000;
const EFETCH_TIMEOUT_MS = 8000;

export interface PubmedArticle {
  pmid: string;
  title: string;
  year?: number;
  url: string;
  /** e.g. "Randomized Controlled Trial", "Meta-Analysis" — omitted when esummary didn't report one. */
  pubType?: string;
}

const PREFERRED_STUDY_TYPES = ["randomized controlled trial", "meta-analysis", "systematic review"];

function apiKeyParam(): string {
  return process.env.NCBI_API_KEY ? `&api_key=${process.env.NCBI_API_KEY}` : "";
}

export async function searchPubmedForIngredient(ingredient: string, retmax = 5): Promise<SourceResult<PubmedArticle[]>> {
  const term = `"${ingredient}"[tiab] AND (supplement* OR supplementation) AND (adverse OR safety OR efficacy OR randomized) AND humans[filter]`;
  // sort=relevance so "top results" is actually true — esearch defaults to
  // most-recent-PMID order, which is not the same thing and made the
  // CITEABLE SOURCES list's ordering arbitrary.
  const searchUrl = `${EUTILS_BASE}/esearch.fcgi?db=pubmed&term=${encodeURIComponent(term)}&retmax=${retmax}&retmode=json&sort=relevance${apiKeyParam()}`;

  let searchRes: Response;
  try {
    searchRes = await fetchWithTimeout(searchUrl, { timeoutMs: ESEARCH_TIMEOUT_MS });
  } catch {
    return { status: "unreachable", data: [] };
  }
  if (searchRes.status === 429) return { status: "rate_limited", data: [] };
  if (!searchRes.ok) return { status: "unreachable", data: [] };
  const searchData = await searchRes.json().catch(() => null);
  const ids: string[] = searchData?.esearchresult?.idlist;
  if (!Array.isArray(ids)) return { status: "malformed", data: [] };
  if (ids.length === 0) return { status: "ok", data: [] };

  const summaryUrl = `${EUTILS_BASE}/esummary.fcgi?db=pubmed&id=${ids.join(",")}&retmode=json${apiKeyParam()}`;
  let summaryRes: Response;
  try {
    summaryRes = await fetchWithTimeout(summaryUrl, { timeoutMs: ESUMMARY_TIMEOUT_MS });
  } catch {
    return { status: "unreachable", data: [] };
  }
  if (!summaryRes.ok) return { status: "unreachable", data: [] };
  const summaryData = await summaryRes.json().catch(() => null);
  if (!summaryData?.result) return { status: "malformed", data: [] };

  const articles = ids
    .filter((id) => summaryData.result[id]) // a partial esummary must not synthesize "Untitled" rows for ids it didn't actually return
    .map((id) => {
      const item = summaryData.result[id];
      const year = item?.pubdate ? parseInt(String(item.pubdate).slice(0, 4), 10) : undefined;
      const pubTypes: string[] = Array.isArray(item?.pubtype) ? item.pubtype : [];
      const preferred = pubTypes.find((t) => PREFERRED_STUDY_TYPES.includes(t.toLowerCase()));
      return {
        pmid: id,
        title: item?.title || "Untitled",
        year: Number.isFinite(year) ? year : undefined,
        url: `https://pubmed.ncbi.nlm.nih.gov/${id}/`,
        pubType: preferred ?? pubTypes[0] ?? undefined,
      };
    })
    // Stronger evidence types float to the top of what the model sees, without
    // hard-excluding everything else the way a query-level [pt] filter would.
    .sort((a, b) => {
      const aPref = a.pubType && PREFERRED_STUDY_TYPES.includes(a.pubType.toLowerCase()) ? 1 : 0;
      const bPref = b.pubType && PREFERRED_STUDY_TYPES.includes(b.pubType.toLowerCase()) ? 1 : 0;
      return bPref - aPref;
    });
  return { status: "ok", data: articles };
}

export interface PubmedAbstract {
  pmid: string;
  text: string;
}

// Per-PMID abstract fetch (one small request per id, capped by the caller to
// a handful) rather than one concatenated blob — the old version fetched all
// requested PMIDs in a single efetch call and truncated the combined text to
// 1500 characters with no way to tell which words came from which study, so
// the prompt (and the model) had no real attribution for what it was reading.
export async function fetchAbstracts(pmids: string[]): Promise<PubmedAbstract[]> {
  if (pmids.length === 0) return [];
  const results = await Promise.all(
    pmids.map(async (pmid): Promise<PubmedAbstract | null> => {
      const url = `${EUTILS_BASE}/efetch.fcgi?db=pubmed&id=${pmid}&rettype=abstract&retmode=text${apiKeyParam()}`;
      try {
        const res = await fetchWithTimeout(url, { timeoutMs: EFETCH_TIMEOUT_MS });
        if (!res.ok) return null;
        const text = (await res.text()).trim();
        return text ? { pmid, text: text.slice(0, 800) } : null;
      } catch {
        return null;
      }
    }),
  );
  return results.filter((r): r is PubmedAbstract => r != null);
}
