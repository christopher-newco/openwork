#!/bin/bash
# Daily Usage Reporting Cron Job for Property-Level Billing

API_BASE="https://den-api-production.up.railway.app"
ADMIN_TOKEN="${DEN_ADMIN_TOKEN:-}"

if [ -z "$ADMIN_TOKEN" ]; then
  echo "ERROR: DEN_ADMIN_TOKEN environment variable not set"
  echo "Export it before running: export DEN_ADMIN_TOKEN=your_token_here"
  exit 1
fi

# Calculate date range (yesterday 00:00 to today 00:00 UTC)
START_DATE=$(date -u -d '1 day ago' '+%Y-%m-%dT00:00:00Z')
END_DATE=$(date -u '+%Y-%m-%dT00:00:00Z')
IDEMPOTENCY_KEY="daily_$(date -u '+%Y%m%d')"

echo "=============================================="
echo "Usage Reporting for Property-Level Billing"
echo "=============================================="
echo "Period: $START_DATE to $END_DATE"
echo "Idempotency Key: $IDEMPOTENCY_KEY"
echo ""

# Call the API
RESPONSE=$(curl -s -w "\n%{http_code}" -X POST "$API_BASE/v1/admin/report-usage" \
  -H "Authorization: Bearer $ADMIN_TOKEN" \
  -H "Content-Type: application/json" \
  -d "{
    \"startDate\": \"$START_DATE\",
    \"endDate\": \"$END_DATE\",
    \"idempotencyKey\": \"$IDEMPOTENCY_KEY\"
  }")

# Split response body and HTTP code
HTTP_BODY=$(echo "$RESPONSE" | head -n -1)
HTTP_CODE=$(echo "$RESPONSE" | tail -n 1)

echo "HTTP Status: $HTTP_CODE"
echo "Response Body:"
echo "$HTTP_BODY" | jq '.' 2>/dev/null || echo "$HTTP_BODY"
echo ""

# Check HTTP status
if [ "$HTTP_CODE" != "200" ]; then
  echo "❌ Request failed with HTTP $HTTP_CODE"
  exit 1
fi

# Check for success in response
SUCCESS=$(echo "$HTTP_BODY" | jq -r '.success // false')

if [ "$SUCCESS" = "true" ]; then
  ORG_SUBS=$(echo "$HTTP_BODY" | jq -r '.orgSubscriptions // 0')
  TEAM_SUBS=$(echo "$HTTP_BODY" | jq -r '.teamSubscriptions // 0')
  ERRORS=$(echo "$HTTP_BODY" | jq -r '.errors | length // 0')
  
  echo "✅ Usage reporting completed successfully!"
  echo ""
  echo "Summary:"
  echo "  Organization subscriptions reported: $ORG_SUBS"
  echo "  Team subscriptions reported: $TEAM_SUBS"
  echo "  Total subscriptions: $((ORG_SUBS + TEAM_SUBS))"
  echo "  Errors: $ERRORS"
  
  if [ "$ERRORS" -gt 0 ]; then
    echo ""
    echo "⚠️  Errors encountered:"
    echo "$HTTP_BODY" | jq -r '.errors[]'
    exit 1
  fi
  
  echo ""
  echo "Next run: $(date -u -d 'tomorrow 2:00' '+%Y-%m-%d %H:%M:%S UTC')"
else
  echo "❌ Usage reporting failed!"
  echo "$HTTP_BODY"
  exit 1
fi
