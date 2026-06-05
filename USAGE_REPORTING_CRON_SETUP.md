# Usage Reporting Cron Job Setup

## Overview

Property-level billing requires daily usage reporting to Stripe. This cron job aggregates usage for all teams and reports it to their respective Stripe subscriptions.

---

## What It Does

The `/v1/admin/report-usage` endpoint:
1. Finds all active subscriptions (org-level + team-level)
2. Aggregates usage for each subscription
3. Reports usage to Stripe with idempotency
4. Returns summary of reported subscriptions

---

## Option 1: Railway Cron (Recommended)

### **Setup via Railway Dashboard**

1. **Go to Railway Project:**
   ```
   https://railway.app/project/e877a57e-161f-4f3a-a5b8-430250cccd47
   ```

2. **Create New Service:**
   - Click **+ New**
   - Select **Empty Service**
   - Name it: `den-usage-reporter`

3. **Configure Cron:**
   - Add environment variable:
     ```
     CRON_SCHEDULE=0 2 * * *
     ```
   - This runs at 2am UTC daily

4. **Add Start Command:**
   Create a simple cron runner script in your repo:
   ```dockerfile
   # Dockerfile for cron service
   FROM alpine:3.18
   
   RUN apk add --no-cache curl jq
   
   COPY report-usage-cron.sh /app/
   RUN chmod +x /app/report-usage-cron.sh
   
   CMD ["/app/report-usage-cron.sh"]
   ```

---

## Option 2: External Cron Service

### **Using EasyCron (Free)**

1. **Sign up:** https://www.easycron.com
2. **Create new cron job:**
   - **URL:** Your webhook URL (see below)
   - **Schedule:** `0 2 * * *` (2am daily)
   - **Method:** POST
   - **Headers:** Authorization + Content-Type

### **Using GitHub Actions**

Create `.github/workflows/report-usage.yml`:

```yaml
name: Daily Usage Reporting

on:
  schedule:
    - cron: '0 2 * * *'  # 2am UTC daily
  workflow_dispatch:  # Allow manual trigger

jobs:
  report-usage:
    runs-on: ubuntu-latest
    steps:
      - name: Report Usage to Stripe
        run: |
          curl -X POST https://den-api-production.up.railway.app/v1/admin/report-usage \
            -H "Authorization: Bearer ${{ secrets.DEN_ADMIN_TOKEN }}" \
            -H "Content-Type: application/json" \
            -d "{
              \"startDate\": \"$(date -u -d '1 day ago' '+%Y-%m-%dT00:00:00Z')\",
              \"endDate\": \"$(date -u '+%Y-%m-%dT00:00:00Z')\",
              \"idempotencyKey\": \"daily_$(date -u '+%Y%m%d')\"
            }"
```

Add `DEN_ADMIN_TOKEN` to GitHub Secrets:
- Go to repo **Settings** → **Secrets**
- Add secret: `DEN_ADMIN_TOKEN` = your admin auth token

---

## Option 3: Manual Cron Script

### **Create Cron Script**

```bash
cat > /home/claude/openwork/report-usage-cron.sh << 'EOF'
#!/bin/bash
# Daily Usage Reporting Cron Job

API_BASE="https://den-api-production.up.railway.app"
ADMIN_TOKEN="${DEN_ADMIN_TOKEN:-}"

if [ -z "$ADMIN_TOKEN" ]; then
  echo "ERROR: DEN_ADMIN_TOKEN not set"
  exit 1
fi

# Calculate date range (yesterday)
START_DATE=$(date -u -d '1 day ago' '+%Y-%m-%dT00:00:00Z')
END_DATE=$(date -u '+%Y-%m-%dT00:00:00Z')
IDEMPOTENCY_KEY="daily_$(date -u '+%Y%m%d')"

echo "Reporting usage for period: $START_DATE to $END_DATE"
echo "Idempotency key: $IDEMPOTENCY_KEY"

# Call the API
RESPONSE=$(curl -s -X POST "$API_BASE/v1/admin/report-usage" \
  -H "Authorization: Bearer $ADMIN_TOKEN" \
  -H "Content-Type: application/json" \
  -d "{
    \"startDate\": \"$START_DATE\",
    \"endDate\": \"$END_DATE\",
    \"idempotencyKey\": \"$IDEMPOTENCY_KEY\"
  }")

echo "Response: $RESPONSE"

# Check for success
SUCCESS=$(echo "$RESPONSE" | jq -r '.success // false')

if [ "$SUCCESS" = "true" ]; then
  ORG_SUBS=$(echo "$RESPONSE" | jq -r '.orgSubscriptions // 0')
  TEAM_SUBS=$(echo "$RESPONSE" | jq -r '.teamSubscriptions // 0')
  ERRORS=$(echo "$RESPONSE" | jq -r '.errors | length // 0')
  
  echo "✅ Usage reporting complete!"
  echo "   Org subscriptions: $ORG_SUBS"
  echo "   Team subscriptions: $TEAM_SUBS"
  echo "   Errors: $ERRORS"
  
  if [ "$ERRORS" -gt 0 ]; then
    echo "⚠️  Errors encountered:"
    echo "$RESPONSE" | jq -r '.errors[]'
    exit 1
  fi
else
  echo "❌ Usage reporting failed!"
  echo "$RESPONSE"
  exit 1
fi
EOF

chmod +x /home/claude/openwork/report-usage-cron.sh
```

### **Set Up System Cron**

```bash
# Edit crontab
crontab -e

# Add this line (runs at 2am UTC daily):
0 2 * * * DEN_ADMIN_TOKEN=your_token_here /path/to/report-usage-cron.sh >> /var/log/den-usage-report.log 2>&1
```

---

## Testing the Cron Job

### **Manual Test**

```bash
# Set admin token
export DEN_ADMIN_TOKEN="your_admin_token_here"

# Run the script
./report-usage-cron.sh
```

### **Expected Output**

```
Reporting usage for period: 2026-06-03T00:00:00Z to 2026-06-04T00:00:00Z
Idempotency key: daily_20260604
Response: {"success":true,"orgSubscriptions":5,"teamSubscriptions":12,"errors":[]}
✅ Usage reporting complete!
   Org subscriptions: 5
   Team subscriptions: 12
   Errors: 0
```

### **Test API Directly**

```bash
curl -X POST https://den-api-production.up.railway.app/v1/admin/report-usage \
  -H "Authorization: Bearer YOUR_ADMIN_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "startDate": "2026-06-03T00:00:00Z",
    "endDate": "2026-06-04T00:00:00Z",
    "idempotencyKey": "test_20260604"
  }' | jq
```

---

## Get Admin Token

### **Option A: From Existing Account**

1. Log in to Den Web as an admin user
2. Get session token from cookies (same as regular token)
3. Admin users automatically have access to `/v1/admin/*` endpoints

### **Option B: Check Admin Permissions**

The endpoint checks for admin role. Ensure your user has admin privileges:

```sql
-- Check if user is admin (via Supabase)
SELECT * FROM member 
WHERE user_id = 'your_user_id' 
AND role = 'owner';
```

---

## Monitoring

### **Check Logs**

**Railway:**
```
Railway → den-api → Deployments → Latest → View Logs
```

Look for:
```
[stripe-billing] Reporting usage for org subscription: osub_xxx
[stripe-billing] Reporting usage for team subscription: osub_xxx
[stripe-billing] Reported 1234 cents to Stripe
```

**Stripe Dashboard:**
```
Stripe → Subscriptions → [Select subscription] → Usage
```

Verify usage records appear daily.

---

## Troubleshooting

### **"unauthorized" Error**

- **Fix:** Ensure token is from an admin/owner user
- Check user role in database

### **"No subscriptions found"**

- **Fix:** Create at least one subscription first
- Verify subscriptions are in "active" or "trialing" status

### **Idempotency Errors**

- **Fix:** Each day must use unique idempotency key
- Format: `daily_YYYYMMDD` (auto-generated)

### **Missing Usage Data**

- **Fix:** Ensure inference webhooks are working
- Check `inference_usage_ledger_entries` table has data
- Verify `team_id` is being tracked

---

## Production Checklist

- [ ] Test manual usage reporting
- [ ] Verify data appears in Stripe
- [ ] Set up automated cron (Railway/GitHub/External)
- [ ] Configure admin token securely
- [ ] Set up monitoring/alerts
- [ ] Test idempotency (run twice with same key)
- [ ] Monitor logs for errors
- [ ] Verify all subscriptions are reported

---

## Next Steps

1. ✅ Test manual usage reporting
2. ✅ Choose cron method (Railway/GitHub/External)
3. ✅ Set up automated schedule
4. ✅ Monitor first few runs
5. ✅ Set up alerting for failures
