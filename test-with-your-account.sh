#!/bin/bash
# Interactive Property Billing Test with Your Account

echo "🎯 Property-Level Billing Test - Your Account"
echo "=============================================="
echo ""

# Step 1: Get token
if [ -z "$1" ]; then
  echo "📋 STEP 1: Get Your Auth Token"
  echo ""
  echo "1. Open: https://den-web-production.up.railway.app"
  echo "2. Log in to your account"
  echo "3. Open DevTools (F12)"
  echo "4. Go to Application → Cookies"
  echo "5. Copy the value of: better-auth.session_token"
  echo ""
  echo "Then run this script again with your token:"
  echo "./test-with-your-account.sh YOUR_TOKEN_HERE"
  echo ""
  exit 0
fi

AUTH_TOKEN="$1"
API_BASE="https://den-api-production.up.railway.app"

echo "✅ Using your auth token"
echo ""

# Step 2: Verify authentication
echo "📋 STEP 2: Verifying your authentication..."
ME=$(curl -s "$API_BASE/v1/me" -H "Authorization: Bearer $AUTH_TOKEN")

if echo "$ME" | grep -q "error"; then
  echo "❌ Authentication failed. Token may be invalid or expired."
  echo "Response: $ME"
  echo ""
  echo "Try getting a fresh token:"
  echo "1. Log out of Den Web"
  echo "2. Log back in"
  echo "3. Get the session token again"
  exit 1
fi

USER_EMAIL=$(echo "$ME" | jq -r '.user.email // .email // "unknown"')
echo "✅ Authenticated as: $USER_EMAIL"
echo ""

# Step 3: Check organizations
echo "📋 STEP 3: Checking your organizations..."
ORGS=$(curl -s "$API_BASE/v1/organizations" -H "Authorization: Bearer $AUTH_TOKEN")

if echo "$ORGS" | grep -q "error"; then
  echo "⚠️  No organizations found or access denied"
  echo "Response: $ORGS"
  echo ""
  echo "You may need to create an organization first."
  exit 1
fi

ORG_COUNT=$(echo "$ORGS" | jq '.organizations | length // 0')
echo "✅ Found $ORG_COUNT organization(s)"
echo ""

if [ "$ORG_COUNT" -eq 0 ]; then
  echo "❌ You need at least one organization to test team billing."
  echo "Please create an organization in Den Web first."
  exit 1
fi

# Step 4: Create property-billed team
echo "📋 STEP 4: Creating a property-billed team..."
echo "Creating: 'Test Property - $(date +%s)'"
echo ""

TEAM_RESPONSE=$(curl -s -X POST "$API_BASE/v1/teams" \
  -H "Authorization: Bearer $AUTH_TOKEN" \
  -H "Content-Type: application/json" \
  -d "{
    \"name\": \"Test Property - $(date +%s)\",
    \"billingMode\": \"property\",
    \"memberIds\": []
  }")

echo "$TEAM_RESPONSE" | jq '.'

TEAM_ID=$(echo "$TEAM_RESPONSE" | jq -r '.team.id // empty')
BILLING_MODE=$(echo "$TEAM_RESPONSE" | jq -r '.team.billingMode // empty')

if [ -z "$TEAM_ID" ]; then
  echo "❌ Failed to create team"
  echo "Error: $(echo "$TEAM_RESPONSE" | jq -r '.error // .message // "Unknown error"')"
  exit 1
fi

echo ""
echo "✅ Team created successfully!"
echo "   ID: $TEAM_ID"
echo "   Billing Mode: $BILLING_MODE ⭐ NEW FEATURE!"
echo ""

# Step 5: Get team billing status
echo "📋 STEP 5: Checking team billing status..."
BILLING=$(curl -s "$API_BASE/v1/teams/$TEAM_ID/billing" \
  -H "Authorization: Bearer $AUTH_TOKEN")

echo "$BILLING" | jq '.'
echo ""

HAS_SUBSCRIPTION=$(echo "$BILLING" | jq -r '.billing.stripe.hasActiveSubscription // false')
echo "Has active subscription: $HAS_SUBSCRIPTION"
echo "(Expected: false - we haven't created one yet)"
echo ""

# Step 6: Create checkout session
echo "📋 STEP 6: Creating Stripe checkout session..."
CHECKOUT=$(curl -s -X POST "$API_BASE/v1/teams/$TEAM_ID/billing/checkout" \
  -H "Authorization: Bearer $AUTH_TOKEN")

CHECKOUT_URL=$(echo "$CHECKOUT" | jq -r '.url // empty')

if [ -z "$CHECKOUT_URL" ]; then
  echo "⚠️  Could not create checkout session"
  echo "Error: $(echo "$CHECKOUT" | jq -r '.error // .message // "Unknown error"')"
  echo ""
  echo "This usually means Stripe is not configured yet."
  echo "You'll need to set up Stripe environment variables in Railway."
else
  echo "✅ Checkout URL generated!"
  echo ""
  echo "🔗 Stripe Checkout URL:"
  echo "$CHECKOUT_URL"
  echo ""
  echo "Open this URL to:"
  echo "  • Enter payment details"
  echo "  • Create a subscription for THIS specific team"
  echo "  • Bill separately from your organization subscription"
fi
echo ""

# Step 7: Test billing mode switch
echo "📋 STEP 7: Testing billing mode switch..."
echo "Switching to 'portfolio' mode..."

UPDATE1=$(curl -s -X PATCH "$API_BASE/v1/teams/$TEAM_ID" \
  -H "Authorization: Bearer $AUTH_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"billingMode": "portfolio"}')

MODE1=$(echo "$UPDATE1" | jq -r '.team.billingMode // empty')
echo "   Current mode: $MODE1"

echo "Switching back to 'property' mode..."

UPDATE2=$(curl -s -X PATCH "$API_BASE/v1/teams/$TEAM_ID" \
  -H "Authorization: Bearer $AUTH_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"billingMode": "property"}')

MODE2=$(echo "$UPDATE2" | jq -r '.team.billingMode // empty')
echo "   Current mode: $MODE2"

if [ "$MODE1" = "portfolio" ] && [ "$MODE2" = "property" ]; then
  echo "✅ Billing mode switching works!"
else
  echo "⚠️  Billing mode switch issue"
fi
echo ""

# Summary
echo "=============================================="
echo "✅ TEST COMPLETE!"
echo ""
echo "Summary:"
echo "  ✅ Authenticated as: $USER_EMAIL"
echo "  ✅ Organization access verified"
echo "  ✅ Property-billed team created"
echo "  ✅ Team billing status retrieved"
echo "  ✅ Billing mode switching tested"
if [ ! -z "$CHECKOUT_URL" ]; then
  echo "  ✅ Stripe checkout URL generated"
else
  echo "  ⚠️  Stripe checkout (needs configuration)"
fi
echo ""
echo "Your Test Team:"
echo "  ID: $TEAM_ID"
echo "  Name: Test Property - $(date +%s)"
echo "  Billing Mode: property"
echo ""

if [ ! -z "$CHECKOUT_URL" ]; then
  echo "Next Steps:"
  echo "  1. Open the checkout URL in your browser"
  echo "  2. Use test card: 4242 4242 4242 4242"
  echo "  3. Complete the checkout"
  echo "  4. Verify subscription in Stripe dashboard"
  echo ""
fi

echo "Want to test more? Run:"
echo "./test-property-billing.sh $AUTH_TOKEN $TEAM_ID"
