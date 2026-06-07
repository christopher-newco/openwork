#!/usr/bin/env node
import 'dotenv/config';

const API_BASE = process.env.BETTER_AUTH_URL || 'https://api.admin.soapbox.build';

async function recreateWorker() {
  console.log('=== Recreating Soapbox Worker with Docker Deployment ===\n');
  
  // This script runs in the Railway environment with direct database access
  // Import dependencies dynamically to work in the deployed environment
  const { db } = await import('./dist/db.js');
  const { eq } = await import('@openwork-ee/den-db/drizzle');
  const { WorkerTable, WorkerTokenTable, OrganizationTable, WorkerInstanceTable } = await import('@openwork-ee/den-db/schema');
  const { continueCloudProvisioning } = await import('./dist/routes/workers/shared.js');
  const { createDenTypeId } = await import('@openwork-ee/utils/typeid');
  const { randomBytes } = await import('node:crypto');
  
  const token = () => randomBytes(32).toString('hex');
  
  // 1. Find Soapbox org
  console.log('1. Finding Soapbox organization...');
  const orgs = await db
    .select()
    .from(OrganizationTable)
    .where(eq(OrganizationTable.slug, 'soapbox'))
    .limit(1);
  
  const org = orgs[0];
  if (!org) {
    throw new Error('Soapbox org not found');
  }
  console.log(`   ✓ Found: ${org.name} (${org.id})\n`);
  
  // 2. Find and delete existing workers
  console.log('2. Deleting existing workers...');
  const existingWorkers = await db
    .select()
    .from(WorkerTable)
    .where(eq(WorkerTable.org_id, org.id));
  
  console.log(`   Found ${existingWorkers.length} existing worker(s)`);
  
  for (const worker of existingWorkers) {
    console.log(`   Deleting: ${worker.name} (${worker.id})`);
    
    // Delete tokens
    await db.delete(WorkerTokenTable).where(eq(WorkerTokenTable.worker_id, worker.id));
    
    // Delete instances
    await db.delete(WorkerInstanceTable).where(eq(WorkerInstanceTable.worker_id, worker.id));
    
    // Delete worker
    await db.delete(WorkerTable).where(eq(WorkerTable.id, worker.id));
    
    console.log(`   ✓ Deleted ${worker.id}`);
  }
  console.log('');
  
  // 3. Create new worker
  const workerId = createDenTypeId('worker');
  const workerName = `${org.name} Workspace`;
  
  console.log('3. Creating new Docker-based worker...');
  console.log(`   Name: ${workerName}`);
  console.log(`   ID: ${workerId}`);
  
  await db.insert(WorkerTable).values({
    id: workerId,
    org_id: org.id,
    created_by_user_id: null,
    name: workerName,
    description: 'Cloud workspace on Render with Docker deployment',
    destination: 'cloud',
    status: 'provisioning',
    image_version: null,
    workspace_path: null,
    sandbox_backend: null,
  });
  
  // 4. Generate tokens
  const hostToken = token();
  const clientToken = token();
  const activityToken = token();
  
  await db.insert(WorkerTokenTable).values([
    {
      id: createDenTypeId('workerToken'),
      worker_id: workerId,
      scope: 'host',
      token: hostToken,
    },
    {
      id: createDenTypeId('workerToken'),
      worker_id: workerId,
      scope: 'client',
      token: clientToken,
    },
    {
      id: createDenTypeId('workerToken'),
      worker_id: workerId,
      scope: 'activity',
      token: activityToken,
    },
  ]);
  
  console.log(`   ✓ Worker record created`);
  console.log(`   Host Token: ${hostToken.substring(0, 16)}...`);
  console.log(`   Client Token: ${clientToken.substring(0, 16)}...\n`);
  
  // 5. Trigger Render provisioning
  console.log('4. Starting Render provisioning...');
  
  await continueCloudProvisioning({
    workerId,
    name: workerName,
    hostToken,
    clientToken,
    activityToken,
  });
  
  console.log('\n✅ SUCCESS! Worker provisioned with Docker deployment');
  console.log(`\nWorker ID: ${workerId}`);
  console.log('Render Dashboard: https://dashboard.render.com');
  console.log('Workspace URL: https://app.soapbox.build');
  console.log('\nThe Render service is now building with Docker.');
  console.log('Build should complete in 2-5 minutes (much faster than npm!)');
  
  process.exit(0);
}

recreateWorker().catch((error) => {
  console.error('\n❌ Error:', error.message);
  console.error('\nStack trace:', error.stack);
  process.exit(1);
});
