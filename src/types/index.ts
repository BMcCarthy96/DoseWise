// ── Core trust-report domain model ──────────────────────────────────────────

export type Verdict = "good" | "caution" | "bad";
export type Confidence = "low" | "medium" | "high";
export type EvidenceGrade = "A" | "B" | "C" | "D" | "insufficient";
export type DoseAssessment = "below_effective" | "effective" | "above_UL" | "unknown";
// Explains an "unknown" doseAssessment. Additive/optional so old cached
// reports (which never set it) keep rendering — see DOSE_META in
// BreakdownChart.tsx, which falls back to today's generic copy when absent.
export type DoseAssessmentReason =
  | "no_dose_given"
  | "unknown_nutrient"
  | "unknown_basis"
  | "iu_form_unknown"
  | "ambiguous_salt_weight"
  | "blend_component";
export type ProductMatchMethod = "upc" | "name" | "photo";
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
export type ScoreImpact = "positive" | "negative" | "neutral";

// A single plain-language reason the product scored the way it did. Positive
// factors lifted the score, negative ones lowered it, and neutral ones are
// limits (missing data, thin evidence) that capped how confidently it can score.
export interface ScoreFactor {
  impact: ScoreImpact;
  text: string;
}

// One line of the deterministic scoring rubric's own arithmetic (see
// src/utils/score.ts) — the score and its justification are the same
// computation, so they can't contradict each other the way a model-invented
// score and a model-invented explanation once could.
export interface ScoreBreakdownLine {
  label: string;
  points: number;
}

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
  doseAssessmentReason?: DoseAssessmentReason;
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
  /** True number of distinct reports (not reaction mentions — see reactionMentions). */
  reportCount: number;
  /** Sum of the top reaction buckets; a report naming 3 reactions counts 3 times here. */
  reactionMentions: number;
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

// Label problems DoseWise can compare deterministically between products.
export type IssueCode = "dose_above_UL" | "proprietary_blend" | "risky_ingredient" | "missing_doses";

// A real NIH DSLD product suggested as a better-labelled option. Deliberately
// has NO DoseWise score — we haven't run the full report pipeline on it, and
// showing an invented number would break the app's accuracy promise.
export interface Alternative {
  dsldId: number;
  upc?: string;
  brand: string;
  name: string;
  fixes: string[];
  caveats: string[];
}

export interface TrustReport {
  reportVersion: number;
  generatedAt: string;
  product: {
    source: "dsld" | "off" | "vision";
    dsldId?: number;
    upc?: string;
    brand: string;
    name: string;
    servingSize?: string;
    offMarket?: boolean;
    matchedBy?: ProductMatchMethod;
  };
  verdict: {
    grade: Verdict;
    score: number; // 0-100
    confidence: Confidence;
    headline: string;
    summary: string;
    scoreFactors?: ScoreFactor[]; // "why this grade" — optional; derived client-side when absent
    scoreBreakdown?: ScoreBreakdownLine[]; // the deterministic rubric's own arithmetic — see src/utils/score.ts
    scoreVersion?: number;
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
    /** Per-source health this report was generated with — "ok" with empty data means "searched, found nothing"; anything else means "couldn't check", never "clean". */
    sources?: { openfda: SourceStatus; pubmed: SourceStatus };
  };
}

export type SourceStatus = "ok" | "unreachable" | "rate_limited" | "malformed";

// Shared verbatim between api/report.ts (which writes it) and
// BreakdownChart.tsx (which checks for it) to tell "outside the research
// budget" apart from "researched, but nothing was found" — both currently
// render as evidenceGrade "insufficient" with no citations.
export const NOT_RESEARCHED_NOTE = "Not individually researched for this report.";

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
