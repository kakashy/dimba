# Dimba — Product Context

> Impeccable `init` artifact. The launcher script is unavailable in this skill bundle
> (SKILL.md only); this file is written per the SKILL.md fallback.

## What Dimba is

A single-user, offline-first PWA that lets one person — father, a senior Kenyan
football-fan — follow **this week's SportPesa Mega Jackpot Pro**:

1. See the week's **17 fixtures** (teams, kickoff times in EAT, odds when available).
2. Pick **3 prediction sets** (A / B / C), each a full 17-game 1/X/2 card.
3. Save them (works offline; syncs when back online).
4. See **scored outcomes** of previous sets (correct picks, e.g. 14/17) after each
   round finishes — validated by a weekly Tuesday cron job.

It never places bets, never logs into SportPesa, and has no interest, odds-shopping,
or payment features. It is a personal prediction notebook + scoreboard.

## Audience & constraints

- **Primary user is a senior.** Large type (20px base), very large tap targets
  (≥56px primary controls), plain English labels, no gesture-only interactions,
  high contrast, explicit state text (never icon-only for critical info).
- Phone-first (installed PWA, possibly iOS home-screen), but must be usable on
  desktop too.
- **Offline-first:** the app must open and be fully usable with no network
  (view fixtures, edit + save sets). Sync is opportunistic.
- Single user, no auth (by explicit decision). API is schema-validated but open.

## Data reality

- SportPesa sits behind a JS proof-of-work challenge → data arrives via a
  Playwright-based scraper running weekly (Cloud Run Job, Tuesday 06:00 UTC),
  writing to Neon Postgres.
- Source endpoints: `jackpot-betslip.ke.sportpesa.com/api/jackpots/history*`
  (archive list + per-event details with `resultPick`/`score`), plus the
  `<combi-jackpots>` DOM on `ke.sportpesa.com/en/mega-jackpot-pro` for the
  current card.
- The app reads Neon through SvelteKit API routes and caches everything in
  IndexedDB (Dexie); predictions are written locally first (outbox), then POSTed.

## Success

Father opens the PWA (home screen), immediately sees this week's jackpot and his
3 sets, edits and saves a set in seconds without hunting, and on Tuesday gets a
push notification with his scores. Everything works on a flaky connection.
