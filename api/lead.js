// POST /api/lead  { ...lead, stage }
// Receives every lead event from the page (partial / complete / updated / unqualified),
// assigns a leadId on first contact, stamps server-side metadata and forwards a FLAT,
// human-readable payload to the CRM webhook (GoHighLevel / LeadConnector inbound webhook).
// The client never sees the CRM URL, and "phoneVerified" is only ever set by otp-check.js.
import { cors, readJson, ip, rateLimit } from "./_lib.js";
import { randomUUID, createHmac } from "node:crypto";

const CRM_WEBHOOK_URL = () => process.env.CRM_WEBHOOK_URL || "";
const CRM_SECRET = () => process.env.CRM_WEBHOOK_SECRET || "";
// Which stages to forward. Default: everything. Example to only forward qualified, phone-captured leads: "complete,verified,updated"
const FORWARD_STAGES = () => (process.env.CRM_FORWARD_STAGES || "partial,complete,verified,unverified,updated,unqualified").split(",").map(s => s.trim());

/* ---------- answer labels (numeric values -> what the visitor clicked) ---------- */
const L = {
  tib:      { 3: "Less than 6 months", 9: "6 to 12 months", 18: "1 to 2 years", 42: "2 to 5 years", 84: "More than 5 years" },
  amount:   { 7500: "Less than $10,000", 20000: "$10,000 – $30,000", 65000: "$30,000 – $100,000", 200000: "More than $100,000" },
  rev:      { 15000: "Less than $30,000", 45000: "$30,000 – $60,000", 80000: "$60,000 – $100,000", 150000: "More than $100,000" },
  fico:     { 745: "Excellent (720+)", 700: "Good (680–719)", 650: "Fair (600–679)", 575: "Poor (550–599)", 520: "Below 550", 620: "Not sure" },
  industry: { trucking: "Trucking", restaurant: "Restaurants", construction: "Construction", medical: "Medical and med spas", ecommerce: "E-commerce", home: "Home services", other: "Others" },
  debt:     { 0: "None", 1: "1", 2: "2", 3: "3", 4: "4 or more" },
  urgency:  { asap: "Within 48 hours", week: "This week", month: "Within 30 days", exploring: "Just exploring" },
  priorDefault: { none: "No, never", old: "Yes, more than 2 years ago", recent: "Yes, within the last 2 years" },
};
const label = (k, v) => (v === undefined || v === null || v === "") ? "" : (L[k]?.[v] ?? String(v));
const fmtPhone = p => { const d = String(p || "").replace(/\D/g, "").slice(-10); return d.length === 10 ? "+1" + d : ""; };

/* ---------- build the flat payload GHL maps easily ---------- */
export function toCrmPayload(lead, extra = {}) {
  const tier = lead.lead?.tier || "";
  return {
    // --- standard GHL contact fields ---
    first_name: lead.first || "",
    last_name: lead.last || "",
    email: lead.email || "",
    phone: fmtPhone(lead.phone),
    company_name: lead.biz || "",
    postal_code: lead.zip || "",
    source: "Financiaro funnel",
    tags: [tier ? "financiaro-" + tier.toLowerCase() : "", lead.stage ? "stage-" + lead.stage : "", lead.phoneVerified ? "phone-verified" : ""].filter(Boolean).join(","),

    // --- funnel answers, human readable ---
    time_in_business: label("tib", lead.tib),
    funding_amount: label("amount", lead.amount),
    monthly_revenue: label("rev", lead.rev),
    credit_score: label("fico", lead.fico),
    industry: label("industry", lead.industry),
    open_positions: label("debt", lead.debt),
    urgency: label("urgency", lead.urgency),
    prior_default: label("priorDefault", lead.priorDefault),
    funding_needs: lead.notes || "",

    // --- qualification ---
    qualified: lead.unqualified ? "No" : "Yes",
    lead_tier: tier,
    lead_score: lead.lead?.score ?? "",
    eligible_products: (lead.offers || []).map(o => o.id).join(", "),
    best_product: lead.offers?.[0]?.name || lead.offers?.[0]?.id || "",
    max_amount: lead.offers?.length ? Math.max(...lead.offers.map(o => o.max || 0)) : "",

    // --- event / compliance ---
    stage: lead.stage || "",
    lead_id: lead.leadId || "",
    phone_verified: lead.phoneVerified ? "Yes" : "No",
    verified_at: lead.verifiedTs || "",
    tcpa_consent: lead.tcpa ? "Yes" : "No",
    tcpa_consent_at: lead.consentTs || "",
    tcpa_consent_text: lead.consentText || "",
    submitted_at: lead.ts || "",
    received_at: new Date().toISOString(),
    page_url: lead.source || "",
    ip_address: lead.ip || "",
    user_agent: lead.userAgent || "",
    ...extra,
  };
}

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

  lead.leadId = leadId;
  lead.ip = ip(req);
  lead.userAgent = req.headers["user-agent"] || "";

  if (FORWARD_STAGES().includes(lead.stage)) {
    try { await forwardLead(toCrmPayload(lead)); } catch (e) { console.error("lead forward failed", e.message); }
  }
  return res.status(200).json({ ok: true, leadId });
}
