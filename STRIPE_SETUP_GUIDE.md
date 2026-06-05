# Stripe Configuration Guide for Property-Level Billing

## Overview

Property-level billing requires Stripe configuration to create separate subscriptions for each team.

---

## Step 1: Get Your Stripe API Keys

### **1.1 Go to Stripe Dashboard**
```
https://dashboard.stripe.com
```

### **1.2 Switch to Test Mode (Recommended First)**
- Toggle the "Test mode" switch in the top right corner
- This lets you test without real charges

### **1.3 Get Your Secret Key**
1. Go to: **Developers** → **API keys**
2. Copy the **Secret key** (starts with `sk_test_` for test mode or `sk_live_` for live)
3. Keep this safe - it's sensitive!

---

## Step 2: Create Stripe Products & Prices

### **2.1 Create Base Subscription Product**

1. Go to: **Products** → **Add product**
2. Fill in:
   - **Name:** OpenWork Models - Base
   - **Description:** Base subscription for OpenWork Models access
   - **Pricing:** Recurring
   - **Price:** $5,000.00 USD
   - **Billing period:** Monthly
3. Click **Save product**
4. **Copy the Price ID** (starts with `price_xxx`)

### **2.2 Create Usage-Based Product**

1. **Products** → **Add product**
2. Fill in:
   - **Name:** OpenWork Models - Usage
   - **Description:** Metered usage for OpenWork Models
   - **Pricing:** Usage is metered
   - **Price:** $0.01 USD per unit
   - **Billing period:** Monthly
   - **Usage is metered:** Yes
3. Click **Save product**
4. **Copy the Price ID** (starts with `price_xxx`)

**Why $0.01 per unit?**
- We track costs in cents
- 1 unit = 1 cent of actual cost
- With 20x markup, this works perfectly
- Example: $10 actual cost = 1000 units = $10 charged

---

## Step 3: Set Up Webhook Endpoint

### **3.1 Create Webhook**

1. Go to: **Developers** → **Webhooks**
2. Click **Add endpoint**
3. **Endpoint URL:**
   ```
   https://den-api-production.up.railway.app/webhooks/stripe
   ```
4. **Events to send:**
   - `checkout.session.completed`
   - `customer.subscription.created`
   - `customer.subscription.updated`
   - `customer.subscription.deleted`
   - `invoice.payment_failed`

5. Click **Add endpoint**
6. **Copy the Signing secret** (starts with `whsec_xxx`)

---

## Step 4: Configure Railway Environment Variables

### **4.1 Go to Railway**
```
https://railway.app/project/e877a57e-161f-4f3a-a5b8-430250cccd47
```

### **4.2 Select den-api Service**
- Click on the **den-api** service

### **4.3 Add Environment Variables**

Click **Variables** tab and add:

```env
STRIPE_SECRET_KEY=sk_test_xxxxxxxxxxxx
STRIPE_INFERENCE_PRICE_ID=price_xxxxxxxxxxxx
STRIPE_WEBHOOK_SECRET=whsec_xxxxxxxxxxxx
```

**Replace with your actual values:**
- `STRIPE_SECRET_KEY` - Your Stripe secret key (from Step 1.3)
- `STRIPE_INFERENCE_PRICE_ID` - Usage price ID (from Step 2.2)
- `STRIPE_WEBHOOK_SECRET` - Webhook signing secret (from Step 3.6)

### **4.4 Optional: Custom URLs**

If you want custom success/cancel URLs:
```env
STRIPE_BILLING_SUCCESS_URL=https://your-domain.com/billing/success
STRIPE_BILLING_CANCEL_URL=https://your-domain.com/billing/cancel
```

### **4.5 Deploy Changes**

Railway will automatically redeploy when you save environment variables.

---

## Step 5: Test Stripe Integration

### **5.1 Create Test Checkout**

Run the test script:
```bash
./test-with-your-account.sh YOUR_AUTH_TOKEN
```

You should see a Stripe checkout URL generated.

### **5.2 Complete Test Checkout**

1. Open the checkout URL
2. Use Stripe test card:
   ```
   Card: 4242 4242 4242 4242
   Expiry: Any future date (e.g., 12/34)
   CVC: Any 3 digits (e.g., 123)
   ZIP: Any 5 digits (e.g., 12345)
   ```
3. Complete checkout

### **5.3 Verify in Stripe Dashboard**

1. Go to: **Customers**
2. You should see a new customer for the team
3. Go to: **Subscriptions**
4. Verify the subscription was created

---

## Step 6: Test Webhook Delivery

### **6.1 Check Webhook Logs**

1. **Stripe Dashboard** → **Developers** → **Webhooks**
2. Click on your webhook
3. Check the **Attempts** tab
4. Verify events are being delivered successfully

### **6.2 Check Railway Logs**

1. **Railway** → **den-api** → **Deployments**
2. Click on latest deployment
3. Check logs for webhook events:
   ```
   [stripe-billing] Processing webhook: checkout.session.completed
   [stripe-billing] Subscription created: sub_xxx
   ```

---

## Troubleshooting

### **Checkout URL Not Generated**

**Error:** `stripe_secret_key_missing`
- **Fix:** Add `STRIPE_SECRET_KEY` to Railway environment variables

**Error:** `stripe_inference_price_id_missing`
- **Fix:** Add `STRIPE_INFERENCE_PRICE_ID` to Railway environment variables

### **Webhook Failures**

**Error:** Signature verification failed
- **Fix:** Check `STRIPE_WEBHOOK_SECRET` is correct in Railway

**Error:** 404 Not Found
- **Fix:** Verify webhook URL is `https://den-api-production.up.railway.app/webhooks/stripe`

### **Subscription Not Created**

1. Check Railway logs for errors
2. Check Stripe webhook attempts
3. Verify price IDs are correct
4. Test with Stripe test mode first

---

## Production Checklist

Before going live:

- [ ] Test complete checkout flow in test mode
- [ ] Verify webhooks are working
- [ ] Test usage reporting
- [ ] Switch to live Stripe keys (`sk_live_xxx`)
- [ ] Update webhook URL to production
- [ ] Test with real (small) subscription first
- [ ] Monitor Railway logs for errors
- [ ] Check Stripe dashboard for subscriptions

---

## Stripe Test Cards

Use these for testing:

| Scenario | Card Number | Result |
|----------|-------------|--------|
| Success | 4242 4242 4242 4242 | Payment succeeds |
| Decline | 4000 0000 0000 0002 | Card declined |
| Insufficient funds | 4000 0000 0000 9995 | Insufficient funds |
| Expired | 4000 0000 0000 0069 | Expired card |

All test cards use:
- **Expiry:** Any future date
- **CVC:** Any 3 digits
- **ZIP:** Any 5 digits

---

## Next Steps

Once Stripe is configured:

1. ✅ Test property team creation
2. ✅ Test checkout flow
3. ✅ Verify subscription creation
4. ✅ Test usage reporting (Step 3 below)
5. ✅ Set up daily cron job
6. ✅ Monitor billing in Stripe dashboard
