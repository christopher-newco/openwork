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

console.log('=== Admin Allowlist ===');
const [admins] = await connection.execute('SELECT email, note, created_at FROM admin_allowlist ORDER BY created_at');
if (admins.length === 0) {
  console.log('No admins in allowlist!');
} else {
  for (const admin of admins) {
    console.log(`${admin.email} - ${admin.note}`);
  }
}

console.log('\n=== Users ===');
const [users] = await connection.execute('SELECT id, email, name FROM users LIMIT 5');
for (const user of users) {
  console.log(`${user.email} (${user.id}) - ${user.name || '(no name)'}`);
}

await connection.end();
