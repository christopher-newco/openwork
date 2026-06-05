#!/usr/bin/env node

/**
 * Create Tenant Worker Script
 *
 * Registers a new "local" worker with the orchestrator and provides
 * the configuration needed for Railway deployment.
 *
 * Usage:
 *   node scripts/create-tenant-worker.mjs <tenant-name>
 *
 * Example:
 *   node scripts/create-tenant-worker.mjs app
 *   node scripts/create-tenant-worker.mjs customer1
 */

const ORCHESTRATOR_API = process.env.ORCHESTRATOR_API_URL || 'https://den-api-production-89bf.up.railway.app';
const AUTH_TOKEN = process.env.ORCHESTRATOR_AUTH_TOKEN;

async function createWorker(tenantName) {
  if (!AUTH_TOKEN) {
    console.error('❌ Error: ORCHESTRATOR_AUTH_TOKEN environment variable is required');
    console.error('');
    console.error('Get your token from:');
    console.error('1. Sign in to https://admin.soapbox.build');
    console.error('2. Open browser DevTools → Application → Local Storage');
    console.error('3. Look for "openwork.den.authToken"');
    console.error('');
    console.error('Then run:');
    console.error('  export ORCHESTRATOR_AUTH_TOKEN="your-token-here"');
    process.exit(1);
  }

  console.log('🚀 Creating worker for tenant:', tenantName);
  console.log('📡 Orchestrator API:', ORCHESTRATOR_API);
  console.log('');

  try {
    const response = await fetch(`${ORCHESTRATOR_API}/v1/workers`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${AUTH_TOKEN}`,
      },
      body: JSON.stringify({
        name: `${tenantName} Worker`,
        description: `Worker instance for ${tenantName}.soapbox.build`,
        destination: 'local',
        workspacePath: '/workspace',
      }),
    });

    const responseText = await response.text();

    if (!response.ok) {
      console.error('❌ Failed to create worker');
      console.error('Status:', response.status);
      console.error('Response:', responseText);

      if (response.status === 401) {
        console.error('');
        console.error('Your auth token may be expired. Get a fresh one from:');
        console.error('https://admin.soapbox.build → DevTools → Local Storage → openwork.den.authToken');
      }

      process.exit(1);
    }

    const data = JSON.parse(responseText);
    const { worker, tokens } = data;

    console.log('✅ Worker created successfully!');
    console.log('');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('📋 Worker Details');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('Worker ID:', worker.id);
    console.log('Name:', worker.name);
    console.log('Status:', worker.status);
    console.log('Created:', new Date(worker.createdAt).toLocaleString());
    console.log('');

    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('🔐 Authentication Tokens');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('Host Token:', tokens.host);
    console.log('Client Token:', tokens.client);
    console.log('Owner Token:', tokens.owner);
    console.log('');

    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('🚂 Railway Deployment - Worker Backend');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('');
    console.log('1. Create new Railway service for the worker:');
    console.log('   railway up --service worker-' + tenantName);
    console.log('');
    console.log('2. Set environment variables in Railway dashboard:');
    console.log('');
    console.log('   OPENWORK_TOKEN=' + tokens.client);
    console.log('   OPENWORK_HOST_TOKEN=' + tokens.host);
    console.log('   DEN_WORKER_ID=' + worker.id);
    console.log('   DEN_API_URL=' + ORCHESTRATOR_API);
    console.log('');
    console.log('3. Configure the service to use:');
    console.log('   - Dockerfile: packaging/docker/Dockerfile');
    console.log('   - Port: 8787');
    console.log('');
    console.log('4. Add custom domain:');
    console.log('   - worker-' + tenantName + '.soapbox.build');
    console.log('');

    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('🌐 Railway Deployment - Tenant App');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('');
    console.log('1. Create new Railway service for the app:');
    console.log('   railway up --service app-' + tenantName);
    console.log('');
    console.log('2. Set environment variables in Railway dashboard:');
    console.log('');
    console.log('   VITE_DEN_BASE_URL=https://admin.soapbox.build');
    console.log('   VITE_DEN_API_BASE_URL=' + ORCHESTRATOR_API);
    console.log('   VITE_DEN_REQUIRE_SIGNIN=true');
    console.log('   VITE_PREDEFINED_WORKER_ID=' + worker.id);
    console.log('');
    console.log('3. Configure the service to use:');
    console.log('   - railway.json: apps/app/railway.json');
    console.log('   - Dockerfile: packaging/docker/Dockerfile.app');
    console.log('');
    console.log('4. Add custom domain:');
    console.log('   - ' + tenantName + '.soapbox.build');
    console.log('');

    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('📝 Copy-Paste Commands for Railway CLI');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('');
    console.log('# Set worker environment variables');
    console.log('railway variables set \\');
    console.log('  OPENWORK_TOKEN="' + tokens.client + '" \\');
    console.log('  OPENWORK_HOST_TOKEN="' + tokens.host + '" \\');
    console.log('  DEN_WORKER_ID="' + worker.id + '" \\');
    console.log('  DEN_API_URL="' + ORCHESTRATOR_API + '"');
    console.log('');
    console.log('# Set app environment variables');
    console.log('railway variables set \\');
    console.log('  VITE_DEN_BASE_URL="https://admin.soapbox.build" \\');
    console.log('  VITE_DEN_API_BASE_URL="' + ORCHESTRATOR_API + '" \\');
    console.log('  VITE_DEN_REQUIRE_SIGNIN="true" \\');
    console.log('  VITE_PREDEFINED_WORKER_ID="' + worker.id + '"');
    console.log('');

    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('✨ Next Steps');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('');
    console.log('1. Deploy worker backend to Railway');
    console.log('2. Deploy tenant app to Railway');
    console.log('3. Test by visiting https://' + tenantName + '.soapbox.build');
    console.log('4. Sign in and verify auto-connect works');
    console.log('');

    // Save configuration to file for reference
    const config = {
      tenant: tenantName,
      workerId: worker.id,
      workerName: worker.name,
      createdAt: worker.createdAt,
      tokens: {
        host: tokens.host,
        client: tokens.client,
        owner: tokens.owner,
      },
      workerEnv: {
        OPENWORK_TOKEN: tokens.client,
        OPENWORK_HOST_TOKEN: tokens.host,
        DEN_WORKER_ID: worker.id,
        DEN_API_URL: ORCHESTRATOR_API,
      },
      appEnv: {
        VITE_DEN_BASE_URL: 'https://admin.soapbox.build',
        VITE_DEN_API_BASE_URL: ORCHESTRATOR_API,
        VITE_DEN_REQUIRE_SIGNIN: 'true',
        VITE_PREDEFINED_WORKER_ID: worker.id,
      },
    };

    const configFile = `./tenant-${tenantName}-config.json`;
    await import('fs/promises').then(fs =>
      fs.writeFile(configFile, JSON.stringify(config, null, 2))
    );

    console.log('💾 Configuration saved to:', configFile);
    console.log('');

  } catch (error) {
    console.error('❌ Error:', error.message);
    if (error.cause) {
      console.error('Cause:', error.cause);
    }
    process.exit(1);
  }
}

// Parse command line arguments
const tenantName = process.argv[2];

if (!tenantName) {
  console.error('Usage: node scripts/create-tenant-worker.mjs <tenant-name>');
  console.error('');
  console.error('Examples:');
  console.error('  node scripts/create-tenant-worker.mjs app');
  console.error('  node scripts/create-tenant-worker.mjs customer1');
  console.error('  node scripts/create-tenant-worker.mjs customer2');
  process.exit(1);
}

// Validate tenant name
if (!/^[a-z0-9-]+$/.test(tenantName)) {
  console.error('❌ Invalid tenant name:', tenantName);
  console.error('Tenant name must contain only lowercase letters, numbers, and hyphens');
  process.exit(1);
}

createWorker(tenantName);
