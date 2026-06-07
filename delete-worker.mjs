#!/usr/bin/env node
import mysql from 'mysql2/promise';

const dbUrl = process.env.DATABASE_URL;
if (!dbUrl) {
  console.error('DATABASE_URL not set');
  process.exit(1);
}

const url = new URL(dbUrl);
const connection = await mysql.createConnection({
  host: url.hostname,
  port: url.port || 3306,
  user: url.username,
  password: url.password,
  database: url.pathname.slice(1),
});

console.log('=== Finding workers ===');
const [workers] = await connection.execute('SELECT id, name, org_id, status FROM workers');
console.log(`Found ${workers.length} worker(s):`);
for (const worker of workers) {
  console.log(`  ${worker.id}: ${worker.name} (${worker.status})`);
}

if (workers.length > 0) {
  console.log('\n=== Deleting workers ===');
  for (const worker of workers) {
    console.log(`Deleting worker ${worker.id}...`);

    // Delete worker tokens
    await connection.execute('DELETE FROM worker_tokens WHERE worker_id = ?', [worker.id]);
    console.log('  - Deleted tokens');

    // Delete worker instances
    await connection.execute('DELETE FROM worker_instances WHERE worker_id = ?', [worker.id]);
    console.log('  - Deleted instances');

    // Delete daytona sandboxes
    await connection.execute('DELETE FROM daytona_sandboxes WHERE worker_id = ?', [worker.id]);
    console.log('  - Deleted daytona sandboxes');

    // Delete worker
    await connection.execute('DELETE FROM workers WHERE id = ?', [worker.id]);
    console.log('  - Deleted worker');
  }
  console.log('\n✅ All workers deleted');
} else {
  console.log('No workers to delete');
}

await connection.end();
