import { eq, sql } from "@openwork-ee/den-db/drizzle"
import { AdminAllowlistTable, AuthSessionTable, AuthUserTable } from "@openwork-ee/den-db/schema"
import { createDenTypeId } from "@openwork-ee/utils/typeid"
import { db } from "./db.js"
import { env } from "./env.js"

// Headless admin service account.
//
// When DEN_SERVICE_ACCOUNT_TOKEN is set, this seeds (idempotently, at startup):
//   1. a service-account user (unique by email),
//   2. an admin-allowlist entry for that user (full admin / Den control),
//   3. a long-lived `session` row whose `token` equals the configured value.
//
// Automation then authenticates by sending `Authorization: Bearer <token>`,
// which getSessionFromBearerToken() resolves to this admin user — no interactive
// OAuth login required. The token is a bearer credential: keep it secret and
// rotate by changing the env var (a new value reseeds; the session is unique by
// token so stale tokens can be deleted).

const SERVICE_ACCOUNT_DEFAULT_EMAIL = "den-service-account@soapbox.build"
const SERVICE_ACCOUNT_NAME = "Den Service Account"
const SERVICE_ACCOUNT_NOTE = "Den headless admin service account"
// ~100 years; effectively non-expiring so the bearer token stays valid.
const SESSION_TTL_MS = 100 * 365 * 24 * 60 * 60 * 1000

let ensureServiceAccountSeededPromise: Promise<void> | null = null

async function seedServiceAccount() {
  const token = env.serviceAccount.token
  if (!token) {
    console.log("[serviceAccount] DEN_SERVICE_ACCOUNT_TOKEN not set; skipping seed")
    return
  }

  const email = (env.serviceAccount.email ?? SERVICE_ACCOUNT_DEFAULT_EMAIL).toLowerCase().trim()

  // 1. Service-account user (unique by email).
  await db
    .insert(AuthUserTable)
    .values({
      id: createDenTypeId("user"),
      name: SERVICE_ACCOUNT_NAME,
      email,
      emailVerified: true,
    })
    .onDuplicateKeyUpdate({
      set: {
        name: SERVICE_ACCOUNT_NAME,
        emailVerified: true,
        updatedAt: sql`CURRENT_TIMESTAMP(3)`,
      },
    })

  const [userRow] = await db
    .select({ id: AuthUserTable.id })
    .from(AuthUserTable)
    .where(eq(AuthUserTable.email, email))
    .limit(1)

  if (!userRow) {
    throw new Error("[serviceAccount] user row missing after upsert")
  }

  // 2. Grant admin.
  await db
    .insert(AdminAllowlistTable)
    .values({
      id: createDenTypeId("adminAllowlist"),
      email,
      note: SERVICE_ACCOUNT_NOTE,
    })
    .onDuplicateKeyUpdate({
      set: {
        note: SERVICE_ACCOUNT_NOTE,
        updated_at: sql`CURRENT_TIMESTAMP(3)`,
      },
    })

  // 3. Long-lived session whose token is the configured bearer credential
  //    (unique by token; rebind to the service-account user and refresh expiry).
  const expiresAt = new Date(Date.now() + SESSION_TTL_MS)
  await db
    .insert(AuthSessionTable)
    .values({
      id: createDenTypeId("session"),
      userId: userRow.id,
      token,
      expiresAt,
    })
    .onDuplicateKeyUpdate({
      set: {
        userId: userRow.id,
        expiresAt,
        updatedAt: sql`CURRENT_TIMESTAMP(3)`,
      },
    })

  console.log(`[serviceAccount] seeded admin service account ${email}`)
}

export async function ensureServiceAccountSeeded() {
  if (!ensureServiceAccountSeededPromise) {
    ensureServiceAccountSeededPromise = seedServiceAccount().catch((error) => {
      ensureServiceAccountSeededPromise = null
      throw error
    })
  }

  await ensureServiceAccountSeededPromise
}
