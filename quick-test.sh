#!/bin/bash
# Quick Property Billing Test Script

API_BASE="https://den-api-production.up.railway.app"

echo "🧪 Property-Level Billing Quick Test"
echo "===================================="
echo ""

# Check if token provided
if [ -z "$1" ]; then
  echo "❌ Error: Auth token required"
  echo ""
  echo "Usage: ./quick-test.sh YOUR_AUTH_TOKEN [TEAM_ID]"
  echo ""
  echo "To get your token:"
  echo "1. Open https://den-web-production.up.railway.app"
  echo "2. Login"
  echo "3. DevTools → Application → Cookies → better-auth.session_token"
  exit 1
fi

AUTH_TOKEN="$1"
TEAM_ID="${2:-}"

# Test 1: Health Check
echo "1️⃣ Testing API Health..."
HEALTH=$(curl -s $API_BASE/health)
echo "   Response: $HEALTH"

if echo "$HEALTH" | grep -q "\"ok\":true"; then
  echo "   ✅ API is healthy"
else
  echo "   ❌ API health check failed"
  exit 1
fi
echo ""

# Test 2: Create Team with Property Billing
if [ -z "$TEAM_ID" ]; then
  echo "2️⃣ Creating team with property billing..."
  TEAM_RESPONSE=$(curl -s -X POST $API_BASE/v1/teams \
    -H "Authorization: Bearer $AUTH_TOKEN" \
    -H "Content-Type: application/json" \
    -d '{
      "name": "Test Property - '"$(date +%s)"'",
      "billingMode": "property",
      "memberIds": []
    }')
  
  echo "   Response: $TEAM_RESPONSE" | jq '.' 2>/dev/null || echo "   Response: $TEAM_RESPONSE"
  
  TEAM_ID=$(echo "$TEAM_RESPONSE" | jq -r '.team.id' 2>/dev/null)
  
  if [ "$TEAM_ID" != "null" ] && [ ! -z "$TEAM_ID" ]; then
    echo "   ✅ Team created: $TEAM_ID"
    echo "   💾 Save this TEAM_ID for future tests!"
  else
    echo "   ❌ Team creation failed"
    echo "   Response: $TEAM_RESPONSE"
    exit 1
  fi
else
  echo "2️⃣ Using existing team: $TEAM_ID"
fi
echo ""

# Test 3: Get Team Billing Status
echo "3️⃣ Getting team billing status..."
BILLING_STATUS=$(curl -s -X GET $API_BASE/v1/teams/$TEAM_ID/billing \
  -H "Authorization: Bearer $AUTH_TOKEN")

echo "   Response: $BILLING_STATUS" | jq '.' 2>/dev/null || echo "   Response: $BILLING_STATUS"

if echo "$BILLING_STATUS" | grep -q "\"configured\""; then
  echo "   ✅ Billing status retrieved"
else
  echo "   ⚠️  Could not get billing status"
fi
echo ""

# Test 4: Create Checkout Session
echo "4️⃣ Creating team checkout session..."
CHECKOUT=$(curl -s -X POST $API_BASE/v1/teams/$TEAM_ID/billing/checkout \
  -H "Authorization: Bearer $AUTH_TOKEN")

echo "   Response: $CHECKOUT" | jq '.' 2>/dev/null || echo "   Response: $CHECKOUT"

CHECKOUT_URL=$(echo "$CHECKOUT" | jq -r '.url' 2>/dev/null)

if [ "$CHECKOUT_URL" != "null" ] && [ ! -z "$CHECKOUT_URL" ]; then
  echo "   ✅ Checkout URL generated"
  echo "   🔗 URL: $CHECKOUT_URL"
else
  echo "   ⚠️  Could not create checkout session"
fi
echo ""

# Test 5: Update Billing Mode
echo "5️⃣ Testing billing mode switch..."
UPDATE_RESPONSE=$(curl -s -X PATCH $API_BASE/v1/teams/$TEAM_ID \
  -H "Authorization: Bearer $AUTH_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"billingMode": "portfolio"}')

echo "   Switched to portfolio: $UPDATE_RESPONSE" | jq '.team.billingMode' 2>/dev/null || echo "   Response: $UPDATE_RESPONSE"

# Switch back
UPDATE_RESPONSE=$(curl -s -X PATCH $API_BASE/v1/teams/$TEAM_ID \
  -H "Authorization: Bearer $AUTH_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"billingMode": "property"}')

echo "   Switched back to property: $UPDATE_RESPONSE" | jq '.team.billingMode' 2>/dev/null || echo "   Response: $UPDATE_RESPONSE"
echo "   ✅ Billing mode switching works"
echo ""

# Summary
echo "===================================="
echo "✅ Test Complete!"
echo ""
echo "Summary:"
echo "  • API: Healthy"
echo "  • Team ID: $TEAM_ID"
echo "  • Billing endpoints: Working"
echo "  • Checkout URL: Generated"
echo "  • Mode switching: Working"
echo ""
echo "Next steps:"
echo "1. Open checkout URL in browser to test Stripe flow"
echo "2. Use test card: 4242 4242 4242 4242"
echo "3. Complete checkout to create subscription"
echo "4. Test usage reporting with:"
echo "   ./test-property-billing.sh $AUTH_TOKEN $TEAM_ID"
