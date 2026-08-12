import React, { useEffect, useState } from "react";
import { View, Text, StyleSheet, TouchableOpacity, SafeAreaView, ScrollView, ActivityIndicator } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useNavigation, useRoute } from "@react-navigation/native";
import { C, F } from "../theme";
import { resolveProduct, getReport, getReviews, getAlternatives, ResolvedProduct } from "../services/api";
import { recordScan } from "../services/history";
import type { TrustReport, ReviewConsensus, Alternative } from "../types";
import VerdictHero from "../components/VerdictHero";
import WhyThisGrade from "../components/WhyThisGrade";
import AlternativesPanel from "../components/AlternativesPanel";
import { getScoreFactors } from "../utils/scoreFactors";
import { reportIssues } from "../utils/issues";
import BreakdownChart from "../components/BreakdownChart";
import WarningList from "../components/WarningList";
import ReviewsPanel from "../components/ReviewsPanel";

type Segment = "breakdown" | "warnings" | "reviews";
type Stage = "resolving" | "analyzing" | "done" | "unknown" | "error";

const STAGE_LABEL: Record<Stage, string> = {
  resolving: "Identifying product…",
  analyzing: "Checking FDA records & research…",
  done: "",
  unknown: "",
  error: "",
};

export default function ResultsScreen() {
  const navigation = useNavigation<any>();
  const route = useRoute<any>();
  const { upc, base64 } = route.params ?? {};

  const [stage, setStage] = useState<Stage>("resolving");
  const [product, setProduct] = useState<ResolvedProduct | null>(null);
  const [report, setReport] = useState<TrustReport | null>(null);
  const [reviews, setReviews] = useState<ReviewConsensus | null>(null);
  const [reviewsLoading, setReviewsLoading] = useState(false);
  const [reviewsError, setReviewsError] = useState<string | undefined>();
  const [errorMsg, setErrorMsg] = useState<string | undefined>();
  const [segment, setSegment] = useState<Segment | null>(null);
  const [alternatives, setAlternatives] = useState<Alternative[] | null>(null);
  const [altLoading, setAltLoading] = useState(false);
  const [altError, setAltError] = useState<string | undefined>();
  // Kept around purely so the "Re-check" button can replay the same
  // productKey/product/label/token against /api/report with refresh:true —
  // none of this is otherwise needed once the report has loaded.
  const [resolveInfo, setResolveInfo] = useState<{ productKey: string; product: ResolvedProduct; label: unknown; token?: string } | null>(null);
  const [rechecking, setRechecking] = useState(false);

  useEffect(() => {
    let cancelled = false;

    // Only worth looking for alternatives when this label actually has a
    // problem another product could improve on.
    function loadAlternatives(r: TrustReport, p: ResolvedProduct) {
      const issues = reportIssues(r);
      if (issues.length === 0) return;
      setAltLoading(true);
      getAlternatives({ product: { brand: p.brand, name: p.name, dsldId: p.dsldId }, issues })
        .then((res) => {
          if (cancelled) return;
          setAlternatives(res.alternatives);
          setAltLoading(false);
        })
        .catch((e) => {
          if (cancelled) return;
          setAltLoading(false);
          setAltError(e.message);
        });
    }

    async function run() {
      setStage("resolving");
      try {
        const resolved = await resolveProduct({ upc, base64 });
        if (cancelled) return;

        if (resolved.status === "unknown" || !resolved.product) {
          setStage("unknown");
          return;
        }

        setProduct(resolved.product);
        setResolveInfo({ productKey: resolved.productKey, product: resolved.product, label: resolved.label, token: resolved.token });

        if (resolved.cached && resolved.report) {
          setReport(resolved.report);
          setReviews(resolved.report.reviews);
          setStage("done");
          recordScan(resolved.report, resolved.productKey).catch(() => {});
          loadAlternatives(resolved.report, resolved.product);
          return;
        }

        setStage("analyzing");
        // `token` is passed straight back untouched — it is the server's proof
        // that this product and label came out of /api/resolve rather than being
        // made up by whoever called the API.
        const { productKey, token } = resolved;
        const resolvedProduct = resolved.product;

        getReport({ productKey, product: resolvedProduct, label: resolved.label, token })
          .then((r) => {
            if (cancelled) return;
            setReport(r);
            setStage("done");
            recordScan(r, productKey).catch(() => {});
            loadAlternatives(r, resolvedProduct);
          })
          .catch((e) => { if (!cancelled) { setStage("error"); setErrorMsg(e.message); } });

        setReviewsLoading(true);
        getReviews({
          productKey,
          brand: resolvedProduct.brand,
          name: resolvedProduct.name,
          product: resolvedProduct,
          label: resolved.label,
          token,
        })
          .then((r) => { if (!cancelled) { setReviews(r.reviews); setReviewsLoading(false); } })
          .catch((e) => { if (!cancelled) { setReviewsLoading(false); setReviewsError(e.message); } });
      } catch (e: any) {
        if (!cancelled) { setStage("error"); setErrorMsg(e.message ?? "Something went wrong."); }
      }
    }

    run();
    return () => { cancelled = true; };
  }, [upc, base64]);

  async function handleRecheck() {
    if (!resolveInfo || rechecking) return;
    setRechecking(true);
    try {
      const r = await getReport({ ...resolveInfo, refresh: true });
      setReport(r);
      recordScan(r, resolveInfo.productKey).catch(() => {});
    } catch {
      // Best-effort — the existing (stale-but-real) report stays on screen.
    } finally {
      setRechecking(false);
    }
  }

  return (
    <SafeAreaView style={s.container}>
      <View style={s.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={s.closeBtn}>
          <Ionicons name="close" size={22} color={C.text} />
        </TouchableOpacity>
      </View>

      <ScrollView contentContainerStyle={s.scrollContent}>
        {(stage === "resolving" || stage === "analyzing") && (
          <View style={s.loadingCard}>
            <ActivityIndicator color={C.primary} size="large" />
            <Text style={s.loadingLabel}>{STAGE_LABEL[stage]}</Text>
            {product && <Text style={s.loadingProduct}>{product.brand} — {product.name}</Text>}
          </View>
        )}

        {stage === "unknown" && (
          <View style={s.messageCard}>
            <Ionicons name="help-circle-outline" size={40} color={C.muted} />
            <Text style={s.messageTitle}>{base64 ? "Couldn't identify that product" : "Couldn't find that barcode"}</Text>
            <Text style={s.messageBody}>
              {base64
                ? "We couldn't make out a brand and product name from that photo. Try a clearer, well-lit shot of the front label or the Supplement Facts panel."
                : "This product isn't in the databases we check. Try photographing the front label or Supplement Facts panel instead."}
            </Text>
            <TouchableOpacity style={s.retryBtn} onPress={() => navigation.navigate("LabelPhoto")}>
              <Text style={s.retryLabel}>Photo the label</Text>
            </TouchableOpacity>
          </View>
        )}

        {stage === "error" && (
          <View style={s.messageCard}>
            <Ionicons name="warning-outline" size={40} color={C.bad} />
            <Text style={s.messageTitle}>Something went wrong</Text>
            <Text style={s.messageBody}>{errorMsg ?? "Please try again."}</Text>
            <TouchableOpacity style={s.retryBtn} onPress={() => navigation.goBack()}>
              <Text style={s.retryLabel}>Go back</Text>
            </TouchableOpacity>
          </View>
        )}

        {stage === "done" && report && (
          <>
            <VerdictHero
              grade={report.verdict.grade}
              score={report.verdict.score}
              headline={report.verdict.headline}
              summary={report.verdict.summary}
              confidence={report.verdict.confidence}
            />

            <WhyThisGrade factors={getScoreFactors(report)} />

            <StalenessBanner report={report} rechecking={rechecking} onRecheck={resolveInfo ? handleRecheck : undefined} />

            {(report.verdict.confidence === "low" ||
              report.labelTrust.flags.some((f) => f.type === "data_gap")) && (
              <View style={s.limitedBanner}>
                <Ionicons name="information-circle" size={20} color={C.caution} />
                <Text style={s.limitedText}>
                  <Text style={s.limitedBold}>Limited data available. </Text>
                  We couldn't find enough verified information to fully assess this product, so treat this as a
                  starting point — not a definitive answer.
                </Text>
              </View>
            )}

            <View style={s.segments}>
              <SegmentButton icon="pie-chart-outline" label="Breakdown" active={segment === "breakdown"} onPress={() => setSegment(segment === "breakdown" ? null : "breakdown")} />
              <SegmentButton icon="warning-outline" label="Warnings" active={segment === "warnings"} onPress={() => setSegment(segment === "warnings" ? null : "warnings")} />
              <SegmentButton icon="chatbubbles-outline" label="Reviews" active={segment === "reviews"} onPress={() => setSegment(segment === "reviews" ? null : "reviews")} />
            </View>

            {segment && (
              <View style={s.detailCard}>
                {segment === "breakdown" && (
                  <BreakdownChart
                    ingredients={report.breakdown.ingredients}
                    proprietaryBlends={report.breakdown.proprietaryBlends}
                    otherIngredients={report.breakdown.otherIngredients}
                    matchedBy={report.product.matchedBy}
                  />
                )}
                {segment === "warnings" && (
                  <WarningList
                    flags={report.labelTrust.flags}
                    recalls={report.warnings.recalls}
                    adverseEventSummary={report.warnings.adverseEventSummary}
                    researchConsensus={report.warnings.researchConsensus}
                    openfdaStatus={report.meta.sources?.openfda}
                  />
                )}
                {segment === "reviews" && (
                  <ReviewsPanel reviews={reviews} loading={reviewsLoading} error={reviewsError} />
                )}
              </View>
            )}

            <AlternativesPanel
              alternatives={alternatives}
              loading={altLoading}
              error={altError}
              onScan={(nextUpc) => navigation.replace("Results", { upc: nextUpc })}
            />

            <SourcesFooter report={report} />
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

// 7 days matches the cache's own TTL (api/_lib/cache.ts) — a report can't be
// served stale for longer than that, so there's no point offering a re-check
// before then.
const STALE_AFTER_MS = 7 * 24 * 60 * 60 * 1000;

function StalenessBanner({
  report,
  rechecking,
  onRecheck,
}: {
  report: TrustReport;
  rechecking: boolean;
  onRecheck?: () => void;
}) {
  if (!report.meta.cached) return null;
  const generatedAt = new Date(report.generatedAt).getTime();
  if (!Number.isFinite(generatedAt)) return null;
  const ageMs = Date.now() - generatedAt;
  const days = Math.floor(ageMs / (24 * 60 * 60 * 1000));
  if (ageMs < STALE_AFTER_MS) return null;

  return (
    <View style={s.staleBanner}>
      <Ionicons name="time-outline" size={18} color={C.muted} />
      <Text style={s.staleText}>
        Checked {days} day{days === 1 ? "" : "s"} ago.
      </Text>
      {onRecheck && (
        <TouchableOpacity onPress={onRecheck} disabled={rechecking} style={s.staleBtn}>
          {rechecking ? <ActivityIndicator size="small" color={C.primary} /> : <Text style={s.staleBtnText}>Re-check</Text>}
        </TouchableOpacity>
      )}
    </View>
  );
}

// Derives what to actually claim about each source from the report's own
// data rather than listing every source unconditionally — the old version
// always said "PubMed / NIH" and "openFDA" even when zero citations came back
// or the search never ran, which reads as authority the report didn't earn.
function SourcesFooter({ report }: { report: TrustReport }) {
  const sources: string[] = [];
  const matchedByNote: Partial<Record<NonNullable<TrustReport["product"]["matchedBy"]>, string>> = {
    upc: "verified by barcode",
    name: "verified by matching label details",
    photo: "from a label photo, not verified against a product database",
  };
  if (report.product.source === "dsld") {
    sources.push(`NIH Dietary Supplement Label Database (product & ingredient facts${report.product.matchedBy ? `, ${matchedByNote[report.product.matchedBy]}` : ""})`);
  }
  if (report.product.source === "off") sources.push("Open Food Facts (product identification)");
  if (report.product.source === "vision") sources.push("Label photo read by AI (unverified against a product database)");

  const citationCount = report.breakdown.ingredients.reduce((sum, i) => sum + (i.citations?.length ?? 0), 0);
  const pubmedStatus = report.meta.sources?.pubmed;
  sources.push(
    pubmedStatus && pubmedStatus !== "ok"
      ? "PubMed — unreachable for this report"
      : citationCount > 0
        ? `PubMed — ${citationCount} citation${citationCount === 1 ? "" : "s"} retrieved`
        : "PubMed — searched, no matching studies found",
  );

  const openfdaStatus = report.meta.sources?.openfda;
  sources.push(
    openfdaStatus && openfdaStatus !== "ok"
      ? "openFDA — unreachable for this report"
      : "openFDA (recalls & adverse-event reports)",
  );
  if (report.reviews) sources.push("Web search (third-party certifications & public reviews)");

  return (
    <View style={s.footer}>
      <Text style={s.footerTitle}>Where this comes from</Text>
      {sources.map((src) => (
        <View key={src} style={s.footerRow}>
          <Ionicons name="checkmark" size={13} color={C.primary} style={{ marginTop: 2 }} />
          <Text style={s.footerSource}>{src}</Text>
        </View>
      ))}
      <Text style={s.footerDisclaimer}>
        DoseWise reports only what it can verify from these sources and won't guess when data is missing. This is
        informational only — not medical advice. Talk to a healthcare provider before starting or stopping any supplement.
      </Text>
      <Text style={s.footerMeta}>
        Generated {new Date(report.generatedAt).toLocaleDateString()} · {report.meta.model}
      </Text>
    </View>
  );
}

function SegmentButton({
  icon,
  label,
  active,
  onPress,
}: {
  icon: React.ComponentProps<typeof Ionicons>["name"];
  label: string;
  active: boolean;
  onPress: () => void;
}) {
  return (
    <TouchableOpacity style={[s.segmentBtn, active && s.segmentBtnActive]} onPress={onPress}>
      <Ionicons name={icon} size={18} color={active ? "#fff" : C.text} />
      <Text style={[s.segmentLabel, active && s.segmentLabelActive]}>{label}</Text>
    </TouchableOpacity>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: C.bg },
  header: { flexDirection: "row", justifyContent: "flex-end", paddingHorizontal: 16, paddingTop: 8 },
  closeBtn: { padding: 6 },
  scrollContent: { paddingHorizontal: 20, paddingBottom: 32 },
  loadingCard: { alignItems: "center", justifyContent: "center", gap: 10, paddingVertical: 60 },
  loadingLabel: { fontFamily: F.bold, fontSize: 15, color: C.text },
  loadingProduct: { fontFamily: F.semibold, fontSize: 13, color: C.muted },
  messageCard: { alignItems: "center", justifyContent: "center", gap: 8, paddingVertical: 60, paddingHorizontal: 20 },
  messageTitle: { fontFamily: F.extrabold, fontSize: 17, color: C.text, marginTop: 6 },
  messageBody: { fontFamily: F.semibold, fontSize: 13, color: C.muted, textAlign: "center", lineHeight: 19 },
  retryBtn: { marginTop: 8, backgroundColor: C.primary, borderRadius: 14, paddingHorizontal: 20, paddingVertical: 12 },
  retryLabel: { fontFamily: F.bold, fontSize: 14, color: "#fff" },
  limitedBanner: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 10,
    backgroundColor: `${C.caution}14`,
    borderColor: `${C.caution}44`,
    borderWidth: 1,
    borderRadius: 14,
    padding: 14,
    marginTop: 14,
  },
  limitedText: { flex: 1, fontFamily: F.semibold, fontSize: 12.5, color: C.text, lineHeight: 18 },
  limitedBold: { fontFamily: F.extrabold, color: C.caution },
  staleBanner: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    backgroundColor: C.fill,
    borderRadius: 14,
    padding: 12,
    marginTop: 12,
  },
  staleText: { flex: 1, fontFamily: F.semibold, fontSize: 12.5, color: C.muted },
  staleBtn: { backgroundColor: C.primary, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 7, minWidth: 72, alignItems: "center" },
  staleBtnText: { fontFamily: F.bold, fontSize: 12, color: "#fff" },
  segments: { flexDirection: "row", gap: 10, marginTop: 20 },
  segmentBtn: {
    flex: 1,
    flexDirection: "row",
    gap: 6,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: C.card,
    borderWidth: 1,
    borderColor: C.border,
    borderRadius: 14,
    paddingVertical: 12,
  },
  segmentBtnActive: { backgroundColor: C.primary, borderColor: C.primary },
  segmentLabel: { fontFamily: F.bold, fontSize: 13, color: C.text },
  segmentLabelActive: { color: "#fff" },
  detailCard: {
    marginTop: 16,
    backgroundColor: C.card,
    borderWidth: 1,
    borderColor: C.border,
    borderRadius: 18,
    padding: 18,
  },
  footer: { marginTop: 24, gap: 6 },
  footerTitle: { fontFamily: F.extrabold, fontSize: 12, color: C.text, textTransform: "uppercase", letterSpacing: 0.4 },
  footerRow: { flexDirection: "row", alignItems: "flex-start", gap: 6 },
  footerSource: { flex: 1, fontFamily: F.semibold, fontSize: 12, color: C.muted, lineHeight: 17 },
  footerDisclaimer: { fontFamily: F.semibold, fontSize: 11, color: C.muted, lineHeight: 16, marginTop: 8 },
  footerMeta: { fontFamily: F.semibold, fontSize: 10, color: C.muted, marginTop: 6 },
});
