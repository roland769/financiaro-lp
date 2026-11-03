# Financiaro — business funding pre-qualification funnel

Static funnel (`public/index.html`) + three Vercel serverless routes:

| Route | Does |
|---|---|
| `POST /api/otp-send` | Sends a 6-digit SMS code via Twilio Verify |
| `POST /api/otp-check` | Checks the code; on success stamps `phoneVerified:true` server-side and forwards to the CRM |
| `POST /api/lead` | Receives every lead event (partial / complete / updated / unqualified), assigns a `leadId`, forwards to `CRM_WEBHOOK_URL` |

## Deploy (10 minutes)

1. **Twilio** — twilio.com → upgrade to a paid account → *Verify → Services → Create* (name: Financiaro, 6 digits). Copy the **Service SID** (`VA…`). From *Account Info* copy **Account SID** and **Auth Token**. In the Verify service, turn on **Fraud Guard**.
2. **Push this folder to GitHub** (or `vercel` CLI).
3. **Vercel** — *Add New Project* → import the repo → *Environment Variables*: paste the three Twilio values, plus `CRM_WEBHOOK_URL` (Zapier / Make / GoHighLevel inbound webhook). Deploy.
4. **Test** — open the deployment URL, complete the funnel with your own mobile. The SMS arrives within ~10 s. Check *Twilio → Monitor → Logs → Verify* and *Vercel → Logs*.
5. **Domain** — *Settings → Domains* → add yours.

## Lead events your CRM receives

Every POST is JSON with a `stage`:

- `partial` — after business name + email (all answers, score, eligible products)
- `complete` — after first/last name + phone (adds TCPA consent text + timestamp)
- `verified` — from the server only, after a successful SMS code (`phoneVerified:true`, `verifiedTs`)
- `unverified` — visitor skipped the code
- `updated` — optional notes added on the thank-you page
- `unqualified` — hard-stop profiles (under 12 months, under $10K ask, under $30K/mo, 4+ positions, default in last 2 years); no phone asked

Match events with `leadId`. Only trust `phoneVerified` when `stage` is `verified`.

## Cost

Twilio Verify ≈ $0.05 per successful verification + ~$0.008 per SMS. Vercel Hobby plan is free for this traffic.

## Where to edit

- Copy, questions, thresholds: `public/index.html` (search `PRODUCTS`, `leadScore`, `isUnqualified`)
- Advisor name / callback number: `ADVISOR_PHONE` and the "Jordan" card in `public/index.html`
- Rate limits: `api/_lib.js`

## Editing the page

Edit `src/index.html` (readable source), then minify into `public/index.html`:

```
npx html-minifier-terser src/index.html -o public/index.html --collapse-whitespace --remove-comments --minify-css true --minify-js true
```
