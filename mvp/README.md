# TCVGH Agent Platform — MVP build (sandbox: `cloud-sa-sandbox-1`)

This folder is the runnable MVP that matches diagram v0.3. It is deliberately small:
three deployables and a handful of `gcloud` scripts, no Terraform yet.

```
mvp/
├── infra/        numbered gcloud scripts; run in order, each is idempotent
├── litellm/      LiteLLM proxy config + Dockerfile (model gateway, column D)
├── backend/      FastAPI "Platform API + Agent Runtime" (column B), Python 3.12
└── frontend/     React + React Flow builder UI on Firebase Hosting (column A)
```

## 0. One-time local prerequisites

| Tool | Why | Install |
|---|---|---|
| gcloud (present) | all provisioning | `gcloud auth login` and `gcloud auth application-default login` |
| node 26 / npm (present) | frontend build, Firebase CLI via `npx` | — |
| uv (present) | backend local run | — |
| Docker | **not required** — images build in Cloud Build | — |

## 1. Provision (run from `mvp/`)

```bash
source infra/env.sh                 # project, region, names; edit ALLOWED_DOMAINS first
bash infra/01-enable-apis.sh        # enable ~15 APIs
bash infra/02-foundation.sh         # Firestore, GCS bucket, Artifact Registry, 2 service accounts, secrets
bash infra/03-deploy-litellm.sh     # build LiteLLM image with config, deploy to Cloud Run (internal ingress)
bash infra/04-deploy-backend.sh     # deploy FastAPI from source, wire it to LiteLLM + Firestore + GCS
bash infra/05-firebase.sh           # add Firebase to the project, create web app, print config for frontend/.env
```

Console steps:
1. Firebase console → Authentication → Sign-in method → enable **Google** (already on in the sandbox; the Hosting site
   `tcvgh-agent-builder.web.app` was added to authorized domains via the Identity Toolkit API).
2. (Later, Gmail/Calendar connectors) Google Cloud console → APIs & Services → OAuth consent
   screen → **Internal**, add scopes `gmail.send`, `calendar.events`, `drive.readonly`.

Finally build and deploy the frontend:

```bash
cd frontend && cp .env.example .env   # paste values printed by 05-firebase.sh
npm install && npm run build
npx firebase-tools deploy --only hosting --project "$PROJECT_ID"
```

## 1b. Deployed state (sandbox, 2026-10-23)

| Piece | Where |
|---|---|
| Builder UI | https://tcvgh-agent-builder.web.app (Firebase Hosting site `tcvgh-agent-builder`, rewrites `/api/**` to Cloud Run) |
| Platform API | Cloud Run `tcvgh-platform-api`, asia-east1, public at IAM layer, Firebase token required on `/api/*`; health at `/api/health` |
| LiteLLM | Cloud Run `tcvgh-litellm`, asia-east1, **internal ingress**, backend reaches it via Direct VPC egress + ID token |
| Firestore | named database `tcvgh-agent-platform` in asia-east1 (the project's `(default)` DB is nam5/US and shared) |
| Vertex AI | `global` endpoint: `gemini-3-flash-preview`, `gemini-3.1-pro-preview`, fallback `gemini-2.5-flash` (no Gemini in asia-east1) |
| Uploads | `gs://cloud-sa-sandbox-1-tcvgh-agent-uploads` (asia-east1, versioned, no public access) |

Verified end-to-end with a temporary test user: create agent → condition node → `fast` or `reasoning` group → Gemini → publish → run published → delete.
Idle cost is close to zero (Cloud Run min-instances 0, no Cloud SQL / Redis yet).

## 1c. CI/CD (GitHub Actions → Firebase Hosting)

`.github/workflows/firebase-hosting.yml` builds `mvp/frontend` and deploys it to the `tcvgh-agent-builder` site on
every push to `main` that touches the frontend; pull requests get a temporary preview URL. One-time setup:

```bash
source infra/env.sh && bash infra/07-github-cicd.sh   # deploy SA + roles, key → GitHub secret, VITE_* → GitHub secrets
```

Firebase **App Hosting** is not used: it expects a server-rendered Node app (Next.js/Angular) and cannot express the
`/api/**` → Cloud Run rewrite. The Vite SPA belongs on classic Hosting.

## 2. What each component does

**LiteLLM** (`litellm/config.yaml`) exposes one OpenAI-compatible endpoint with model *groups*
(`fast`, `reasoning`, `budget`, `sovereign`) exactly as in the design notes. Vertex AI Gemini
entries are live; on-prem vLLM, Azure OpenAI and Bedrock entries are present but commented
out until credentials / VPN exist. Fallback chains are declared under `router_settings`.

**Backend** (`backend/app`)
- `auth.py` verifies the Firebase ID token and enforces the Workspace domain allow-list.
- `routers/agents.py` CRUD + publish (immutable `versions` sub-collection) in Firestore.
- `routers/runs.py` runs a draft or published agent for the test chat.
- `engine/flow.py` is the no-code **flow interpreter**: walks the canvas graph
  (`input → llm → condition → tool → approval → output`) and calls LiteLLM per step.
- `engine/deid.py` is the **option-B de-identification** step (Sensitive Data Protection
  `deidentify_content`, deterministic crypto with a KMS-wrapped key). Off by default in the
  sandbox (`DEID_ENABLED=false`) so you can smoke-test before creating the KMS key.
- `engine/llm.py` is the thin OpenAI-SDK client to LiteLLM, tagging each request with
  `agent_id`, `model_group` and `user` for spend attribution. Known gap: the trace shows the
  group alias, not the concrete model; read LiteLLM's `x-litellm-model-id` response header to fix.

**Frontend** (`frontend/src`) — Google sign-in gate, agent list, and the builder page:
left panel (name, description, instructions, model group, routing policy, connectors),
React Flow canvas in the center, test chat on the right.

## 3. Local development

```bash
# backend
cd backend && uv sync && cp .env.example .env
uv run uvicorn app.main:app --reload --port 8080
# frontend (proxies /api to :8080)
cd frontend && npm run dev
```

## 4. Hardening checklist before TCVGH data touches this
- [ ] `DEID_ENABLED=true` with a KMS key owned by TCVGH; test infoTypes on Chinese records.
- [ ] Add Cloud SQL + Redis to LiteLLM for virtual keys and per-agent budgets.
- [ ] Cloud Armor policy on an HTTPS load balancer in front of the backend.
- [ ] Org Policy `constraints/gcp.resourceLocations` = asia-east1 on the real project.
- [ ] VPC Service Controls perimeter; CMEK on Firestore / GCS.
- [ ] Enforce 2-Step Verification in Workspace Admin (platform admins at minimum).
