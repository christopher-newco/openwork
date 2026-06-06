#!/usr/bin/env node
/**
 * Manually provision a Daytona worker for an organization
 * Usage: node scripts/provision-worker-for-org.ts <org-slug>
 */

import { randomBytes } from "node:crypto"
import { db } from "../src/db.js"
import { eq, desc } from "@openwork-ee/den-db/drizzle"
import { WorkerTable, WorkerTokenTable, OrganizationTable } from "@openwork-ee/den-db/schema"
import { createDenTypeId, normalizeDenTypeId } from "@openwork-ee/utils/typeid"
import { continueCloudProvisioning } from "../src/routes/workers/shared.js"

const token = () => randomBytes(32).toString("hex")

const orgSlug = process.argv[2]
if (!orgSlug) {
  console.error("Usage: node scripts/provision-worker-for-org.ts <org-slug>")
  process.exit(1)
}

async function main() {
  // Find the organization
  const orgs = await db
    .select()
    .from(OrganizationTable)
    .where(eq(OrganizationTable.slug, orgSlug))
    .limit(1)

  const org = orgs[0]
  if (!org) {
    console.error(`Organization with slug '${orgSlug}' not found`)
    process.exit(1)
  }

  console.log(`Found organization: ${org.name} (${org.id})`)

  // Check for existing workers
  const existingWorkers = await db
    .select()
    .from(WorkerTable)
    .where(eq(WorkerTable.org_id, org.id))
    .orderBy(desc(WorkerTable.created_at))

  if (existingWorkers.length > 0) {
    console.log(`\nExisting workers for ${org.name}:`)
    for (const worker of existingWorkers) {
      console.log(`  - ${worker.name} (${worker.id}) - Status: ${worker.status}`)
    }

    // Delete broken workers
    for (const worker of existingWorkers) {
      if (worker.status === "provisioning" || worker.status === "failed") {
        console.log(`\nDeleting broken worker: ${worker.id}`)
        await db.delete(WorkerTable).where(eq(WorkerTable.id, worker.id))
      }
    }
  }

  // Create new worker
  const workerId = createDenTypeId("worker")
  const workerName = `${org.name} Workspace`

  console.log(`\nCreating new worker: ${workerName} (${workerId})`)

  await db.insert(WorkerTable).values({
    id: workerId,
    org_id: org.id,
    created_by_user_id: null,
    name: workerName,
    description: null,
    destination: "cloud",
    status: "provisioning",
    image_version: null,
    workspace_path: null,
    sandbox_backend: null,
  })

  // Generate tokens
  const hostToken = token()
  const clientToken = token()
  const activityToken = token()

  // Create token records
  await db.insert(WorkerTokenTable).values([
    {
      id: createDenTypeId("workerToken"),
      worker_id: workerId,
      scope: "host",
      token: hostToken,
    },
    {
      id: createDenTypeId("workerToken"),
      worker_id: workerId,
      scope: "client",
      token: clientToken,
    },
    {
      id: createDenTypeId("workerToken"),
      worker_id: workerId,
      scope: "activity",
      token: activityToken,
    },
  ])

  console.log(`Provisioning on Daytona...`)

  // Start Daytona provisioning
  await continueCloudProvisioning({
    workerId,
    name: workerName,
    hostToken,
    clientToken,
    activityToken,
  })

  console.log(`\n✅ Worker provisioned successfully!`)
  console.log(`Check status at: https://admin.soapbox.build/dashboard`)

  process.exit(0)
}

main().catch((error) => {
  console.error("Error:", error)
  process.exit(1)
})
