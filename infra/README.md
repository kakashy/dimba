# Dimba scraper infrastructure

## What runs where
- **Cloud Run Job `dimba-scraper`** — Playwright (Chromium) container that scrapes SportPesa's
  Mega Jackpot Pro fixtures + previous-round results, then POSTs a normalized JSON payload to
  `POST /api/internal/sync` on the Vercel app (`x-internal-secret` header).
- **Cloud Scheduler `dimba-tue`** — invokes the job every Tuesday **06:00 UTC** (09:00 EAT).
- **Vercel app** — receives the payload, writes fixtures/predictions to Neon, scores finished
  rounds, sends Web Push notifications.

## Deploy (one-time)
Edit `infra/deploy.sh` (PROJECT_ID, VERCEL_APP_URL, SYNC_SECRET), then:

```bash
chmod +x infra/deploy.sh
./infra/deploy.sh
```

## Manual trigger
```bash
gcloud run jobs execute dimba-scraper --region asia-southeast1 --wait
gcloud scheduler jobs run dimba-tue --location asia-southeast1   # through Cloud Scheduler
gcloud run jobs logs read dimba-scraper --region asia-southeast1 --limit 50
```

## Contract (scraper → app)
`POST ${APP_SYNC_URL}/api/internal/sync`
Header: `x-internal-secret: ${INTERNAL_SYNC_SECRET}`
Body JSON (produced by `scraper/src/sync.ts` buildPayload): `{ scrapedAt, source, current, finished[], run }`

The app owns: Neon writes, scoring, push notifications. The scraper owns: browser, parsing, delivery.

## Costs (4 executions/month)
- Cloud Scheduler: $0 (3 free job definitions/account)
- Cloud Run Job: ~$0 (≪ free tier of 240k vCPU-s/month)
- Artifact Registry: ~$0.25/month (3 GB Playwright image)
- Everything else: $0

## Notes
- `playwright` is pinned to `1.64.0` in `scraper/package.json` to exactly match the
  `mcr.microsoft.com/playwright:v1.64.0-jammy` base image tag (browser binaries are pre-installed
  in the image; no runtime `playwright install`).
- Jobs don't serve HTTP, so no `PORT`/health endpoint. Exit codes: 0 success, 1 degraded (error
  payload delivered), 2 undelivered, 3 config error.
- Chrome sandbox disabled inside the container (`--no-sandbox`) — standard for containerized
  Chromium; only trusted SportPesa URLs are fetched.
- Golden test data captured live from SportPesa lives in `scraper/test/goldens/`.
