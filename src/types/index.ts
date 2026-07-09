// ── Core trust-report domain model ──────────────────────────────────────────

export type Verdict = "good" | "caution" | "bad";
export type Confidence = "low" | "medium" | "high";
export type EvidenceGrade = "A" | "B" | "C" | "D" | "insufficient";
export type DoseAssessment = "below_effective" | "effective" | "above_UL" | "unknown";
export type IngredientCategory = "vitamin" | "mineral" | "botanical" | "amino_acid" | "blend" | "other";
export type FlagType =
  | "proprietary_blend"
  | "dose_above_UL"
  | "banned_or_risky_ingredient"
  | "unsupported_claim"
  | "brand_violation"
  | "off_market"
  | "data_gap";
export type FlagSeverity = "info" | "warn" | "danger";
export type ReviewSentiment = "positive" | "mixed" | "negative";

export interface Citation {
  pmid?: string;
  title: string;
  year?: number;
  url: string;
}

export interface IngredientEvidence {
  name: string;
  amount?: number;
  unit?: string;
  dvPercent?: number; // null/undefined when a proprietary blend hides the dose
  category: IngredientCategory;
  evidenceGrade: EvidenceGrade;
  doseAssessment: DoseAssessment;
  note: string;
  citations: Citation[];
}

export interface LabelTrustFlag {
  type: FlagType;
  severity: FlagSeverity;
  detail: string;
}

export interface Recall {
  date: string;
  reason: string;
  classification: string;
  status: string;
  source: "openFDA_enforcement";
}

export interface AdverseEventSummary {
  reportCount: number;
  topReactions: string[];
  source: "openFDA_CAERS";
}

export interface ThirdPartyCertification {
  org: "USP" | "NSF" | "Labdoor" | "other";
  status: string;
  url?: string;
}

export interface ReviewConsensus {
  thirdParty: ThirdPartyCertification[];
  consensus: {
    sentiment: ReviewSentiment;
    summary: string;
    sources: Array<{ title: string; url: string }>;
  };
}

export interface TrustReport {
  reportVersion: 1;
  generatedAt: string;
  product: {
    source: "dsld" | "off" | "vision";
    dsldId?: number;
    upc?: string;
    brand: string;
    name: string;
    servingSize?: string;
    offMarket?: boolean;
  };
  verdict: {
    grade: Verdict;
    score: number; // 0-100
    confidence: Confidence;
    headline: string;
    summary: string;
  };
  breakdown: {
    ingredients: IngredientEvidence[];
    proprietaryBlends: string[];
    otherIngredients: string[];
  };
  labelTrust: {
    flags: LabelTrustFlag[];
  };
  warnings: {
    recalls: Recall[];
    adverseEventSummary: AdverseEventSummary | null;
    researchConsensus: string;
  };
  reviews: ReviewConsensus | null; // null until the reviews stage resolves
  meta: {
    model: string;
    cached: boolean;
    searchesUsed: number;
  };
}

export interface ScanRecord {
  id: string;
  productKey: string;
  scannedAt: number;
  brand: string;
  productName: string;
  verdict: Verdict;
  score: number;
  report?: TrustReport; // present for local scans; remote history rows re-fetch via the cached productKey instead
}

// ── Navigation ───────────────────────────────────────────────────────────────

export type RootStackParamList = {
  MainTabs: undefined;
  Results: { upc?: string; base64?: string };
  Auth: undefined;
};

export type TabParamList = {
  Scan: undefined;
  History: undefined;
  Settings: undefined;
  LabelPhoto: undefined;
};
