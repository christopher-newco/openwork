import { db } from './src/db.js'
import { WorkerInstanceTable, WorkerTable } from '@openwork-ee/den-db/schema'
import { eq, desc } from '@openwork-ee/den-db/drizzle'

async function fixWorkerUrls() {
  console.log('Fetching all workers...')

  const workers = await db.select().from(WorkerTable)
  console.log(`Found ${workers.length} workers`)

  for (const worker of workers) {
    console.log(`\nProcessing worker ${worker.id}:`)

    // Get latest instance
    const instances = await db
      .select()
      .from(WorkerInstanceTable)
      .where(eq(WorkerInstanceTable.worker_id, worker.id))
      .orderBy(desc(WorkerInstanceTable.created_at))
      .limit(1)

    if (instances.length === 0) {
      console.log('  No instances found')
      continue
    }

    const instance = instances[0]
    console.log(`  Current URL: ${instance.url}`)

    // Check if it's a Daytona URL that needs updating
    if (instance.url && instance.url.includes('daytonaproxy')) {
      const newUrl = `https://app.soapbox.build/${worker.id}`
      console.log(`  Updating to: ${newUrl}`)

      await db
        .update(WorkerInstanceTable)
        .set({ url: newUrl })
        .where(eq(WorkerInstanceTable.id, instance.id))

      console.log('  ✓ Updated')
    } else {
      console.log('  Skipping (not a Daytona URL)')
    }
  }

  console.log('\nDone!')
  process.exit(0)
}

fixWorkerUrls().catch((error) => {
  console.error('Error:', error)
  process.exit(1)
})
