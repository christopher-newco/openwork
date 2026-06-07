#!/usr/bin/env node
import "./src/load-env.js"
import { db } from "./src/db.js"
import { AuthUserTable, AdminAllowlistTable } from "@openwork-ee/den-db/schema"

console.log("=== All Users ===")
const users = await db.select().from(AuthUserTable)
for (const user of users) {
  console.log(`${user.email} (${user.id}) - ${user.name || '(no name)'}`)
}

console.log("\n=== Current Admins ===")
const admins = await db.select().from(AdminAllowlistTable)
for (const admin of admins) {
  console.log(`${admin.email}`)
}
