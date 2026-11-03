// POST /api/otp-check  { phone, code, lead }
// Checks the code with Twilio Verify. On success AND only if the profile is qualified, forwards the
// full lead (all funnel answers) to the CRM webhook with phoneVerified:true stamped server-side.
// A visitor cannot trigger the webhook without a code approved by Twilio.
import { client, VERIFY_SID, toE164, rateLimit, ip, cors, readJson } from "./_lib.js";
import { forwardLead, toCrmPayload } from "./lead.js";

export default async function handler(req, res) {
  if (cors(req, res)) return;
  if (req.method !== "POST") return res.status(405).json({ ok: false, error: "method" });

  const { phone, code, lead = {} } = readJson(req);
  const to = toE164(phone);
  if (!to || !/^\d{4,8}$/.test(String(code || ""))) return res.status(400).json({ ok: true, valid: false });

  if (!rateLimit("check:" + to, 10, 10 * 60 * 1000)) return res.status(429).json({ ok: false, error: "too_many_requests" });

  let valid = false;
  try {
    const r = await client().verify.v2.services(VERIFY_SID()).verificationChecks.create({ to, code: String(code) });
    valid = r.status === "approved";
  } catch (e) {
    // 20404 = no pending verification (expired or already used) -> treat as invalid
    console.error("otp-check", e.code, e.message);
    valid = false;
  }

  if (valid && lead.unqualified !== true) {
    const payload = toCrmPayload({
      ...lead,
      phone: to.slice(2),
      stage: "verified",
      phoneVerified: true,
      verifiedTs: new Date().toISOString(),
      ip: ip(req),
      userAgent: req.headers["user-agent"] || "",
    });
    try { await forwardLead(payload); console.log("[crm] sent", payload.lead_id, payload.lead_tier); }
    catch (e) { console.error("[crm] failed", e.message); }
  }

  return res.status(200).json({ ok: true, valid });
}
