#!/bin/bash

# Helper script to extract auth token from browser
# This needs to be run on your local machine, not in the VM

echo "🔑 OpenWork Auth Token Extractor"
echo ""
echo "To get your auth token:"
echo ""
echo "1. Open https://admin.soapbox.build in your browser"
echo "2. Sign in with GitHub"
echo "3. Open Developer Tools:"
echo "   - Chrome/Edge: Press F12 or Ctrl+Shift+I (Cmd+Option+I on Mac)"
echo "   - Firefox: Press F12"
echo ""
echo "4. Click the 'Application' tab (or 'Storage' in Firefox)"
echo ""
echo "5. In the left sidebar, expand 'Local Storage'"
echo "   Click on: https://admin.soapbox.build"
echo ""
echo "6. Find the key: openwork.den.authToken"
echo ""
echo "7. Copy the value (should be a long string)"
echo ""
echo "8. Paste it here and press Enter:"
echo ""
read -p "Auth Token: " TOKEN

if [ -z "$TOKEN" ]; then
    echo "❌ No token provided"
    exit 1
fi

echo ""
echo "✅ Token received!"
echo ""
echo "Now run:"
echo "  export ORCHESTRATOR_AUTH_TOKEN=\"$TOKEN\""
echo "  node scripts/create-tenant-worker.mjs app"
echo ""

# Optionally save to a file (be careful with this!)
read -p "Save token to .env file? (y/n): " SAVE

if [ "$SAVE" = "y" ] || [ "$SAVE" = "Y" ]; then
    echo "ORCHESTRATOR_AUTH_TOKEN=\"$TOKEN\"" > .env.local
    echo "✅ Saved to .env.local"
    echo ""
    echo "You can now run:"
    echo "  source .env.local"
    echo "  node scripts/create-tenant-worker.mjs app"
fi
