// POST /api/otp-send  { phone }
// Sends a 6-digit SMS code through Twilio Verify. Returns { ok:true } or { ok:false, error }.
import { client, VERIFY_SID, toE164, rateLimit, ip, cors, readJson } from "./_lib.js";

export default async function handler(req, res) {
  if (cors(req, res)) return;
  if (req.method !== "POST") return res.status(405).json({ ok: false, error: "method" });

  const { phone } = readJson(req);
  const to = toE164(phone);
  if (!to) return res.status(400).json({ ok: false, error: "bad_phone" });

  // 5 sends per 10 min per IP, 3 per number
  if (!rateLimit("send:ip:" + ip(req), 5, 10 * 60 * 1000) || !rateLimit("send:num:" + to, 3, 10 * 60 * 1000)) {
    return res.status(429).json({ ok: false, error: "too_many_requests" });
  }

  try {
    // Optional: Lookup line type to skip landlines/VOIP before spending an SMS (set TWILIO_LOOKUP=1 to enable, ~$0.008/call)
    if (process.env.TWILIO_LOOKUP === "1") {
      const info = await client().lookups.v2.phoneNumbers(to).fetch({ fields: "line_type_intelligence" });
      const type = info.lineTypeIntelligence?.type;
      if (type && !["mobile", "personal", "nonFixedVoip"].includes(type)) {
        return res.status(400).json({ ok: false, error: "not_mobile", lineType: type });
      }
    }

    await client().verify.v2.services(VERIFY_SID()).verifications.create({ to, channel: "sms" });
    return res.status(200).json({ ok: true });
  } catch (e) {
    console.error("otp-send", e.code, e.message);
    // 60203: max send attempts reached; 60200: invalid parameter; 20404: service not found
    return res.status(500).json({ ok: false, error: e.code || "send_failed" });
  }
}
