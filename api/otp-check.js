// POST /api/otp-check  { phone, code, leadId? }
// Checks the code with Twilio Verify. On success, marks the lead as phone-verified server-side
// (so a visitor cannot forge "verified" from the browser) and forwards the update to the CRM.
import { client, VERIFY_SID, toE164, rateLimit, ip, cors, readJson } from "./_lib.js";
import { forwardLead, toCrmPayload } from "./lead.js";

export default async function handler(req, res) {
  if (cors(req, res)) return;
  if (req.method !== "POST") return res.status(405).json({ ok: false, error: "method" });

  const { phone, code, leadId } = readJson(req);
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

  if (valid) {
    // Server-stamped verification: this is the field your buyers / CRM should trust.
    await forwardLead(toCrmPayload({
      leadId: leadId || "",
      phone: to.slice(2),
      stage: "verified",
      phoneVerified: true,
      verifiedTs: new Date().toISOString(),
      ip: ip(req),
    })).catch(() => {});
  }

  return res.status(200).json({ ok: true, valid });
}
