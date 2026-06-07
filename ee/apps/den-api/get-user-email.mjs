#!/usr/bin/env node
import "./src/load-env.js"
import { db } from "./src/db.js"
import { AuthUserTable } from "@openwork-ee/den-db/schema"

const userId = process.argv[2] || "usr_01ktaz6f3vfzs87mr6j3gjz3a5"

const users = await db
  .select()
  .from(AuthUserTable)
  .where((t) => t.id.eq(userId))
  .limit(1)

if (users.length === 0) {
  console.log(`User ${userId} not found`)
  process.exit(1)
}

const user = users[0]
console.log(`User: ${user.name || '(no name)'}`)
console.log(`Email: ${user.email}`)
console.log(`ID: ${user.id}`)
