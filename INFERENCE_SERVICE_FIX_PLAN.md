# Inference Service Fix & Deployment Plan

**Date**: 2026-06-05  
**Goal**: Enable metered and prepaid AI access through OpenWork Inference

## Overview

The inference service provides:
- **LLM API proxy** through OpenRouter
- **Usage metering** and credits system
- **Billing integration** with Stripe
- **Model catalog** management
- **Usage webhooks** for tracking

## Current Status

❌ Service is deployed but not configured  
❌ Missing environment variables  
❌ Not connected to admin portal  
❌ No public domain configured  

## Architecture

```
User → Admin Portal → Inference Service → OpenRouter → LLM Providers
       (Dashboard)      (Proxy + Metering)   (API Gateway)   (Claude, GPT-4, etc)
                              ↓
                         Database
                      (Credits, Usage)
                              ↓
                          Webhooks
                       (Billing Events)
```

## Required Environment Variables

### Critical (Must Set)

```bash
# Database connection (same as den-api)
DATABASE_URL=mysql://root:Uf8BmZoLjY8qqfMXZbax@containers-us-west-2.railway.app:6030/railway

# Database mode
DB_MODE=mysql

# Encryption key (generate new 32+ char secret)
DEN_DB_ENCRYPTION_KEY=<generate-secure-key-32-chars-min>

# Admin authentication token (for management API)
INFERENCE_ADMIN_TOKEN=<generate-secure-token>

# Webhook signature secret (for billing webhooks)
INFERENCE_WEBHOOK_SECRET=<generate-secure-secret>
```

### Optional (Defaults OK for now)

```bash
# Service port
PORT=8791

# CORS origins
CORS_ORIGINS=https://admin.soapbox.build,https://app.soapbox.build

# Public URL for the service
INFERENCE_PROXY_BASE_URL=https://inference.soapbox.build

# OpenRouter API endpoint
OPENROUTER_UPSTREAM_URL=https://openrouter.ai/api/v1

# Credits per dollar (1M = $0.000001 per credit)
INFERENCE_CREDITS_PER_DOLLAR=1000000
```

## Setup Steps

### 1. Generate Secrets

```bash
# Generate encryption key (32 characters minimum)
openssl rand -base64 32

# Generate admin token
openssl rand -hex 32

# Generate webhook secret
openssl rand -hex 32
```

### 2. Configure Railway Service

In Railway dashboard → inference service → Variables:

```bash
DATABASE_URL=mysql://root:Uf8BmZoLjY8qqfMXZbax@containers-us-west-2.railway.app:6030/railway
DB_MODE=mysql
DEN_DB_ENCRYPTION_KEY=<paste-generated-key>
INFERENCE_ADMIN_TOKEN=<paste-generated-token>
INFERENCE_WEBHOOK_SECRET=<paste-generated-secret>
CORS_ORIGINS=https://admin.soapbox.build,https://app.soapbox.build
PORT=8791
```

### 3. Add Custom Domain

In Railway → inference service → Settings → Networking:
- Click "Generate Domain" or "Custom Domain"
- Recommended: `inference.soapbox.build`
- Add to environment: `INFERENCE_PROXY_BASE_URL=https://inference.soapbox.build`

### 4. Deploy Service

Railway will auto-deploy after setting variables.

Monitor deployment:
- Check logs for errors
- Test health endpoint: `curl https://inference.soapbox.build/health`
- Should return: `{"ok":true,"service":"inference"}`

### 5. Configure OpenRouter API Key

**Option A: Organization-level key (recommended)**

Store in `den-api` environment variables:
```bash
OPENROUTER_API_KEY=<your-openrouter-api-key>
```

**Option B: Database storage**

Insert into `inference_provider_key` table:
```sql
INSERT INTO inference_provider_key (
  id, 
  organization_id, 
  provider, 
  api_key, 
  status,
  created_at,
  updated_at
) VALUES (
  'ipkey_<generate-id>',
  '<your-org-id>',
  'openrouter',
  '<encrypted-openrouter-key>',
  'active',
  NOW(),
  NOW()
);
```

### 6. Set Up Credits System

**Option A: Free credits for testing**

```sql
-- Give org 10,000 free credits ($10 worth at default rate)
INSERT INTO inference_credit_balance (
  id,
  organization_id,
  balance_credits,
  created_at,
  updated_at
) VALUES (
  'icbal_<generate-id>',
  '<your-org-id>',
  10000000000,  -- 10,000 credits * 1M scale
  NOW(),
  NOW()
);
```

**Option B: Stripe prepaid credits**

Integrate with existing Stripe billing:
```typescript
// In den-api webhook handler
stripe.webhooks.onPaymentSuccess(async (payment) => {
  const credits = payment.amount * CREDITS_PER_DOLLAR;
  await addCredits(payment.organizationId, credits);
});
```

### 7. Integrate with Admin Portal

Add inference dashboard link to admin portal navigation:

```typescript
// In den-web admin navigation
{
  label: "AI Inference",
  href: "/dashboard/inference",
  icon: ZapIcon
}
```

Create inference dashboard page at `ee/apps/den-web/app/(admin)/dashboard/inference/page.tsx`:

```tsx
import { InferenceDashboard } from "@/components/inference-dashboard";

export default function InferencePage() {
  return <InferenceDashboard />;
}
```

### 8. Configure Model Catalog

The inference service uses a model catalog that maps friendly names to OpenRouter models.

Check available models:
```bash
curl https://inference.soapbox.build/models/api.json
```

Models are defined in `ee/apps/inference/models-site/models/api.json`.

### 9. Set Up Usage Webhooks (Optional)

For real-time billing events, configure webhook endpoint in den-api:

```typescript
// ee/apps/den-api/src/routes/webhooks/inference.ts
app.post("/webhooks/inference/usage", async (c) => {
  const signature = c.req.header("x-webhook-signature");
  const body = await c.req.json();
  
  // Verify signature
  if (!verifyWebhookSignature(body, signature, INFERENCE_WEBHOOK_SECRET)) {
    return c.json({ error: "invalid_signature" }, 401);
  }
  
  // Process usage event
  await processInferenceUsage(body);
  
  return c.json({ ok: true });
});
```

## Testing

### 1. Health Check

```bash
curl https://inference.soapbox.build/health
# Expected: {"ok":true,"service":"inference"}
```

### 2. Test API Proxy

Create an inference API key in the database:

```sql
INSERT INTO inference_key (
  id,
  organization_id,
  org_membership_id,
  key_hash,
  status,
  created_at,
  updated_at
) VALUES (
  'ikey_test123',
  '<your-org-id>',
  '<your-member-id>',
  SHA2('test-key-123', 256),
  'active',
  NOW(),
  NOW()
);
```

Test the proxy:

```bash
curl https://inference.soapbox.build/v1/chat/completions \
  -H "Authorization: Bearer test-key-123" \
  -H "Content-Type: application/json" \
  -d '{
    "model": "claude-3.5-sonnet",
    "messages": [{"role": "user", "content": "Hello!"}],
    "max_tokens": 100
  }'
```

Should return Claude response and deduct credits.

### 3. Check Credits Usage

```sql
SELECT 
  balance_credits / 1000000 as credits_dollars,
  total_spent_credits / 1000000 as spent_dollars
FROM inference_credit_balance
WHERE organization_id = '<your-org-id>';
```

## Integration with Existing Billing

Since you already have metered billing set up (commit `reference_openwork_den_billing.md`), integrate inference credits:

### 1. Stripe Product for Credits

```bash
# Create Stripe product for prepaid credits
stripe products create \
  --name "AI Inference Credits" \
  --description "Prepaid credits for OpenWork AI inference"

# Create price tiers
stripe prices create \
  --product prod_XXX \
  --unit_amount 1000 \  # $10
  --currency usd \
  --nickname "10-dollars"
```

### 2. Purchase Flow

```typescript
// When user buys credits
app.post("/api/credits/purchase", async (c) => {
  const { amount } = await c.req.json();
  
  // Create Stripe checkout
  const session = await stripe.checkout.sessions.create({
    mode: "payment",
    line_items: [{
      price: getPriceForAmount(amount),
      quantity: 1
    }],
    success_url: `${BASE_URL}/dashboard/inference?purchase=success`,
    metadata: {
      organizationId: org.id,
      creditsAmount: amount * CREDITS_PER_DOLLAR
    }
  });
  
  return c.json({ checkoutUrl: session.url });
});

// Webhook handler
stripe.webhooks.onCheckoutComplete(async (session) => {
  await addCredits(
    session.metadata.organizationId,
    Number(session.metadata.creditsAmount)
  );
});
```

### 3. Usage Metering

Inference service automatically meters usage via webhooks. Connect to existing metering:

```typescript
// In den-api webhook handler
app.post("/webhooks/inference/usage", async (c) => {
  const event = await c.req.json();
  
  // Record in Stripe for billing analytics
  await stripe.billing.meterEvents.create({
    event_name: "inference_tokens",
    payload: {
      value: event.totalTokens,
      stripe_customer_id: event.customerId
    },
    identifier: event.requestId,
    timestamp: event.timestamp
  });
  
  return c.json({ ok: true });
});
```

## Pricing Strategy

### Credits Model

```
1 credit = $0.000001 (1 millionth of a dollar)
1,000,000 credits = $1.00
```

### Example Pricing

**Model costs** (from OpenRouter):
- Claude 3.5 Sonnet: ~$3/M input, ~$15/M output tokens
- GPT-4: ~$30/M input, ~$60/M output tokens

**Your markup** (20% example):
- Claude 3.5 Sonnet: $3.60/M input, $18/M output
- GPT-4: $36/M input, $72/M output

**Credits deduction**:
- 1K input tokens on Claude = 3,600 credits = $0.0036
- 1K output tokens on Claude = 18,000 credits = $0.018

### Prepaid Packages

```
Starter: $10 → 10,000,000 credits
Pro: $50 → 50,000,000 credits + 10% bonus
Enterprise: $500 → 500,000,000 credits + 20% bonus
```

## Monitoring

### Key Metrics to Track

```sql
-- Daily usage by org
SELECT 
  DATE(created_at) as date,
  organization_id,
  SUM(total_tokens) as tokens,
  SUM(credits_charged) / 1000000 as revenue_dollars,
  COUNT(*) as requests
FROM inference_usage_log
GROUP BY DATE(created_at), organization_id
ORDER BY date DESC;

-- Top users
SELECT 
  org_membership_id,
  SUM(total_tokens) as tokens,
  SUM(credits_charged) / 1000000 as spent_dollars
FROM inference_usage_log
WHERE created_at > DATE_SUB(NOW(), INTERVAL 30 DAY)
GROUP BY org_membership_id
ORDER BY spent_dollars DESC
LIMIT 10;

-- Model distribution
SELECT 
  model_alias,
  COUNT(*) as requests,
  AVG(total_tokens) as avg_tokens
FROM inference_usage_log
WHERE created_at > DATE_SUB(NOW(), INTERVAL 7 DAY)
GROUP BY model_alias
ORDER BY requests DESC;
```

### Alerts

Set up Railway alerts for:
- Low credit balances (< $1 remaining)
- High error rates (> 5%)
- Slow response times (> 10s p95)

## Security Considerations

### API Key Management

- API keys are hashed in database (SHA-256)
- Never log full API keys
- Rotate keys periodically
- Support key expiration dates

### Rate Limiting

Already implemented in proxy.ts:
- Anonymous: 60 req/min
- Authenticated: 240 req/min
- Write operations: 60 req/min

### Access Control

- Keys scoped to organization
- Can restrict by org member
- Support read-only keys

## Cost Optimization

### 1. Model Routing

Route cheaper models for simple tasks:
```typescript
if (message.length < 100 && !requiresReasoning) {
  model = "claude-3-haiku";  // Cheaper
} else {
  model = "claude-3.5-sonnet";
}
```

### 2. Response Caching

Cache common queries:
```typescript
const cacheKey = hash(model + prompt);
const cached = await redis.get(cacheKey);
if (cached) return cached;
```

### 3. Token Limits

Enforce reasonable defaults:
```typescript
const maxTokens = Math.min(
  requestedTokens,
  DEFAULT_MAX_TOKENS[model]
);
```

## Troubleshooting

### Service won't start

**Error**: `DEN_DB_ENCRYPTION_KEY is required`
- Fix: Set encryption key in Railway variables (min 32 chars)

**Error**: `DATABASE_URL is required in mysql mode`
- Fix: Set DATABASE_URL or configure planetscale credentials

### Proxy returning 401

**Check**:
```sql
SELECT * FROM inference_key WHERE key_hash = SHA2('your-test-key', 256);
```
- Ensure key exists and status = 'active'
- Check organization_id matches

### Credits not deducting

**Check**:
```sql
SELECT * FROM inference_credit_balance WHERE organization_id = '<org-id>';
```
- Ensure balance exists and has credits
- Check usage_log for failed deduction attempts

### OpenRouter errors

**Check**:
- OpenRouter API key is valid
- Key has sufficient credits
- Model name is correct in catalog

**Debug**:
```bash
# Check logs
railway logs --service inference

# Test OpenRouter directly
curl https://openrouter.ai/api/v1/chat/completions \
  -H "Authorization: Bearer $OPENROUTER_KEY" \
  -d '{"model":"anthropic/claude-3.5-sonnet","messages":[{"role":"user","content":"test"}]}'
```

## Next Steps After Fix

1. ✅ Deploy and test inference service
2. ✅ Create admin dashboard UI
3. ✅ Add credit purchase flow
4. ✅ Set up usage webhooks
5. ✅ Configure monitoring alerts
6. ✅ Document API for users
7. ✅ Add to tenant app (optional)

## Success Criteria

- [ ] Health check returns 200
- [ ] Can make authenticated API calls
- [ ] Credits deduct correctly
- [ ] Usage logs to database
- [ ] Webhooks trigger on usage
- [ ] Stripe integration working
- [ ] Admin dashboard shows usage
- [ ] Rate limits enforced

## Timeline Estimate

- **Setup (30 min)**: Generate secrets, configure Railway
- **Deploy (5 min)**: Railway auto-deploy
- **Testing (15 min)**: Health check, API test, credits test
- **Integration (1 hour)**: Admin dashboard, purchase flow
- **Monitoring (30 min)**: Set up alerts, dashboards

**Total**: ~2.5 hours to get fully operational

## Files to Create/Modify

New files:
- `ee/apps/den-web/app/(admin)/dashboard/inference/page.tsx`
- `ee/apps/den-web/components/inference-dashboard.tsx`
- `ee/apps/den-api/src/routes/webhooks/inference.ts`

Modify:
- `ee/apps/den-web/app/(admin)/layout.tsx` - Add nav item
- Railway service environment variables

## Reference

- Inference service code: `ee/apps/inference/`
- Database schema: `ee/packages/den-db/src/schema/inference.ts`
- Model catalog: `ee/apps/inference/models-site/models/api.json`
- Billing system: Reference in memory at `reference_openwork_den_billing.md`
