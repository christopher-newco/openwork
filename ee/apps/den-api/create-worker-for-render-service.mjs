#!/usr/bin/env node
import "./src/load-env.js"
import { createDenTypeId } from "@openwork-ee/utils/typeid"
import { randomBytes } from "node:crypto"
import { db } from "./src/db.js"
import { eq } from "@openwork-ee/den-db/drizzle"
import { WorkerTable, WorkerTokenTable, OrganizationTable, WorkerInstanceTable } from "@openwork-ee/den-db/schema"

const token = () => randomBytes(32).toString("hex")

// Service details from Render
const RENDER_SERVICE_ID = process.env.RENDER_SERVICE_ID || "srv-d8iggbu47okc739chveg"
const RENDER_SERVICE_URL = process.env.RENDER_SERVICE_URL || "https://den-worker-soapbox-workspace-v2.onrender.com"

async function main() {
  console.log("Creating worker record for Render service...")
  console.log(`Service ID: ${RENDER_SERVICE_ID}`)
  console.log(`Service URL: ${RENDER_SERVICE_URL}`)
  console.log("")

  // Find Soapbox org
  const orgs = await db
    .select()
    .from(OrganizationTable)
    .where(eq(OrganizationTable.slug, "soapbox"))
    .limit(1)

  const org = orgs[0]
  if (!org) {
    throw new Error("Soapbox org not found")
  }

  console.log(`Found org: ${org.name} (${org.id})`)

  // Delete any existing workers for this org
  const existingWorkers = await db
    .select()
    .from(WorkerTable)
    .where(eq(WorkerTable.org_id, org.id))

  for (const worker of existingWorkers) {
    console.log(`Deleting existing worker: ${worker.name} (${worker.id})`)
    await db.delete(WorkerTokenTable).where(eq(WorkerTokenTable.worker_id, worker.id))
    await db.delete(WorkerInstanceTable).where(eq(WorkerInstanceTable.worker_id, worker.id))
    await db.delete(WorkerTable).where(eq(WorkerTable.id, worker.id))
  }

  // Create new worker
  const workerId = createDenTypeId("worker")
  const workerName = "Soapbox Workspace"

  console.log(`\nCreating worker: ${workerName} (${workerId})`)

  await db.insert(WorkerTable).values({
    id: workerId,
    org_id: org.id,
    created_by_user_id: null,
    name: workerName,
    description: "Cloud workspace on Render with 40GB disk",
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

  // Create instance record
  await db.insert(WorkerInstanceTable).values({
    id: createDenTypeId("workerInstance"),
    worker_id: workerId,
    provider: "render",
    region: "oregon",
    url: RENDER_SERVICE_URL,
    status: "provisioning",
  })

  console.log("\n✅ Worker record created!")
  console.log(`Worker ID: ${workerId}`)
  console.log(`Host Token: ${hostToken.substring(0, 16)}...`)
  console.log(`Client Token: ${clientToken.substring(0, 16)}...`)
  console.log(`\nNow update the Render service with these tokens...`)

  // Output env vars for Render
  console.log("\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━")
  console.log("Add these environment variables to Render service:")
  console.log(`OPENWORK_TOKEN=${clientToken}`)
  console.log(`OPENWORK_HOST_TOKEN=${hostToken}`)
  console.log(`DEN_WORKER_ID=${workerId}`)

  process.exit(0)
}

main().catch((error) => {
  console.error("\n❌ Error:", error)
  process.exit(1)
})
