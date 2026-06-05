#!/bin/bash
# Create a test user in Den database for API testing

API_BASE="https://den-api-production.up.railway.app"

echo "Creating test user via Den API..."

# Register a test user
SIGNUP_RESPONSE=$(curl -s -X POST "$API_BASE/api/auth/sign-up/email" \
  -H "Content-Type: application/json" \
  -d '{
    "email": "test-property-billing@example.com",
    "password": "TestPassword123!",
    "name": "Property Billing Test User"
  }')

echo "Signup response: $SIGNUP_RESPONSE"

# Sign in to get token
SIGNIN_RESPONSE=$(curl -s -X POST "$API_BASE/api/auth/sign-in/email" \
  -H "Content-Type: application/json" \
  -d '{
    "email": "test-property-billing@example.com",
    "password": "TestPassword123!"
  }' -c cookies.txt -i)

echo ""
echo "Sign-in response:"
echo "$SIGNIN_RESPONSE"

# Extract token from cookies
TOKEN=$(grep -o 'better-auth\.session_token=[^;]*' cookies.txt | cut -d= -f2)

if [ ! -z "$TOKEN" ]; then
  echo ""
  echo "✅ Test user created successfully!"
  echo "📧 Email: test-property-billing@example.com"
  echo "🔑 Token: $TOKEN"
  echo ""
  echo "Running tests with this token..."
  ./quick-test.sh "$TOKEN"
else
  echo "❌ Could not extract token. Full response:"
  cat cookies.txt
fi
