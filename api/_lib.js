// Shared helpers for the API routes.
import twilio from "twilio";

export const client = () =>
  twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);

export const VERIFY_SID = () => process.env.TWILIO_VERIFY_SID;

// Normalize any US number to E.164 (+1XXXXXXXXXX). Returns null if not 10 digits.
export function toE164(phone) {
  const d = String(phone || "").replace(/\D/g, "").replace(/^1/, "").slice(-10);
  if (d.length !== 10) return null;
  if (/^[01]/.test(d) || /^.{3}[01]/.test(d)) return null; // NANP: area code / exchange can't start with 0 or 1
  return "+1" + d;
}

// Very small in-memory rate limiter (per serverless instance). Good enough to stop casual abuse;
// pair with Twilio Fraud Guard and Vercel's firewall for real protection.
const buckets = new Map();
export function rateLimit(key, max, windowMs) {
  const now = Date.now();
  const b = buckets.get(key) || { n: 0, reset: now + windowMs };
  if (now > b.reset) { b.n = 0; b.reset = now + windowMs; }
  b.n += 1;
  buckets.set(key, b);
  return b.n <= max;
}

export function ip(req) {
  return (req.headers["x-forwarded-for"] || "").split(",")[0].trim() || req.socket?.remoteAddress || "unknown";
}

export function cors(req, res) {
  const allowed = (process.env.ALLOWED_ORIGINS || "").split(",").map(s => s.trim()).filter(Boolean);
  const origin = req.headers.origin;
  if (allowed.length === 0 || (origin && allowed.includes(origin))) {
    res.setHeader("Access-Control-Allow-Origin", origin || "*");
    res.setHeader("Vary", "Origin");
  }
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") { res.status(204).end(); return true; }
  return false;
}

export function readJson(req) {
  if (req.body && typeof req.body === "object") return req.body;
  try { return JSON.parse(req.body || "{}"); } catch { return {}; }
}
