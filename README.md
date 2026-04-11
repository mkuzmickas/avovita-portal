# AvoVita Patient Portal

Private lab testing patient portal for **AvoVita Wellness** (2490409 Alberta Ltd.), Calgary, AB.

Built with Next.js 16 App Router, Supabase, Stripe, Resend, and Twilio. All personal health information is handled in compliance with **Alberta PIPA**.

---

## Overview

AvoVita facilitates private blood testing in Calgary:

1. Patients browse and order lab tests online (this portal)
2. A FloLabs phlebotomist visits their home to collect specimens
3. AvoVita ships specimens to international partner labs (Mayo Clinic, Armin Labs, ReligenDx, DynaLife, Dynacare)
4. Lab returns PDF results to AvoVita
5. Admin uploads the PDF — patient is notified instantly by email + SMS
6. Patient logs in to view their results via a 1-hour signed URL

---

## Tech Stack

| Tool | Purpose |
|---|---|
| Next.js 16 (App Router) | Full-stack framework |
| TypeScript | Type safety |
| Tailwind CSS v4 | Styling |
| Supabase | Auth, PostgreSQL database, Storage (Canada Central) |
| Stripe | Payment processing (CAD) |
| Resend | Transactional email |
| Twilio | SMS notifications |
| Vercel | Deployment |

---

## Environment Variables

Copy `.env.local` and fill in the `YOUR_SECRET` values:

| Variable | Description |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase anon/public key |
| `SUPABASE_SERVICE_ROLE_KEY` | Service role key (server-only, bypasses RLS) |
| `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` | Stripe publishable key |
| `STRIPE_SECRET_KEY` | Stripe secret key (server-only) |
| `STRIPE_WEBHOOK_SECRET` | Stripe webhook signing secret |
| `RESEND_API_KEY` | Resend API key |
| `RESEND_FROM_ORDERS` | From address for order confirmations |
| `RESEND_FROM_RESULTS` | From address for result notifications |
| `TWILIO_ACCOUNT_SID` | Twilio Account SID |
| `TWILIO_AUTH_TOKEN` | Twilio auth token (server-only) |
| `TWILIO_PHONE_NUMBER` | Twilio from phone number |
| `NEXT_PUBLIC_APP_URL` | Public URL of the deployed app |
| `NEXT_PUBLIC_HOME_VISIT_FEE_BASE` | Base home visit fee in CAD (default: 85) |
| `NEXT_PUBLIC_HOME_VISIT_FEE_ADDITIONAL` | Per-additional-person fee in CAD (default: 55) |

> **Never commit `.env.local` to version control.** It is gitignored.

---

## Running Locally

```bash
# Install dependencies
npm install

# Start dev server
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

---

## Database Setup (Supabase)

1. Create a Supabase project in the **Canada Central** region
2. Open the **SQL Editor** in the Supabase dashboard
3. Paste and run the entire contents of `supabase/migrations/001_initial_schema.sql`
4. Create the private storage bucket:
   - Go to **Storage** → **New Bucket**
   - Name: `results-pdfs`
   - **Uncheck** "Public bucket" — this must be private
5. Set up Supabase Auth:
   - Enable Email provider
   - Set Site URL to your `NEXT_PUBLIC_APP_URL`
   - Add redirect URLs: `https://app.avovita.ca/**`

---

## Adding a New Lab Test

Insert directly via Supabase SQL editor or dashboard table editor:

```sql
-- First find the lab ID
SELECT id, name FROM labs;

-- Insert the test
INSERT INTO tests (lab_id, name, slug, description, category, price_cad, turnaround_display, turnaround_min_days, turnaround_max_days, specimen_type, active, featured)
VALUES (
  '<lab-uuid>',
  'Test Name',
  'test-name-slug',
  'Full description shown to patients.',
  'Category Name',
  299.00,
  '7–10 business days from lab receipt',
  7, 10,
  'Blood (serum)',
  true,
  false
);
```

The `slug` must be unique. Use lowercase with hyphens only.

---

## Admin Results Upload Workflow

This replaces the previous manual HighMail process:

1. Sign in with an admin account (role = `admin` in the `accounts` table)
2. Navigate to `/admin/results`
3. All order lines without an uploaded result are listed
4. Drag and drop the PDF onto the order line, optionally enter a lab reference number
5. Click **Upload Result** — the system will:
   - Upload the PDF to the private `results-pdfs` Supabase Storage bucket
   - Create a `results` record in the database
   - Send the patient an email (from `RESEND_FROM_RESULTS`) with a link to their portal
   - Send the patient an SMS via Twilio
   - Log both notifications in the `notifications` table

**Important:** Result PDFs are never publicly accessible. All access is via signed URLs with 1-hour expiry, generated server-side only.

---

## Stripe Webhook Setup

1. In the Stripe dashboard, go to **Webhooks** → **Add Endpoint**
2. URL: `https://app.avovita.ca/api/stripe/webhook`
3. Events to listen for: `checkout.session.completed`
4. Copy the signing secret into `STRIPE_WEBHOOK_SECRET`

For local testing, use the Stripe CLI:
```bash
stripe listen --forward-to localhost:3000/api/stripe/webhook
```

---

## Vercel Deployment

1. Push the repo to GitHub (ensure `.env.local` is NOT committed)
2. Import the project on Vercel
3. Add all environment variables from `.env.local` in **Vercel Project Settings → Environment Variables**
4. Deploy — Vercel will auto-build on every push to `main`

**Build command:** `npm run build`  
**Output directory:** `.next`  
**Node version:** 20.x

### Post-deployment checklist

- [ ] Supabase Auth Site URL set to production URL
- [ ] Stripe webhook endpoint registered with production URL
- [ ] `NEXT_PUBLIC_APP_URL` set to production URL
- [ ] Resend domain `notifications.avovita.ca` DNS verified
- [ ] Twilio phone number active and capable of SMS to Canada
- [ ] `results-pdfs` Supabase Storage bucket is private (no public access)
- [ ] At least one admin account created (`UPDATE accounts SET role = 'admin' WHERE email = 'your@email.com';`)

---

## Privacy & Compliance (Alberta PIPA)

- All patient health data stored in Supabase Canada Central region
- Explicit consent captured and stored permanently in the `consents` table (append-only)
- Cross-border data transfer consents required for US and German labs
- Result PDFs served only via short-lived signed URLs (1 hour max)
- Row Level Security enforced on all tables — patients can only access their own data
- No patient data is ever sold or shared with third parties for marketing
- Service role key used only server-side in API routes; never exposed to browser

---

## Project Structure

```
src/
├── app/
│   ├── (public)/          # Public pages (home, tests catalogue, checkout success)
│   ├── (auth)/            # Auth pages (login, signup)
│   ├── (portal)/          # Protected patient portal
│   │   └── portal/
│   │       ├── page.tsx          # Dashboard
│   │       ├── orders/           # Order history
│   │       ├── results/          # Lab results
│   │       ├── profiles/         # Patient profiles
│   │       └── settings/         # Account settings
│   ├── (admin)/           # Admin area (results upload, order management)
│   └── api/               # API routes
│       ├── stripe/checkout/       # Create Stripe Checkout Session
│       ├── stripe/webhook/        # Handle Stripe webhooks
│       ├── results/upload/        # Admin PDF upload endpoint
│       ├── results/view/          # Generate signed PDF URL
│       └── notify/                # Send email + SMS notifications
├── components/            # Reusable React components
├── lib/                   # Client library initializations + utilities
│   ├── supabase/
│   │   ├── client.ts             # Browser Supabase client
│   │   └── server.ts             # Server + service role clients
│   ├── stripe.ts
│   ├── resend.ts
│   ├── twilio.ts
│   └── utils.ts
├── middleware.ts           # Auth protection for /portal and /admin
└── types/
    └── database.ts         # TypeScript types for all tables
supabase/
└── migrations/
    └── 001_initial_schema.sql    # Full database schema + RLS + seed data
```
