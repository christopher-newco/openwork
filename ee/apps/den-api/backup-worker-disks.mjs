#!/usr/bin/env node
import "./src/load-env.js"
import { db } from "./src/db.js"
import { WorkerTable, WorkerInstanceTable } from "@openwork-ee/den-db/schema"
import { eq, and } from "@openwork-ee/den-db/drizzle"
import { backupWorkerDisks, rotateSnapshots, listRenderDisks } from "./src/workers/render-backup.js"

async function main() {
  console.log("🔄 Backing up all Render worker disks...\n")

  // Find all cloud workers with Render instances
  const workers = await db
    .select({
      workerId: WorkerTable.id,
      workerName: WorkerTable.name,
      status: WorkerTable.status,
    })
    .from(WorkerTable)
    .where(and(eq(WorkerTable.destination, "cloud"), eq(WorkerTable.status, "healthy")))

  if (workers.length === 0) {
    console.log("No healthy cloud workers found.")
    return
  }

  console.log(`Found ${workers.length} healthy cloud worker(s)\n`)

  for (const worker of workers) {
    console.log(`\n━━━ ${worker.workerName} (${worker.workerId}) ━━━`)

    // Get the latest instance
    const instances = await db
      .select()
      .from(WorkerInstanceTable)
      .where(eq(WorkerInstanceTable.worker_id, worker.workerId))
      .orderBy(WorkerInstanceTable.created_at)
      .limit(1)

    const instance = instances[0]
    if (!instance) {
      console.log("  ⚠️  No instance found, skipping")
      continue
    }

    if (instance.provider !== "render") {
      console.log(`  ⚠️  Not a Render worker (provider: ${instance.provider}), skipping`)
      continue
    }

    // Extract service ID from instance metadata
    // For now, we'll need to track this separately or extract from URL
    // The instance doesn't store the Render service ID directly
    console.log("  ⚠️  Service ID not available in instance metadata")
    console.log("  💡 To backup manually, run:")
    console.log(`     curl -X POST https://api.render.com/v1/disks/{diskId}/snapshots \\`)
    console.log(`       -H "Authorization: Bearer $RENDER_API_KEY"`)
  }

  console.log("\n✅ Backup scan complete")
  console.log("\n💡 To enable automatic backups:")
  console.log("   1. Store Render service IDs in WorkerInstanceTable")
  console.log("   2. Set up a cron job to run this script daily")
  console.log("   3. Configure RENDER_BACKUP_RETENTION_DAYS environment variable")
}

main().catch((error) => {
  console.error("\n❌ Error:", error)
  process.exit(1)
})
