// POST /api/lead  { ...lead, stage }
// Receives every lead event from the page (partial / complete / updated / unqualified),
// assigns a leadId on first contact, stamps server-side metadata and forwards to your CRM webhook.
// The client never sees the CRM URL, and "phoneVerified" is only ever set by otp-check.js.
import { cors, readJson, ip, rateLimit } from "./_lib.js";
import { randomUUID, createHmac } from "node:crypto";

const CRM_WEBHOOK_URL = () => process.env.CRM_WEBHOOK_URL || "";
const CRM_SECRET = () => process.env.CRM_WEBHOOK_SECRET || "";

export async function forwardLead(payload) {
  const url = CRM_WEBHOOK_URL();
  if (!url) { console.log("[lead] no CRM_WEBHOOK_URL set; payload:", JSON.stringify(payload)); return; }
  const body = JSON.stringify(payload);
  const headers = { "Content-Type": "application/json" };
  if (CRM_SECRET()) headers["X-Signature"] = createHmac("sha256", CRM_SECRET()).update(body).digest("hex");
  const r = await fetch(url, { method: "POST", headers, body });
  if (!r.ok) throw new Error("crm " + r.status);
}

export default async function handler(req, res) {
  if (cors(req, res)) return;
  if (req.method !== "POST") return res.status(405).json({ ok: false, error: "method" });
  if (!rateLimit("lead:" + ip(req), 30, 10 * 60 * 1000)) return res.status(429).json({ ok: false, error: "too_many_requests" });

  const lead = readJson(req);
  const leadId = lead.leadId || randomUUID();

  // Never trust these from the browser.
  delete lead.phoneVerified; delete lead.verifiedTs; delete lead.verifiedBy;

  const payload = {
    ...lead,
    leadId,
    company: "Financiaro",
    receivedAt: new Date().toISOString(),
    ip: ip(req),
    userAgent: req.headers["user-agent"] || "",
    referer: req.headers["referer"] || "",
  };

  try { await forwardLead(payload); } catch (e) { console.error("lead forward failed", e.message); }
  return res.status(200).json({ ok: true, leadId });
}
