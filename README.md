# LaunchProof Prototype

A lightweight validation platform for pre-launch startup ideas. Captures intent signals via a waitlist page with custom questions, scores signups, and surfaces verdicts on whether an idea is worth building.

## Features

**Founder Flow:**
- One-sentence idea → auto-generated copy + landing page
- Custom validation questions (1–3)
- Price A/B testing
- Public shareable waitlist page

**Intent Scoring:**
- Automatic scoring based on problem severity, willingness-to-pay, and urgency
- Signal quality classification (high/medium/low/spam)
- Device fingerprinting for fraud detection

**Dashboard:**
- Real-time verdict (BUILD / PIVOT / KILL / KEEP COLLECTING)
- Intent breakdown and price performance charts
- High-intent signup export (CSV)

**Pricing Tiers:**
- **Free:** 100 signups, 1 project, validation questions, referrals
- **Builder:** $19/mo — 2,500 signups, 3 projects, price A/B testing, custom domain, CSV export
- **Founder:** $49/mo — unlimited, + webhooks, API, multi-language, priority support

## Tech Stack

- **Backend:** Express.js
- **Database:** SQLite
- **Frontend:** EJS templates, vanilla CSS
- **Runtime:** Node.js

## Getting Started

```bash
npm install
npm start
```

Open `http://localhost:3000` → Enter your idea → Share public URL → Monitor dashboard.

## Deployment

### Railway (Recommended)

Railway auto-deploys on every push to `main` branch.

**Setup:**

1. Create a [Railway.app](https://railway.app) account (sign up with GitHub)
2. New Project → Deploy from GitHub repo → select `LaunchProof`
3. Railway auto-detects the `Dockerfile` and `railway.json` config
4. Add environment variable: `NODE_ENV=production`
5. Click "Deploy" — your app is live in ~2 minutes

**Result:** Public URL assigned (e.g., `launchproof-prod.railway.app`). Every `git push origin main` triggers auto-deploy.

### Docker (Local)

Build and run the app using Docker:

```bash
docker build -t launchproof .
docker run -p 3000:3000 launchproof
```

### Heroku

If you want to deploy to Heroku, use the provided `Procfile`:

```bash
heroku create
git push heroku main
```

### CI/CD

A GitHub Actions workflow in `.github/workflows/ci.yml` validates syntax and lints code on every push and pull request to `main`.

## Database Schema

- `startups` — Project metadata, validation questions, price variants, status
- `subscriptions` — Tier, billing period
- `waitlist_entries` — Email, intent score, validation answers, device fingerprint
- `validation_verdicts` — Verdict snapshots with audit trail

## Project Structure

```
.
├── server.js                 # Express app, routes, scoring logic
├── db.js                     # SQLite schema and init
├── public/
│   └── styles.css           # Dark theme CSS
├── views/
│   ├── partials/
│   │   ├── header.ejs       # App shell
│   │   └── footer.ejs
│   ├── onboarding-idea.ejs
│   ├── onboarding-questions.ejs
│   ├── startup-live.ejs
│   ├── public-waitlist.ejs
│   ├── dashboard.ejs
│   ├── pricing.ejs
│   ├── settings.ejs
│   └── thank-you.ejs
├── package.json
└── README.md
```

## Key Routes

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/` | GET | Onboarding: idea input |
| `/startup/:id/questions` | GET/POST | Pick validation questions, set price variants |
| `/startup/:id/live` | GET | Live page confirmation |
| `/u/:slug` | GET | Public waitlist landing page |
| `/u/:slug/signup` | POST | Submit signup + answers |
| `/startup/:id/dashboard` | GET | Verdict + analytics |
| `/startup/:id/settings` | GET | Subscription & feature management |
| `/startup/:id/upgrade` | POST | Change tier |
| `/startup/:id/export` | GET | Download high-intent signups (CSV) |
| `/pricing` | GET | Public pricing page |

## Notes

- All startups auto-enroll on the free tier
- Intent scores are transparent and repeatable (no black-box ML)
- Verdict logic is simple and rule-based for early validation
- Device fingerprints prevent multi-signup gaming
