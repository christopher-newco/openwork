import { and, eq, sql } from "@openwork-ee/den-db/drizzle"
import { AdminAllowlistTable, AuthSessionTable, AuthUserTable, MemberTable, OrganizationTable } from "@openwork-ee/den-db/schema"
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
// Fixed far-future expiry. MySQL TIMESTAMP cannot exceed 2038-01-19 03:14:07 UTC
// (the 32-bit epoch limit); a larger value fails with errno 1292 "Incorrect
// datetime value". 2038-01-01 stays safely under that ceiling. The seed re-runs
// on every boot, so refresh this (or migrate the column to DATETIME) before then.
const SESSION_EXPIRES_AT = new Date("2038-01-01T00:00:00.000Z")

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
  const expiresAt = SESSION_EXPIRES_AT
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

  // 4. Revoke any *other* sessions for this user. The bearer credential lives in
  //    env; rotating it means the old token must stop working. Because the seed
  //    only upserts the current token's row, a previously-seeded token would
  //    otherwise keep authenticating. Delete every session for the service
  //    account except the one matching the configured token.
  const pruned = await db
    .delete(AuthSessionTable)
    .where(and(eq(AuthSessionTable.userId, userRow.id), sql`${AuthSessionTable.token} <> ${token}`))

  const prunedCount =
    typeof (pruned as { rowsAffected?: number })?.rowsAffected === "number"
      ? (pruned as { rowsAffected: number }).rowsAffected
      : 0
  if (prunedCount > 0) {
    console.log(`[serviceAccount] revoked ${prunedCount} stale session(s) for ${email}`)
  }

  // 5. Owner membership in every organization. Admin-allowlist alone is not enough
  //    to provision workers: POST /v1/workers resolves the active org from the
  //    user's `member` rows and rejects with 400 organization_unavailable when
  //    there is none. Make the service account an `owner` of each existing org so
  //    org-scoped automation (provisioning, refresh) works. The seed runs on every
  //    boot, so orgs created later get membership at the next restart; (member
  //    rows are unique by (organization_id, user_id), so this is idempotent).
  const orgs = await db.select({ id: OrganizationTable.id }).from(OrganizationTable)
  let memberships = 0
  for (const org of orgs) {
    await db
      .insert(MemberTable)
      .values({
        id: createDenTypeId("member"),
        organizationId: org.id,
        userId: userRow.id,
        role: "owner",
      })
      .onDuplicateKeyUpdate({
        set: {
          role: "owner",
          removedAt: sql`NULL`,
        },
      })
    memberships += 1
  }
  if (memberships > 0) {
    console.log(`[serviceAccount] ensured owner membership in ${memberships} organization(s) for ${email}`)
  }

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
