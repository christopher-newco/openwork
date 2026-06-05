# Property-Level Billing Deployment Testing Guide

## Step 1: Get Authentication Token

### Option A: From Browser (Easiest)
1. Open https://den-web-production.up.railway.app
2. Log in to your account
3. Open DevTools (F12 or Cmd+Option+I)
4. Go to: **Application** → **Cookies** → `https://den-web-production.up.railway.app`
5. Copy the value of `better-auth.session_token`

### Option B: Via API Login
```bash
# Login and extract token
curl -X POST https://den-api-production.up.railway.app/api/auth/sign-in/email \
  -H "Content-Type: application/json" \
  -d '{
    "email": "your-email@example.com",
    "password": "your-password"
  }' -c cookies.txt

# Extract token from cookies
cat cookies.txt | grep session_token
```

---

## Step 2: Test Health & Basic Endpoints

```bash
# Set your token
export AUTH_TOKEN="your_token_here"
export API_BASE="https://den-api-production.up.railway.app"

# 1. Health check
curl -s $API_BASE/health | jq

# Expected: {"ok":true,"service":"den-api"}
```

---

## Step 3: Create a Team with Property Billing Mode

```bash
# Create a property-billed team
curl -X POST $API_BASE/v1/teams \
  -H "Authorization: Bearer $AUTH_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Test Property - 123 Main Street",
    "billingMode": "property",
    "memberIds": []
  }' | jq

# Expected Response:
# {
#   "team": {
#     "id": "tem_xxxxx",
#     "organizationId": "org_xxxxx",
#     "name": "Test Property - 123 Main Street",
#     "billingMode": "property",  ← NEW FIELD!
#     "createdAt": "2026-06-04T...",
#     "updatedAt": "2026-06-04T...",
#     "memberIds": []
#   }
# }

# Save the team ID for next steps
export TEAM_ID="tem_xxxxx"  # Replace with actual ID from response
```

---

## Step 4: Test Team Billing Endpoints

### 4.1 Get Team Billing Status
```bash
curl -X GET $API_BASE/v1/teams/$TEAM_ID/billing \
  -H "Authorization: Bearer $AUTH_TOKEN" | jq

# Expected Response:
# {
#   "billing": {
#     "stripe": {
#       "configured": true,
#       "priceId": "price_xxxxx",
#       "unitAmount": 1000,
#       "currency": "usd",
#       "interval": "month",
#       "hasActiveSubscription": false,  ← No subscription yet
#       "portalUrl": null,
#       "subscription": null
#     }
#   }
# }
```

### 4.2 Create Team Checkout Session
```bash
curl -X POST $API_BASE/v1/teams/$TEAM_ID/billing/checkout \
  -H "Authorization: Bearer $AUTH_TOKEN" | jq

# Expected Response:
# {
#   "url": "https://checkout.stripe.com/c/pay/..."  ← Stripe checkout URL
# }

# This URL redirects to Stripe where you can:
# - Enter payment details
# - Create a subscription for THIS SPECIFIC TEAM
# - Bill a separate customer (property owner)
```

### 4.3 Get Team Billing Portal (after subscription)
```bash
# Only works if team has a subscription
curl -X POST $API_BASE/v1/teams/$TEAM_ID/billing/portal \
  -H "Authorization: Bearer $AUTH_TOKEN" | jq

# Expected Response:
# {
#   "url": "https://billing.stripe.com/p/session/..."  ← Stripe portal
# }
```

---

## Step 5: Verify Database Changes

### Check Migration Logs
Look for these in Railway logs:
```
✓ Running migration 0020_property_billing.sql
✓ Running migration 0021_inference_keys_team_id.sql
```

### Check Schema (via API)
```bash
# List all teams to verify billingMode field
curl -X GET $API_BASE/v1/teams \
  -H "Authorization: Bearer $AUTH_TOKEN" | jq

# All teams should now show billingMode field
```

---

## Step 6: Test Team Billing Mode Switch

```bash
# Update team billing mode
curl -X PATCH $API_BASE/v1/teams/$TEAM_ID \
  -H "Authorization: Bearer $AUTH_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "billingMode": "portfolio"
  }' | jq

# Expected: billingMode changed from "property" to "portfolio"

# Switch back to property
curl -X PATCH $API_BASE/v1/teams/$TEAM_ID \
  -H "Authorization: Bearer $AUTH_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "billingMode": "property"
  }' | jq
```

---

## Step 7: Test Admin Usage Reporting (Admin Only)

```bash
# Trigger usage reporting for all subscriptions
curl -X POST $API_BASE/v1/admin/report-usage \
  -H "Authorization: Bearer $AUTH_TOKEN" \
  -H "Content-Type: application/json" \
  -d "{
    \"startDate\": \"$(date -u -d '1 day ago' '+%Y-%m-%dT%H:%M:%SZ')\",
    \"endDate\": \"$(date -u '+%Y-%m-%dT%H:%M:%SZ')\",
    \"idempotencyKey\": \"test_$(date +%s)\"
  }" | jq

# Expected Response:
# {
#   "success": true,
#   "orgSubscriptions": 2,     ← Number of org-level subscriptions reported
#   "teamSubscriptions": 5,    ← Number of team-level subscriptions reported
#   "errors": []               ← Any errors encountered
# }
```

---

## Step 8: End-to-End Workflow Test

### Complete Property Billing Flow
1. **Create property team** (billingMode: "property")
2. **Create checkout session** for team
3. **Complete Stripe checkout** (use test card: 4242 4242 4242 4242)
4. **Verify subscription** created in Stripe dashboard
5. **Generate usage** with team-specific inference key
6. **Trigger usage reporting**
7. **Check Stripe invoice** for team usage

### Test Stripe Dashboard
1. Go to https://dashboard.stripe.com
2. Check **Customers** - should see new customer for team
3. Check **Subscriptions** - should see team subscription
4. Check **Usage** - should see metered usage records

---

## Expected Behaviors

### ✅ What Should Work

1. **Create team with property billing** - billingMode field present
2. **Update team billing mode** - switch between portfolio/property
3. **Get team billing status** - shows Stripe configuration
4. **Create team checkout** - generates Stripe URL
5. **Multiple teams per org** - each with own subscription
6. **Usage isolation** - team usage tracked separately
7. **Admin reporting** - batch report all subscriptions

### ⚠️ Expected Errors (These are OK)

1. **No subscription yet** - `stripe_customer_missing` (before checkout)
2. **Invalid team ID** - `team_not_found`
3. **Unauthorized** - `unauthorized` (without valid token)
4. **Admin only** - `/admin/report-usage` requires admin role

---

## Troubleshooting

### "stripe_customer_missing"
→ Team doesn't have a subscription yet
→ Create one via `/billing/checkout` endpoint

### "team_not_found"
→ Check TEAM_ID is correct
→ Verify team belongs to your organization

### "unauthorized"
→ Check AUTH_TOKEN is valid
→ Token may have expired, get new one

### No usage showing
→ Generate some inference requests first
→ Usage is tracked when using team-specific keys
→ Wait for daily reporting cron (or trigger manually)

---

## Success Criteria

✅ Team created with `billingMode: "property"`
✅ Team billing endpoints return valid responses
✅ Stripe checkout URL generated successfully
✅ Can switch team billing mode
✅ Admin usage reporting returns success
✅ Multiple teams can have separate subscriptions

---

## Next Steps After Testing

1. **Set up production Stripe** (if using test mode)
2. **Configure daily cron** for usage reporting
3. **Update UI** to show team billing options
4. **Document for users** how to set up property billing
5. **Monitor Stripe dashboard** for subscriptions and usage
