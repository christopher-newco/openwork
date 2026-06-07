#!/usr/bin/env node
import { db } from "./dist/db.js"
import { eq } from "@openwork-ee/den-db/drizzle"
import { WorkerTable, WorkerTokenTable, WorkerInstanceTable, OrganizationTable } from "@openwork-ee/den-db/schema"

console.log('=== Finding all workers ===')
const workers = await db.select().from(WorkerTable)
console.log(`Found ${workers.length} worker(s)`)

for (const worker of workers) {
  console.log(`\nDeleting worker: ${worker.name} (${worker.id})`)

  // Delete tokens
  const deletedTokens = await db.delete(WorkerTokenTable).where(eq(WorkerTokenTable.worker_id, worker.id))
  console.log(`  - Deleted tokens`)

  // Delete instances
  const deletedInstances = await db.delete(WorkerInstanceTable).where(eq(WorkerInstanceTable.worker_id, worker.id))
  console.log(`  - Deleted instances`)

  // Delete worker
  const deletedWorker = await db.delete(WorkerTable).where(eq(WorkerTable.id, worker.id))
  console.log(`  ✓ Deleted worker ${worker.id}`)
}

console.log('\n✅ All workers deleted')

const remaining = await db.select().from(WorkerTable)
console.log(`Remaining workers: ${remaining.length}`)

process.exit(0)
