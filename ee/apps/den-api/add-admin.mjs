#!/usr/bin/env node
import "./src/load-env.js"
import { db } from "./src/db.js"
import { AdminAllowlistTable } from "@openwork-ee/den-db/schema"
import { createDenTypeId } from "@openwork-ee/utils/typeid"

const email = process.argv[2]

if (!email) {
  console.error("Usage: node add-admin.mjs <email>")
  process.exit(1)
}

const normalizedEmail = email.toLowerCase().trim()

// Check if already exists
const existing = await db
  .select()
  .from(AdminAllowlistTable)
  .where((t) => t.email.eq(normalizedEmail))
  .limit(1)

if (existing.length > 0) {
  console.log(`✓ ${normalizedEmail} is already an admin`)
  process.exit(0)
}

// Add to allowlist
await db.insert(AdminAllowlistTable).values({
  id: createDenTypeId("adminAllowlist"),
  email: normalizedEmail,
  note: "Added via add-admin.mjs script",
})

console.log(`✓ Added ${normalizedEmail} to admin allowlist`)

// Show all admins
console.log("\nCurrent admins:")
const admins = await db.select().from(AdminAllowlistTable)
for (const admin of admins) {
  console.log(`  - ${admin.email}`)
}

process.exit(0)
