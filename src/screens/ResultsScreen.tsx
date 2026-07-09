import React, { useEffect, useState } from "react";
import { View, Text, StyleSheet, TouchableOpacity, SafeAreaView, ScrollView, ActivityIndicator } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useNavigation, useRoute } from "@react-navigation/native";
import { C, F } from "../theme";
import { resolveProduct, getReport, getReviews, ResolvedProduct } from "../services/api";
import type { TrustReport, ReviewConsensus } from "../types";
import VerdictHero from "../components/VerdictHero";
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

  useEffect(() => {
    let cancelled = false;

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

        if (resolved.cached && resolved.report) {
          setReport(resolved.report);
          setReviews(resolved.report.reviews);
          setStage("done");
          return;
        }

        setStage("analyzing");
        const { productKey } = resolved;
        const resolvedProduct = resolved.product;

        getReport({ productKey, product: resolvedProduct, label: resolved.label })
          .then((r) => { if (!cancelled) { setReport(r); setStage("done"); } })
          .catch((e) => { if (!cancelled) { setStage("error"); setErrorMsg(e.message); } });

        setReviewsLoading(true);
        getReviews({ productKey, brand: resolvedProduct.brand, name: resolvedProduct.name })
          .then((r) => { if (!cancelled) { setReviews(r.reviews); setReviewsLoading(false); } })
          .catch((e) => { if (!cancelled) { setReviewsLoading(false); setReviewsError(e.message); } });
      } catch (e: any) {
        if (!cancelled) { setStage("error"); setErrorMsg(e.message ?? "Something went wrong."); }
      }
    }

    run();
    return () => { cancelled = true; };
  }, [upc, base64]);

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
            <Text style={s.messageTitle}>Couldn't find that barcode</Text>
            <Text style={s.messageBody}>
              This product isn't in the databases we check. Try photographing the Supplement Facts label instead.
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
                  />
                )}
                {segment === "warnings" && (
                  <WarningList
                    flags={report.labelTrust.flags}
                    recalls={report.warnings.recalls}
                    adverseEventSummary={report.warnings.adverseEventSummary}
                    researchConsensus={report.warnings.researchConsensus}
                  />
                )}
                {segment === "reviews" && (
                  <ReviewsPanel reviews={reviews} loading={reviewsLoading} error={reviewsError} />
                )}
              </View>
            )}
          </>
        )}
      </ScrollView>
    </SafeAreaView>
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
});
