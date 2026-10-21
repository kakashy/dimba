#!/usr/bin/env bash
# Dimba scraper — GCP Cloud Run Job + Cloud Scheduler (weekly, Tue 06:00 UTC)
#
# Prereqs: gcloud CLI authenticated, billing enabled on PROJECT_ID.
# The app (Vercel) must be publicly reachable — the job POSTs to it.
#
# Usage:
#   SYNC_SECRET=<same value as Vercel INTERNAL_SYNC_SECRET> bash infra/deploy.sh
#
# Re-runnable: updates existing resources instead of failing on them.

set -euo pipefail

PROJECT_ID="${PROJECT_ID:-makn8n}"
REGION="${REGION:-asia-southeast1}"   # same metro as Neon ap-southeast-1 (Singapore)
REPO="${REPO:-dimba}"
IMAGE="${REGION}-docker.pkg.dev/${PROJECT_ID}/${REPO}/scraper:v1"
JOB_NAME="${JOB_NAME:-dimba-scraper}"
SCHEDULER_JOB="${SCHEDULER_JOB:-dimba-tue}"
VERCEL_APP_URL="${VERCEL_APP_URL:-https://dimba-eight.vercel.app}"
SYNC_SECRET="${SYNC_SECRET:-}"   # must match Vercel INTERNAL_SYNC_SECRET
# Tolerate a bare hostname or a full URL
APP_SYNC_URL="https://${VERCEL_APP_URL#https://}"
APP_SYNC_URL="${APP_SYNC_URL%/}"

if [ -z "$SYNC_SECRET" ]; then
  echo "ERROR: SYNC_SECRET is required (must match Vercel INTERNAL_SYNC_SECRET)." >&2
  echo "  SYNC_SECRET=\"<value>\" bash infra/deploy.sh" >&2
  exit 1
fi
if [ "$SYNC_SECRET" = "CHANGE_ME_AT_LEAST_8_CHARS" ]; then
  echo "ERROR: SYNC_SECRET is still the placeholder." >&2
  exit 1
fi

RUNTIME_SA="${JOB_NAME}-runtime@${PROJECT_ID}.iam.gserviceaccount.com"
INVOKER_SA="${SCHEDULER_JOB}-invoker@${PROJECT_ID}.iam.gserviceaccount.com"

echo "==> Project: ${PROJECT_ID}  region: ${REGION}  app: ${APP_SYNC_URL}"

echo "==> Enabling APIs"
gcloud services enable --quiet \
  run.googleapis.com cloudbuild.googleapis.com artifactregistry.googleapis.com \
  cloudscheduler.googleapis.com secretmanager.googleapis.com iam.googleapis.com

echo "==> Service accounts"
for sa in "${JOB_NAME}-runtime" "${SCHEDULER_JOB}-invoker"; do
  gcloud iam service-accounts describe "${sa}@${PROJECT_ID}.iam.gserviceaccount.com" >/dev/null 2>&1 \
    || gcloud iam service-accounts create "$sa" --display-name="Dimba ${sa}"
done

echo "==> Secret: dimba-sync-secret"
if gcloud secrets describe dimba-sync-secret >/dev/null 2>&1; then
  printf '%s' "$SYNC_SECRET" | gcloud secrets versions add dimba-sync-secret --data-file=-
else
  printf '%s' "$SYNC_SECRET" | gcloud secrets create dimba-sync-secret \
    --replication-policy=automatic --data-file=-
fi
gcloud secrets add-iam-policy-binding dimba-sync-secret \
  --member="serviceAccount:${RUNTIME_SA}" \
  --role="roles/secretmanager.secretAccessor" --quiet >/dev/null

echo "==> Artifact Registry repo"
gcloud artifacts repositories describe "${REPO}" --location="${REGION}" >/dev/null 2>&1 \
  || gcloud artifacts repositories create "${REPO}" \
       --repository-format=docker --location="${REGION}"

if [ "${SKIP_BUILD:-0}" = "1" ]; then
  echo "==> SKIP_BUILD=1 — reusing existing image ${IMAGE}"
else
  echo "==> Building image (Cloud Build, ~3-6 min for the Playwright base image)"
  gcloud builds submit --tag "${IMAGE}" --timeout=20m --quiet scraper/
fi

echo "==> Cloud Run Job"
if gcloud run jobs describe "${JOB_NAME}" --region "${REGION}" >/dev/null 2>&1; then
  gcloud run jobs update "${JOB_NAME}" --region "${REGION}" \
    --image "${IMAGE}" \
    --service-account "${RUNTIME_SA}" \
    --cpu 2 --memory 2Gi \
    --task-timeout 240s \
    --max-retries 1 \
    --set-env-vars "TZ=UTC,NODE_ENV=production,APP_SYNC_URL=${APP_SYNC_URL}" \
    --set-secrets "INTERNAL_SYNC_SECRET=dimba-sync-secret:latest"
else
  gcloud run jobs create "${JOB_NAME}" --region "${REGION}" \
    --image "${IMAGE}" \
    --service-account "${RUNTIME_SA}" \
    --cpu 2 --memory 2Gi \
    --task-timeout 240s \
    --max-retries 1 --tasks 1 \
    --set-env-vars "TZ=UTC,NODE_ENV=production,APP_SYNC_URL=${APP_SYNC_URL}" \
    --set-secrets "INTERNAL_SYNC_SECRET=dimba-sync-secret:latest"
fi

echo "==> IAM: scheduler can invoke the job"
gcloud run jobs add-iam-policy-binding "${JOB_NAME}" --region "${REGION}" \
  --member="serviceAccount:${INVOKER_SA}" \
  --role="roles/run.invoker" --quiet >/dev/null

echo "==> IAM: scheduler service agent can mint tokens for the invoker SA"
PROJECT_NUMBER="$(gcloud projects describe "${PROJECT_ID}" --format='value(projectNumber)')"
gcloud iam service-accounts add-iam-policy-binding "${INVOKER_SA}" \
  --member="serviceAccount:service-${PROJECT_NUMBER}@gcp-sa-cloudscheduler.iam.gserviceaccount.com" \
  --role="roles/iam.serviceAccountTokenCreator" --quiet >/dev/null

echo "==> Cloud Scheduler — every Tuesday 06:00 UTC (09:00 EAT)"
SCHED_ARGS=(
  --location "${REGION}" --schedule "0 6 * * 2" --time-zone "Etc/UTC"
  --uri "https://run.googleapis.com/v2/projects/${PROJECT_ID}/locations/${REGION}/jobs/${JOB_NAME}:run"
  --http-method POST --message-body '{}' --headers 'Content-Type=application/json'
  --oauth-service-account-email "${INVOKER_SA}"
  --attempt-deadline 300s --max-retry-attempts 2 --quiet
)
if gcloud scheduler jobs describe "${SCHEDULER_JOB}" --location "${REGION}" >/dev/null 2>&1; then
  gcloud scheduler jobs update http "${SCHEDULER_JOB}" "${SCHED_ARGS[@]}"
else
  gcloud scheduler jobs create http "${SCHEDULER_JOB}" "${SCHED_ARGS[@]}"
fi

echo
echo "==> Deployed. Manual trigger / inspect:"
echo "  gcloud run jobs execute ${JOB_NAME} --region ${REGION} --wait   # run now, watch output"
echo "  gcloud run jobs logs read ${JOB_NAME} --region ${REGION} --limit 50"
echo "  gcloud scheduler jobs run ${SCHEDULER_JOB} --location ${REGION} # trigger via scheduler"
