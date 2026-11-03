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

## GoHighLevel webhook

The webhook URL is hard-coded in `api/lead.js` (`CRM_WEBHOOK_URL`). It fires **once per lead, only when**:

1. the profile is qualified (not under 12 months / under $10K ask / under $30K revenue / 4+ positions / recent default), and
2. the visitor entered the SMS code and Twilio approved it.

Partial leads, unverified phones and unqualified profiles never reach GHL (they only appear in Vercel logs). The payload is flat and human readable: `first_name`, `last_name`, `email`, `phone`, `company_name`, `postal_code`, `tags`, then every answer (`time_in_business`, `funding_amount`, `monthly_revenue`, `credit_score`, `industry`, `open_positions`, `urgency`, `prior_default`, `funding_needs`), scoring (`lead_tier`, `lead_score`, `eligible_products`, `best_product`, `max_amount`) and compliance (`phone_verified`, `verified_at`, `tcpa_consent_at`, `tcpa_consent_text`, `ip_address`).

In GHL: Automation → Workflow → trigger **Inbound Webhook** → send one test lead → map the fields to the contact and your custom fields.

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

## Thank-you URLs (for pixels / analytics)

- `/typ` — qualified lead, shown after the SMS code (or skip)
- `/typ-nq` — unqualified profile, shown right after business name + email

Both are rewrites to the same page (`vercel.json`); the page switches to the right screen from the URL. Fire your Meta / Google conversion on a page view of `/typ`.
