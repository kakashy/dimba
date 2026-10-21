# syntax=docker/dockerfile:1
FROM mcr.microsoft.com/playwright:v1.64.0-jammy

# Playwright npm package version MUST match the base image tag (v1.64.0).
# Chromium browsers are pre-installed at /ms-playwright.
WORKDIR /app

ENV NODE_ENV=production \
    TZ=UTC \
    PLAYWRIGHT_BROWSERS_PATH=/ms-playwright \
    COREPACK_ENABLE_DOWNLOAD_PROMPT=0

# --- Runtime: Node + scraper deps only ---
COPY package.json pnpm-lock.yaml ./
RUN corepack enable && pnpm install --frozen-lockfile --prod

# --- App code ---
COPY src ./src

# Entrypoint runs TS directly via tsx; no web server, no PORT.
CMD ["node_modules/.bin/tsx", "src/index.ts"]
