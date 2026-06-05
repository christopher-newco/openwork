#!/bin/bash
# Test worker from inside Railway network
RAILWAY_TOKEN="3151ea12-9f3f-49b1-a5d6-a6b65e1c0205" railway run --service dff560db-31c5-406a-bc21-bbefdd8ff238 -- curl -s http://worker-app.railway.internal:8787/health 2>&1
