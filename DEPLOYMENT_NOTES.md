# OpenWork Multi-Tenant Deployment Notes

## Critical Information

### Repository
- **Source**: `christopher-newco/openwork` (NOT Audette-Analytics/openwork)
- **Main branch**: `main`

### Railway Project
- **Project ID**: `2ebd672b-41b6-428f-8501-acf1157b401e`
- **Environment ID**: `493f160c-38b4-47a9-a27b-6c13a9ce8cd8` (production)

### Railway API Tokens
- **Account-level token**: `f96db6d7-3eee-4db5-a71b-7d8e20f83a00`
- **Project-specific token**: `3151ea12-9f3f-49b1-a5d6-a6b65e1c0205`

### Railway SSH
- **IMPORTANT**: Use `ssh.railway.com` (NOT `ssh.railway.app`)
- **Format**: `ssh <deployment-url>@ssh.railway.com`
- **Host key**: Already added to `~/.ssh/known_hosts`

### Deployed Tenant: app.soapbox.build

**Worker ID**: `wrk_01ktc2s5fmfer9zy3h2pr1nq6h`

**Services**:
- **worker-app** (backend): `dff560db-31c5-406a-bc21-bbefdd8ff238`
- **app-app** (frontend): `d03ad034-a04d-4c69-8835-e45d9d42dd4f`

**Worker Tokens**:
- Host: `71b5921ddbb36897cab0bb4ec6c57d086477a4c1f297a91fc37427003a391958`
- Client: `a1d0d323e36752f36dc61227cb4691890cc7d52acd10c41aa1aae7945ab0af68`
- Owner: `71b5921ddbb36897cab0bb4ec6c57d086477a4c1f297a91fc37427003a391958`

**Environment Variables Set**:

Worker:
```
OPENWORK_TOKEN=a1d0d323e36752f36dc61227cb4691890cc7d52acd10c41aa1aae7945ab0af68
OPENWORK_HOST_TOKEN=71b5921ddbb36897cab0bb4ec6c57d086477a4c1f297a91fc37427003a391958
DEN_WORKER_ID=wrk_01ktc2s5fmfer9zy3h2pr1nq6h
DEN_API_URL=https://den-api-production-89bf.up.railway.app
RAILWAY_DOCKERFILE_PATH=packaging/docker/Dockerfile
NIXPACKS_NO_MUSL=1
```

App:
```
VITE_DEN_BASE_URL=https://admin.soapbox.build
VITE_DEN_API_BASE_URL=https://den-api-production-89bf.up.railway.app
VITE_DEN_REQUIRE_SIGNIN=true
VITE_PREDEFINED_WORKER_ID=wrk_01ktc2s5fmfer9zy3h2pr1nq6h
RAILWAY_DOCKERFILE_PATH=packaging/docker/Dockerfile.app
NIXPACKS_NO_MUSL=1
```

## Deployment Process

### 1. Register Worker with Orchestrator

```bash
export ORCHESTRATOR_AUTH_TOKEN="<get-from-mysql-session-table>"
node scripts/create-tenant-worker.mjs <tenant-name>
```

This creates worker in Den and returns:
- Worker ID
- Host/Client/Owner tokens
- Environment variable values

**Get auth token from MySQL**:
```bash
docker run --rm mysql:8 mysql \
  -h acela.proxy.rlwy.net \
  -P 37678 \
  -u root \
  -pYRsbUvJHKcnZRSavGIRgcozAvexTBFDF \
  railway \
  -e "SELECT token FROM session ORDER BY created_at DESC LIMIT 1;"
```

### 2. Create Railway Services

```bash
# Create worker service
curl -X POST https://backboard.railway.app/graphql/v2 \
  -H "Authorization: Bearer f96db6d7-3eee-4db5-a71b-7d8e20f83a00" \
  -H "Content-Type: application/json" \
  -d '{
    "query": "mutation { serviceCreate(input: { projectId: \"2ebd672b-41b6-428f-8501-acf1157b401e\", name: \"worker-<tenant>\", source: { repo: \"christopher-newco/openwork\", image: null } }) { id name } }"
  }'

# Create app service  
curl -X POST https://backboard.railway.app/graphql/v2 \
  -H "Authorization: Bearer f96db6d7-3eee-4db5-a71b-7d8e20f83a00" \
  -H "Content-Type: application/json" \
  -d '{
    "query": "mutation { serviceCreate(input: { projectId: \"2ebd672b-41b6-428f-8501-acf1157b401e\", name: \"app-<tenant>\", source: { repo: \"christopher-newco/openwork\", image: null } }) { id name } }"
  }'
```

### 3. Set Environment Variables

Use `variableCollectionUpsert` mutation with service IDs from step 2.

### 4. Deploy with Railway CLI

```bash
# Deploy worker
cp packaging/docker/railway-worker.json railway.json
RAILWAY_TOKEN="3151ea12-9f3f-49b1-a5d6-a6b65e1c0205" railway up --service <worker-service-id> --detach

# Deploy app
cp apps/app/railway.json railway.json
RAILWAY_TOKEN="3151ea12-9f3f-49b1-a5d6-a6b65e1c0205" railway up --service <app-service-id> --detach
```

### 5. Configure Build Settings in Railway Dashboard

For each service:
1. Settings → Build
2. Builder: Docker
3. Dockerfile Path:
   - Worker: `packaging/docker/Dockerfile`
   - App: `packaging/docker/Dockerfile.app`

### 6. Add Custom Domains

Railway Dashboard → Service → Settings → Networking:
- Worker: `worker-<tenant>.soapbox.build`
- App: `<tenant>.soapbox.build`

## MySQL Database Access

**Connection via Docker**:
```bash
docker run --rm mysql:8 mysql \
  -h acela.proxy.rlwy.net \
  -P 37678 \
  -u root \
  -pYRsbUvJHKcnZRSavGIRgcozAvexTBFDF \
  railway
```

**Connection String**:
```
mysql://root:YRsbUvJHKcnZRSavGIRgcozAvexTBFDF@acela.proxy.rlwy.net:37678/railway
```

## Troubleshooting

### SSH Connection Issues
- Always use `ssh.railway.com` (not `.app`)
- Port 22 must be open in GCP firewall
- Host key: `ssh-ed25519 SHA256:+S1xg92FrnHz6pY3bpkmh1OGtWQGNANXilPzlxA7B1g`

### Railway Deployment Failures
- Railway ignores `railway.json` by default with Railpack
- Set `RAILWAY_DOCKERFILE_PATH` environment variable
- Or configure in Dashboard: Settings → Build → Builder: Docker

### Railway CLI Authorization
- Account-level tokens work for GraphQL API
- Project-specific tokens work for `railway up`
- CLI `railway link` doesn't work with API tokens (requires interactive login)

## Service IDs Reference

### Den Services
- **MySQL**: `ef6a5051-47e1-480d-9e38-801559b6ae85`
- **den-api**: `e269b4d6-3f64-4fea-a1af-996e0a37edbb`
- **den-web**: `dbb9c9c3-0b89-4e9a-8ea7-8da53e4def41`

### Tenant Services (app.soapbox.build)
- **worker-app**: `dff560db-31c5-406a-bc21-bbefdd8ff238`
- **app-app**: `d03ad034-a04d-4c69-8835-e45d9d42dd4f`

## Quick Commands

**Get latest auth token**:
```bash
docker run --rm mysql:8 mysql -h acela.proxy.rlwy.net -P 37678 -u root -pYRsbUvJHKcnZRSavGIRgcozAvexTBFDF railway -e "SELECT token FROM session ORDER BY created_at DESC LIMIT 1;" 2>&1 | grep -v Warning | tail -1
```

**Check service status**:
```bash
curl -X POST https://backboard.railway.app/graphql/v2 \
  -H "Authorization: Bearer f96db6d7-3eee-4db5-a71b-7d8e20f83a00" \
  -H "Content-Type: application/json" \
  -d '{"query": "query { service(id: \"<service-id>\") { name deployments(first: 1) { edges { node { id status staticUrl } } } } }"}' | jq '.'
```

**SSH to deployment** (requires running deployment):
```bash
ssh <deployment-url>@ssh.railway.com
```
