# Multi-Tenant OpenWork Setup

## Current Architecture (as of 2026-06-06)

### admin.soapbox.build
**Purpose:** Admin panel for managing organizations and users

**Features (Already Built):**
- ✅ User authentication via GitHub OAuth
- ✅ Organization creation and management
- ✅ Role-based access control (owner/admin/member)
- ✅ Member invitation and management
- ✅ Team creation and management
- ✅ Worker provisioning UI
- ✅ Billing management
- ✅ Custom LLM providers
- ✅ Desktop policies
- ✅ Plugins and skill hubs
- ✅ Integrations (GitHub, etc.)

**URL:** https://admin.soapbox.build  
**Status:** ✅ Deployed and functional (reverted from app redirect)

### app.soapbox.build
**Purpose:** Tenant application for end users

**Features:**
- ✅ Email/password authentication
- ✅ Auto-connect to predefined worker
- ✅ Session management
- ✅ OpenWork workspace interface

**Current Configuration:**
- `VITE_DEN_REQUIRE_SIGNIN=false`
- `VITE_PREDEFINED_WORKER_ID=wrk_01ktc2s5fmfer9zy3h2pr1nq6h`
- `VITE_DEN_BASE_URL=https://admin.soapbox.build`
- `VITE_DEN_API_BASE_URL=https://den-api-production-89bf.up.railway.app`

**URL:** https://app.soapbox.build  
**Status:** ✅ Deployed with simple auth

## Desired Multi-Tenant Flow

### 1. Super Admin (soapbox.build domain)
```
User: super-admin@soapbox.build
Access: admin.soapbox.build
Capabilities:
  - Create organizations
  - Assign org admins
  - View all orgs
  - Manage platform settings
```

### 2. Org Admin (per organization)
```
User: admin@acme.com (invited by super admin)
Access: admin.soapbox.build (filtered to their org)
Capabilities:
  - Invite team members
  - Create teams
  - Provision workers for their org
  - Manage org settings
  - View billing
```

### 3. Org Members (end users)
```
User: user@acme.com (invited by org admin)
Access: app.soapbox.build (or org-specific subdomain)
Capabilities:
  - Sign in with email/password
  - Connect to org's worker
  - Use OpenWork workspace
```

## Implementation Plan

### Phase 1: Super Admin Access ✅ (DONE)
- [x] Admin panel reverted to normal operation
- [x] No automatic redirect to app
- [x] Org creation flow exists
- [x] Member invitation exists

### Phase 2: Worker Provisioning Per Org (IN PROGRESS)
- [ ] Create worker when org is created
- [ ] Store worker ID in org metadata
- [ ] Allow org admins to manage their workers
- [ ] Display worker status in admin panel

### Phase 3: Multi-Tenant App Connection (TODO)
Option A: Single app with org-based worker lookup
- User signs in with email
- App queries Den API for user's org
- App connects to org's worker
- Pro: Simple deployment
- Con: Single shared domain

Option B: Per-org subdomains
- acme.app.soapbox.build → Acme's worker
- widgets.app.soapbox.build → Widgets Inc's worker
- Pro: Clear separation
- Con: More complex DNS/deployment

### Phase 4: Invitation & Onboarding (TODO)
- [ ] Super admin invites org admin via admin panel
- [ ] Org admin receives invitation email
- [ ] Org admin signs up and joins org
- [ ] Org admin can invite team members
- [ ] Team members receive invitation emails
- [ ] Team members sign up and access app

## Current Database Schema

### Organizations
- `id` - UUID
- `name` - Organization name
- `slug` - URL-friendly identifier
- `metadata` - JSON (can store worker IDs here)

### Org Members
- `id` - UUID
- `organizationId` - FK to organization
- `userId` - FK to user
- `role` - "owner" | "admin" | "member"

### Workers
- `workerId` - ULID (e.g., wrk_01ktc2s5fmfer9zy3h2pr1nq6h)
- `workerName` - Display name
- `status` - "ready" | "starting" | "stopped"
- `instanceUrl` - Worker URL
- `organizationId` - FK to organization (needs to be added)

## Next Steps

1. **Test Current Setup**
   - Visit admin.soapbox.build
   - Verify GitHub OAuth login works
   - Test org creation
   - Test member invitation

2. **Add Worker-Org Association**
   - Modify worker provisioning to link workers to orgs
   - Store org ID in worker metadata
   - Display workers per org in admin panel

3. **Configure App for Multi-Tenant**
   - Modify app sign-in to query user's org
   - Look up org's worker ID
   - Connect to correct worker based on org

4. **Testing**
   - Create test org "Acme Corp"
   - Provision worker for Acme
   - Invite test user to Acme
   - Test user login and worker connection

## Configuration Files

### Admin (ee/apps/den-web)
- No special config needed
- Uses Better Auth for GitHub OAuth
- Connects to Den API for org/worker management

### App (apps/app)
- `VITE_DEN_REQUIRE_SIGNIN=false` (use web-based auth)
- `VITE_DEN_BASE_URL` - Admin URL
- `VITE_DEN_API_BASE_URL` - Backend API
- `VITE_PREDEFINED_WORKER_ID` - Can be removed for multi-tenant
- `VITE_OPENWORK_DEPLOYMENT=web`

### Den API (railway-backend)
- Handles org/worker CRUD
- Enforces org membership on auth
- Returns user's org and worker info
