#!/usr/bin/env node
import "./src/load-env.js"
import { db } from "./src/db.js"
import { WorkerTable, WorkerTokenTable } from "@openwork-ee/den-db/schema"
import { createDenTypeId } from "@openwork-ee/utils/typeid"
import { provisionWorker } from "./src/workers/provisioner.js"
import { randomBytes } from "node:crypto"
import { eq } from "@openwork-ee/den-db/drizzle"

const TEST_USER_ID = "user_test123"
const TEST_ORG_ID = "org_test123"

async function testRenderWorkerCreation() {
  console.log("🧪 Testing Render worker creation via Den API provisioner...\n")

  // Create worker record
  const workerId = createDenTypeId("worker")
  const workerName = "Test Render Worker"

  console.log(`Creating worker record: ${workerId}`)
  await db.insert(WorkerTable).values({
    id: workerId,
    org_id: TEST_ORG_ID,
    created_by_user_id: TEST_USER_ID,
    name: workerName,
    description: "Automated test worker for Render provisioning",
    destination: "cloud",
    status: "pending",
  })

  // Generate tokens
  const hostToken = randomBytes(32).toString("hex")
  const clientToken = randomBytes(32).toString("hex")
  const activityToken = randomBytes(32).toString("hex")

  console.log("Creating worker tokens...")
  await db.insert(WorkerTokenTable).values([
    {
      id: createDenTypeId("workerToken"),
      worker_id: workerId,
      token: hostToken,
      scope: "host",
    },
    {
      id: createDenTypeId("workerToken"),
      worker_id: workerId,
      token: clientToken,
      scope: "client",
    },
    {
      id: createDenTypeId("workerToken"),
      worker_id: workerId,
      token: activityToken,
      scope: "activity",
    },
  ])

  try {
    console.log("\n🚀 Calling provisionWorker()...")
    const result = await provisionWorker({
      workerId,
      name: workerName,
      hostToken,
      clientToken,
      activityToken,
    })

    console.log("\n✅ SUCCESS! Worker provisioned:")
    console.log(JSON.stringify(result, null, 2))

    // Update worker status
    await db
      .update(WorkerTable)
      .set({ status: result.status })
      .where(eq(WorkerTable.id, workerId))

    console.log(`\n✅ Worker created successfully!`)
    console.log(`   URL: ${result.url}`)
    console.log(`   Provider: ${result.provider}`)
    console.log(`   Status: ${result.status}`)
    console.log(`\nTo delete this test worker, run:`)
    console.log(`   curl -X DELETE https://api.render.com/v1/services/<service-id> \\`)
    console.log(`     -H "Authorization: Bearer $RENDER_API_KEY"`)

  } catch (error) {
    console.error("\n❌ FAILED! Error during provisioning:")
    console.error(error)

    // Clean up on failure
    console.log("\nCleaning up test worker record...")
    await db.delete(WorkerTokenTable).where(eq(WorkerTokenTable.worker_id, workerId))
    await db.delete(WorkerTable).where(eq(WorkerTable.id, workerId))

    process.exit(1)
  }
}

testRenderWorkerCreation().catch(console.error)
