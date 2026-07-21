import type { TrustReport } from "../types";

// Both native and web call our own Vercel API routes rather than embedding an
// Anthropic key in the client bundle — EXPO_PUBLIC_API_BASE points native
// builds at the deployed URL; web defaults to same-origin "/api/*".
const API_BASE = process.env.EXPO_PUBLIC_API_BASE ?? "";

async function post<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (res.status === 429) throw new Error("Rate limit reached — please try again in a minute.");
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error ?? "Request failed — please try again.");
  }
  return res.json() as Promise<T>;
}

export interface ResolvedProduct {
  source: "dsld" | "off" | "vision";
  dsldId?: number;
  upc?: string;
  brand: string;
  name: string;
  servingSize?: string;
  offMarket?: boolean;
}

export interface ResolveResult {
  productKey: string;
  status?: "unknown";
  cached?: boolean;
  report?: TrustReport;
  product?: ResolvedProduct;
  label?: unknown;
}

export function resolveProduct(input: { upc?: string; base64?: string }): Promise<ResolveResult> {
  return post<ResolveResult>("/api/resolve", input);
}

export function getReport(body: { productKey: string; product: ResolvedProduct; label?: unknown }): Promise<TrustReport> {
  return post<TrustReport>("/api/report", body);
}

export function getReviews(body: {
  productKey: string;
  brand: string;
  name: string;
}): Promise<{ productKey: string; reviews: TrustReport["reviews"] }> {
  return post("/api/reviews", body);
}

// Permanently deletes the signed-in user's account. The user's own access token
// authorizes the deletion server-side; the anon key can't do this itself.
export async function deleteAccount(accessToken: string): Promise<void> {
  const res = await fetch(`${API_BASE}/api/delete-account`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error ?? "Could not delete your account — please try again.");
  }
}
