import { sql } from "@openwork-ee/den-db/drizzle"
import { AdminAllowlistTable } from "@openwork-ee/den-db/schema"
import { createDenTypeId } from "@openwork-ee/utils/typeid"
import { db } from "./db.js"

const ADMIN_ALLOWLIST_SEEDS = [
  {
    email: "ben@openworklabs.com",
    note: "Seeded internal admin",
  },
  {
    email: "jan@openworklabs.com",
    note: "Seeded internal admin",
  },
  {
    email: "omar@openworklabs.com",
    note: "Seeded internal admin",
  },
  {
    email: "berk@openworklabs.com",
    note: "Seeded internal admin",
  },
  {
    email: "chris.naismith@gmail.com",
    note: "Soapbox admin",
  },
  {
    email: "christopher@audette.io",
    note: "Soapbox admin",
  },
] as const

let ensureAdminAllowlistSeededPromise: Promise<void> | null = null

async function seedAdminAllowlist() {
  console.log(`[seedAdminAllowlist] Seeding ${ADMIN_ALLOWLIST_SEEDS.length} admin(s)`)
  for (const entry of ADMIN_ALLOWLIST_SEEDS) {
    try {
      await db
        .insert(AdminAllowlistTable)
        .values({
          id: createDenTypeId("adminAllowlist"),
          ...entry,
        })
        .onDuplicateKeyUpdate({
          set: {
            note: entry.note,
            updated_at: sql`CURRENT_TIMESTAMP(3)`,
          },
        })
      console.log(`[seedAdminAllowlist] Seeded/updated ${entry.email}`)
    } catch (error) {
      console.error(`[seedAdminAllowlist] Failed to seed ${entry.email}:`, error)
      throw error
    }
  }
  console.log('[seedAdminAllowlist] Seeding complete')
}

export async function ensureAdminAllowlistSeeded() {
  if (!ensureAdminAllowlistSeededPromise) {
    ensureAdminAllowlistSeededPromise = seedAdminAllowlist().catch((error) => {
      ensureAdminAllowlistSeededPromise = null
      throw error
    })
  }

  await ensureAdminAllowlistSeededPromise
}
