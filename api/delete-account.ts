import type { VercelRequest, VercelResponse } from "@vercel/node";
import { checkRateLimit, clientIp } from "./_lib/ratelimit";
import { getAdminClient } from "./_lib/supabaseAdmin";

// Permanently deletes the signed-in user's account. Apple guideline 5.1.1(v)
// requires in-app account deletion (not just sign-out). The caller proves who
// they are with their own Supabase access token; the server validates it and
// deletes that exact user. scan_history rows are removed automatically by the
// ON DELETE CASCADE foreign key to auth.users.
export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") {
    res.status(405).json({ error: "Method not allowed" });
    return;
  }

  const rl = checkRateLimit(clientIp(req));
  if (!rl.ok) {
    res.setHeader("Retry-After", String(rl.retryAfter));
    res.status(429).json({ error: "Too many requests — please try again in a minute." });
    return;
  }

  const authHeader = req.headers.authorization ?? "";
  const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7).trim() : "";
  if (!token) {
    res.status(401).json({ error: "Not signed in." });
    return;
  }

  const admin = getAdminClient();
  if (!admin) {
    res.status(503).json({ error: "Account service is not configured." });
    return;
  }

  try {
    // Validate the token and resolve the user it belongs to. We only ever
    // delete the user proven by this token — never an id supplied by the client.
    const { data: userData, error: userErr } = await admin.auth.getUser(token);
    if (userErr || !userData?.user) {
      res.status(401).json({ error: "Your session has expired — sign in again to delete your account." });
      return;
    }

    const { error: delErr } = await admin.auth.admin.deleteUser(userData.user.id);
    if (delErr) {
      res.status(500).json({ error: "Could not delete the account — please try again." });
      return;
    }

    res.status(200).json({ ok: true });
  } catch {
    res.status(500).json({ error: "Could not delete the account — please try again." });
  }
}
