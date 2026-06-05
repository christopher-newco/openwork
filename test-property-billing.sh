#!/bin/bash
# Test Property-Level Billing Endpoints
# Usage: ./test-property-billing.sh <AUTH_TOKEN> <ORG_ID> <TEAM_ID>

API_BASE="https://den-api-production.up.railway.app"
AUTH_TOKEN="${1:-YOUR_AUTH_TOKEN}"
ORG_ID="${2:-org_xxx}"
TEAM_ID="${3:-tem_xxx}"

echo "🔍 Testing Property-Level Billing Implementation"
echo "API Base: $API_BASE"
echo ""

# 1. Create a team with property billing mode
echo "1️⃣ Creating team with property billing..."
curl -X POST "$API_BASE/v1/teams" \
  -H "Authorization: Bearer $AUTH_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "123 Main Street Property",
    "billingMode": "property",
    "memberIds": []
  }' | jq
echo ""

# 2. Get team billing status
echo "2️⃣ Getting team billing status..."
curl -X GET "$API_BASE/v1/teams/$TEAM_ID/billing" \
  -H "Authorization: Bearer $AUTH_TOKEN" | jq
echo ""

# 3. Create team checkout session
echo "3️⃣ Creating team checkout session..."
curl -X POST "$API_BASE/v1/teams/$TEAM_ID/billing/checkout" \
  -H "Authorization: Bearer $AUTH_TOKEN" | jq
echo ""

# 4. Get team billing portal
echo "4️⃣ Getting team billing portal URL..."
curl -X POST "$API_BASE/v1/teams/$TEAM_ID/billing/portal" \
  -H "Authorization: Bearer $AUTH_TOKEN" | jq
echo ""

# 5. Trigger usage reporting (admin only)
echo "5️⃣ Triggering usage reporting (admin endpoint)..."
curl -X POST "$API_BASE/v1/admin/report-usage" \
  -H "Authorization: Bearer $AUTH_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "startDate": "'$(date -u -d '1 day ago' +%Y-%m-%dT%H:%M:%SZ)'",
    "endDate": "'$(date -u +%Y-%m-%dT%H:%M:%SZ)'",
    "idempotencyKey": "test_'$(date +%s)'"
  }' | jq
echo ""

echo "✅ Testing complete!"
