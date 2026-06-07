#!/usr/bin/env node
import mysql from 'mysql2/promise';

const dbUrl = process.env.DATABASE_URL;
if (!dbUrl) {
  console.error('DATABASE_URL not set');
  process.exit(1);
}

const email = process.argv[2] || 'chris.naismith@gmail.com';
const normalizedEmail = email.toLowerCase().trim();

// Parse DATABASE_URL
const url = new URL(dbUrl);
const connection = await mysql.createConnection({
  host: url.hostname,
  port: url.port || 3306,
  user: url.username,
  password: url.password,
  database: url.pathname.slice(1),
});

// Check if already exists
const [existing] = await connection.execute(
  'SELECT * FROM admin_allowlist WHERE email = ? LIMIT 1',
  [normalizedEmail]
);

if (existing.length > 0) {
  console.log(`✓ ${normalizedEmail} is already an admin`);
  await connection.end();
  process.exit(0);
}

// Generate ID (simplified typeid format)
const id = `admallow_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 10)}`;

// Add to allowlist
await connection.execute(
  'INSERT INTO admin_allowlist (id, email, note, created_at, updated_at) VALUES (?, ?, ?, NOW(), NOW())',
  [id, normalizedEmail, 'Added via add-admin-direct script']
);

console.log(`✓ Added ${normalizedEmail} to admin allowlist`);

// Show all admins
const [admins] = await connection.execute('SELECT email, note FROM admin_allowlist');
console.log('\nCurrent admins:');
for (const admin of admins) {
  console.log(`  - ${admin.email}`);
}

await connection.end();
