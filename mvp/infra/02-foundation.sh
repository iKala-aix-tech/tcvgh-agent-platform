#!/usr/bin/env bash
# Foundation: Firestore, upload bucket, Artifact Registry, service accounts, IAM, secrets.
# Idempotent: every create is guarded by a describe.
set -euo pipefail
: "${PROJECT_ID:?run: source infra/env.sh}"

# --- Firestore (Native mode, dedicated named database in Taiwan) -----------------------
if ! gcloud firestore databases describe --database="$FIRESTORE_DATABASE" >/dev/null 2>&1; then
  gcloud firestore databases create --database="$FIRESTORE_DATABASE" --location="$FIRESTORE_LOCATION" --type=firestore-native
else
  echo "firestore: $FIRESTORE_DATABASE exists"
fi

# Composite index for: agents where owner_uid == X order by updated_at desc (list page)
if ! gcloud firestore indexes composite list --database="$FIRESTORE_DATABASE" --format="value(fields.fieldPath)" 2>/dev/null | grep -q "owner_uid"; then
  gcloud firestore indexes composite create --database="$FIRESTORE_DATABASE" --collection-group=agents --query-scope=COLLECTION \
    --field-config=field-path=owner_uid,order=ascending --field-config=field-path=updated_at,order=descending --async
else
  echo "firestore: agents index exists"
fi

# --- Upload bucket: uniform access, no public, versioning for audit --------------------
if ! gcloud storage buckets describe "gs://$UPLOAD_BUCKET" >/dev/null 2>&1; then
  gcloud storage buckets create "gs://$UPLOAD_BUCKET" \
    --location="$REGION" --uniform-bucket-level-access --public-access-prevention
  gcloud storage buckets update "gs://$UPLOAD_BUCKET" --versioning
else
  echo "bucket: $UPLOAD_BUCKET exists"
fi

# --- Artifact Registry for the LiteLLM image -------------------------------------------
if ! gcloud artifacts repositories describe "$AR_REPO" --location="$REGION" >/dev/null 2>&1; then
  gcloud artifacts repositories create "$AR_REPO" --repository-format=docker --location="$REGION" \
    --description="TCVGH agent platform images"
else
  echo "artifact registry: $AR_REPO exists"
fi

# --- Service accounts -------------------------------------------------------------------
for SA in "$LITELLM_SA" "$BACKEND_SA"; do
  if ! gcloud iam service-accounts describe "${SA}@${PROJECT_ID}.iam.gserviceaccount.com" >/dev/null 2>&1; then
    gcloud iam service-accounts create "$SA" --display-name="$SA"
  else
    echo "sa: $SA exists"
  fi
done
LITELLM_SA_EMAIL="${LITELLM_SA}@${PROJECT_ID}.iam.gserviceaccount.com"
BACKEND_SA_EMAIL="${BACKEND_SA}@${PROJECT_ID}.iam.gserviceaccount.com"

# LiteLLM: call Vertex AI, read its secrets. Nothing else.
for ROLE in roles/aiplatform.user roles/secretmanager.secretAccessor roles/logging.logWriter; do
  gcloud projects add-iam-policy-binding "$PROJECT_ID" --member="serviceAccount:${LITELLM_SA_EMAIL}" --role="$ROLE" --condition=None >/dev/null
done

# Backend: Firestore, the upload bucket only, secrets, DLP (de-identify), invoke LiteLLM.
for ROLE in roles/datastore.user roles/secretmanager.secretAccessor roles/dlp.user roles/logging.logWriter roles/run.invoker; do
  gcloud projects add-iam-policy-binding "$PROJECT_ID" --member="serviceAccount:${BACKEND_SA_EMAIL}" --role="$ROLE" --condition=None >/dev/null
done
gcloud storage buckets add-iam-policy-binding "gs://$UPLOAD_BUCKET" \
  --member="serviceAccount:${BACKEND_SA_EMAIL}" --role=roles/storage.objectAdmin >/dev/null

# --- Secrets: LiteLLM master key (generated once), placeholders for other providers ------
if ! gcloud secrets describe litellm-master-key >/dev/null 2>&1; then
  printf 'sk-%s' "$(openssl rand -hex 24)" | gcloud secrets create litellm-master-key --data-file=- --replication-policy=user-managed --locations="$REGION"
else
  echo "secret: litellm-master-key exists"
fi
for S in azure-openai-api-key bedrock-aws-access-key bedrock-aws-secret-key onprem-vllm-api-key; do
  if ! gcloud secrets describe "$S" >/dev/null 2>&1; then
    printf 'REPLACE_ME' | gcloud secrets create "$S" --data-file=- --replication-policy=user-managed --locations="$REGION"
  fi
done

echo "foundation ready: firestore, gs://$UPLOAD_BUCKET, AR $AR_REPO, SAs $LITELLM_SA/$BACKEND_SA, secrets"
