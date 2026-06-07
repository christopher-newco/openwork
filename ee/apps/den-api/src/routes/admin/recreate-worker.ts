import { Hono } from "hono"
import { createDenTypeId } from "@openwork-ee/utils/typeid"
import { randomBytes } from "node:crypto"
import { db } from "../../db.js"
import { eq } from "@openwork-ee/den-db/drizzle"
import {
  WorkerTable,
  WorkerTokenTable,
  OrganizationTable,
  WorkerInstanceTable,
} from "@openwork-ee/den-db/schema"
import { continueCloudProvisioning } from "../workers/shared.js"

const app = new Hono()

const token = () => randomBytes(32).toString("hex")

app.post("/", async (c) => {
  try {
    console.log("=== Recreating Worker with Docker Deployment ===")

    // 1. Find Soapbox org
    console.log("1. Finding Soapbox organization...")
    const orgs = await db
      .select()
      .from(OrganizationTable)
      .where(eq(OrganizationTable.slug, "soapbox"))
      .limit(1)

    const org = orgs[0]
    if (!org) {
      return c.json({ error: "Soapbox org not found" }, 404)
    }
    console.log(`   ✓ Found: ${org.name} (${org.id})`)

    // 2. Find and delete existing workers
    console.log("2. Deleting existing workers...")
    const existingWorkers = await db
      .select()
      .from(WorkerTable)
      .where(eq(WorkerTable.org_id, org.id))

    console.log(`   Found ${existingWorkers.length} existing worker(s)`)

    for (const worker of existingWorkers) {
      console.log(`   Deleting: ${worker.name} (${worker.id})`)

      // Delete tokens
      await db
        .delete(WorkerTokenTable)
        .where(eq(WorkerTokenTable.worker_id, worker.id))

      // Delete instances
      await db
        .delete(WorkerInstanceTable)
        .where(eq(WorkerInstanceTable.worker_id, worker.id))

      // Delete worker
      await db.delete(WorkerTable).where(eq(WorkerTable.id, worker.id))

      console.log(`   ✓ Deleted ${worker.id}`)
    }

    // 3. Create new worker
    const workerId = createDenTypeId("worker")
    const workerName = `${org.name} Workspace`

    console.log("3. Creating new Docker-based worker...")
    console.log(`   Name: ${workerName}`)
    console.log(`   ID: ${workerId}`)

    await db.insert(WorkerTable).values({
      id: workerId,
      org_id: org.id,
      created_by_user_id: null,
      name: workerName,
      description: "Cloud workspace on Render with Docker deployment",
      destination: "cloud",
      status: "provisioning",
      image_version: null,
      workspace_path: null,
      sandbox_backend: null,
    })

    // 4. Generate tokens
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

    console.log(`   ✓ Worker record created`)
    console.log(`   Host Token: ${hostToken.substring(0, 16)}...`)
    console.log(`   Client Token: ${clientToken.substring(0, 16)}...`)

    // 5. Trigger Render provisioning
    console.log("4. Starting Render provisioning with Docker...")

    await continueCloudProvisioning({
      workerId,
      name: workerName,
      hostToken,
      clientToken,
      activityToken,
    })

    console.log("\n✅ SUCCESS! Worker provisioned with Docker deployment")

    return c.json({
      success: true,
      workerId,
      message: "Worker recreated with Docker deployment",
      renderDashboard: "https://dashboard.render.com",
      workspaceUrl: "https://app.soapbox.build",
      note: "Docker build should complete in 2-5 minutes (much faster than npm!)",
    })
  } catch (error) {
    console.error("❌ Error:", error)
    return c.json(
      {
        error: error instanceof Error ? error.message : "Unknown error",
        stack: error instanceof Error ? error.stack : undefined,
      },
      500,
    )
  }
})

export default app
