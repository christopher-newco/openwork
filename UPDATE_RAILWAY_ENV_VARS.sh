#!/bin/bash
# Update Railway environment variables for den-web service
# Run this locally on your machine (not in the VM)

set -e

echo "Updating Railway environment variables for den-web..."

# Set environment variables
railway variables --set \
  NEXT_PUBLIC_OPENWORK_APP_CONNECT_URL=https://app.soapbox.build \
  NEXT_PUBLIC_OPENWORK_AUTH_CALLBACK_URL=https://admin.soapbox.build \
  NEXT_PUBLIC_PREDEFINED_WORKER_ID=wrk_01ktc2s5fmfer9zy3h2pr1nq6h

echo "✅ Environment variables updated!"
echo ""
echo "Variables set:"
echo "  NEXT_PUBLIC_OPENWORK_APP_CONNECT_URL=https://app.soapbox.build"
echo "  NEXT_PUBLIC_OPENWORK_AUTH_CALLBACK_URL=https://admin.soapbox.build"
echo "  NEXT_PUBLIC_PREDEFINED_WORKER_ID=wrk_01ktc2s5fmfer9zy3h2pr1nq6h"
echo ""
echo "Railway will automatically redeploy den-web with these new variables."
