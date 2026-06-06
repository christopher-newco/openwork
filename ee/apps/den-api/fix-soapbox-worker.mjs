#!/usr/bin/env node
import { createDenTypeId } from '@openwork-ee/utils/typeid';
import { randomBytes } from 'node:crypto';
import { db } from './src/db.js';
import { eq } from '@openwork-ee/den-db/drizzle';
import { WorkerTable, WorkerTokenTable, OrganizationTable, WorkerInstanceTable } from '@openwork-ee/den-db/schema';
import { continueCloudProvisioning } from './src/routes/workers/shared.js';

const token = () => randomBytes(32).toString('hex');

async function main() {
  console.log('Finding Soapbox organization...');

  const orgs = await db
    .select()
    .from(OrganizationTable)
    .where(eq(OrganizationTable.slug, 'soapbox'))
    .limit(1);

  const org = orgs[0];
  if (!org) {
    throw new Error('Soapbox org not found');
  }

  console.log(`Found: ${org.name} (${org.id})`);

  // Find and delete broken workers
  const workers = await db
    .select()
    .from(WorkerTable)
    .where(eq(WorkerTable.org_id, org.id));

  console.log(`Found ${workers.length} existing workers`);

  for (const worker of workers) {
    console.log(`Deleting worker: ${worker.name} (${worker.id}) - ${worker.status}`);

    // Delete instances
    await db.delete(WorkerInstanceTable).where(eq(WorkerInstanceTable.worker_id, worker.id));

    // Delete tokens
    await db.delete(WorkerTokenTable).where(eq(WorkerTokenTable.worker_id, worker.id));

    // Delete worker
    await db.delete(WorkerTable).where(eq(WorkerTable.id, worker.id));
  }

  // Create new worker
  const workerId = createDenTypeId('worker');
  const workerName = `${org.name} Workspace`;

  console.log(`Creating new worker: ${workerName} (${workerId})`);

  await db.insert(WorkerTable).values({
    id: workerId,
    org_id: org.id,
    created_by_user_id: null,
    name: workerName,
    description: null,
    destination: 'cloud',
    status: 'provisioning',
    image_version: null,
    workspace_path: null,
    sandbox_backend: null,
  });

  // Generate tokens
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

  console.log('Starting Daytona provisioning...');

  await continueCloudProvisioning({
    workerId,
    name: workerName,
    hostToken,
    clientToken,
    activityToken,
  });

  console.log('✅ Worker provisioned! Worker ID:', workerId);
  console.log('Check https://app.daytona.io for sandbox status');
  console.log('\nYou can now access the workspace at https://admin.soapbox.build/workspace');

  process.exit(0);
}

main().catch((error) => {
  console.error('Error:', error);
  process.exit(1);
});
