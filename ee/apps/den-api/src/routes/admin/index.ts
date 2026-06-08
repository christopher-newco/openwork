import { asc, desc, eq, isNotNull, sql } from "@openwork-ee/den-db/drizzle"
import { AuthAccountTable, AuthSessionTable, AuthUserTable, WorkerTable, AdminAllowlistTable } from "@openwork-ee/den-db/schema"
import type { Hono } from "hono"
import { describeRoute } from "hono-openapi"
import { z } from "zod"
import { getCloudWorkerAdminBillingStatus } from "../../billing/polar.js"
import { db } from "../../db.js"
import { queryValidator, requireAdminMiddleware, requireUserMiddleware, resolveUserOrganizationsMiddleware } from "../../middleware/index.js"
import { denTypeIdSchema, invalidRequestSchema, jsonResponse, unauthorizedSchema } from "../../openapi.js"
import type { AuthContextVariables } from "../../session.js"

type UserId = typeof AuthUserTable.$inferSelect.id

const overviewQuerySchema = z.object({
  includeBilling: z.string().optional(),
})

const adminOverviewResponseSchema = z.object({
  viewer: z.object({
    id: denTypeIdSchema("user"),
    email: z.string(),
    name: z.string().nullable(),
  }),
  admins: z.array(z.object({}).passthrough()),
  summary: z.object({}).passthrough(),
  users: z.array(z.object({}).passthrough()),
  generatedAt: z.string().datetime(),
}).meta({ ref: "AdminOverviewResponse" })

function normalizeEmail(value: string | null | undefined) {
  return value?.trim().toLowerCase() ?? ""
}

function toNumber(value: unknown) {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value
  }

  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : 0
}

function isWithinDays(value: Date | string | null, days: number) {
  if (!value) {
    return false
  }

  const date = value instanceof Date ? value : new Date(value)
  if (Number.isNaN(date.getTime())) {
    return false
  }

  const windowMs = days * 24 * 60 * 60 * 1000
  return Date.now() - date.getTime() <= windowMs
}

function normalizeProvider(providerId: string) {
  const normalized = providerId.trim().toLowerCase()
  if (!normalized) {
    return "unknown"
  }

  if (normalized === "credential" || normalized === "email-password") {
    return "email"
  }

  return normalized
}

function parseBooleanQuery(value: string | undefined): boolean {
  if (!value) {
    return false
  }

  const normalized = value.trim().toLowerCase()
  return normalized === "1" || normalized === "true" || normalized === "yes"
}

async function mapWithConcurrency<T, R>(items: T[], limit: number, mapper: (item: T) => Promise<R>) {
  if (items.length === 0) {
    return [] as R[]
  }

  const results = new Array<R>(items.length)
  let nextIndex = 0

  async function runWorker() {
    while (nextIndex < items.length) {
      const currentIndex = nextIndex
      nextIndex += 1
      results[currentIndex] = await mapper(items[currentIndex])
    }
  }

  const workerCount = Math.max(1, Math.min(limit, items.length))
  await Promise.all(Array.from({ length: workerCount }, () => runWorker()))
  return results
}

export function registerAdminRoutes<T extends { Variables: AuthContextVariables }>(app: Hono<T>) {
  app.get(
    "/v1/admin/list-orgs",
    describeRoute({
      tags: ["Admin"],
      summary: "List all organizations",
      description: "Lists all organizations in the database for debugging.",
      responses: {
        200: jsonResponse("Organizations listed.", z.object({ orgs: z.array(z.any()) })),
        401: jsonResponse("Must be authenticated as admin.", unauthorizedSchema),
      },
    }),
    requireAdminMiddleware,
    async (c) => {
      const { OrganizationTable } = await import("@openwork-ee/den-db/schema")
      const orgs = await db.select().from(OrganizationTable)
      console.log(`[list-orgs] Found ${orgs.length} organization(s)`)
      for (const org of orgs) {
        console.log(`  - ${org.name} (slug: ${org.slug}, id: ${org.id})`)
      }
      return c.json({ orgs })
    },
  )

  app.post(
    "/v1/admin/delete-all-workers",
    describeRoute({
      tags: ["Admin"],
      summary: "Delete all workers",
      description: "Deletes all worker records from the database (including tokens and instances).",
      responses: {
        200: jsonResponse("Workers deleted.", z.object({ message: z.string(), deletedCount: z.number() })),
        401: jsonResponse("Must be authenticated as admin.", unauthorizedSchema),
      },
    }),
    requireAdminMiddleware,
    async (c) => {
      const { WorkerTokenTable, WorkerInstanceTable } = await import("@openwork-ee/den-db/schema")

      console.log('=== Deleting all workers ===')
      const workers = await db.select().from(WorkerTable)
      console.log(`Found ${workers.length} worker(s)`)

      for (const worker of workers) {
        console.log(`Deleting worker: ${worker.name} (${worker.id})`)

        // Delete tokens
        await db.delete(WorkerTokenTable).where(eq(WorkerTokenTable.worker_id, worker.id))
        console.log(`  - Deleted tokens`)

        // Delete instances
        await db.delete(WorkerInstanceTable).where(eq(WorkerInstanceTable.worker_id, worker.id))
        console.log(`  - Deleted instances`)

        // Delete worker
        await db.delete(WorkerTable).where(eq(WorkerTable.id, worker.id))
        console.log(`  ✓ Deleted worker ${worker.id}`)
      }

      const remaining = await db.select().from(WorkerTable)
      console.log(`Remaining workers: ${remaining.length}`)

      return c.json({
        message: `Deleted ${workers.length} worker(s)`,
        deletedCount: workers.length
      })
    },
  )

  app.post(
    "/v1/admin/grant-self-admin",
    describeRoute({
      tags: ["Admin"],
      summary: "Grant admin to self",
      description: "Adds the current user to the admin allowlist. Only works once for bootstrapping the first admin.",
      responses: {
        200: jsonResponse("Admin access granted.", z.object({ message: z.string() })),
        401: jsonResponse("Must be authenticated.", unauthorizedSchema),
      },
    }),
    requireUserMiddleware,
    async (c) => {
      const user = c.get("user")
      if (!user) {
        return c.json({ error: "unauthorized" }, 401)
      }

      const { AdminAllowlistTable } = await import("@openwork-ee/den-db/schema")
      const { createDenTypeId } = await import("@openwork-ee/utils/typeid")

      const normalizedEmail = user.email.toLowerCase().trim()

      // Check if already exists
      const existing = await db
        .select()
        .from(AdminAllowlistTable)
        .where(eq(AdminAllowlistTable.email, normalizedEmail))
        .limit(1)

      if (existing.length > 0) {
        return c.json({ message: `${normalizedEmail} is already an admin` })
      }

      // Add to allowlist
      await db.insert(AdminAllowlistTable).values({
        id: createDenTypeId("adminAllowlist"),
        email: normalizedEmail,
        note: "Self-granted via grant-self-admin endpoint",
      })

      return c.json({ message: `Admin access granted to ${normalizedEmail}` })
    },
  )

  app.post(
    "/v1/admin/add-org-member",
    describeRoute({
      tags: ["Admin"],
      summary: "Add a user to an organization",
      description:
        "Adds the user with the given email to an organization as a member (default role owner). Defaults to the only organization when organizationId is omitted. Admin only.",
      responses: {
        200: jsonResponse(
          "Membership ensured.",
          z.object({
            message: z.string(),
            userId: z.string(),
            organizationId: z.string(),
            role: z.string(),
          }),
        ),
        400: jsonResponse("Invalid request.", invalidRequestSchema),
        401: jsonResponse("Must be authenticated.", unauthorizedSchema),
        404: jsonResponse("User or organization not found.", invalidRequestSchema),
      },
    }),
    requireAdminMiddleware,
    async (c) => {
      const { MemberTable, OrganizationTable } = await import("@openwork-ee/den-db/schema")
      const { createDenTypeId } = await import("@openwork-ee/utils/typeid")
      const { ensureUserOrgAccess } = await import("../../orgs.js")

      let body: { email?: string; organizationId?: string; role?: string }
      try {
        body = await c.req.json()
      } catch {
        return c.json({ error: "invalid_json" }, 400)
      }

      const email = (body.email ?? "").toLowerCase().trim()
      if (!email) {
        return c.json({ error: "email_required" }, 400)
      }
      const role = body.role === "member" ? "member" : "owner"

      // Resolve the user by email.
      const [userRow] = await db
        .select({ id: AuthUserTable.id })
        .from(AuthUserTable)
        .where(eq(AuthUserTable.email, email))
        .limit(1)
      if (!userRow) {
        return c.json(
          { error: "user_not_found", message: `No user with email ${email}. They must sign in once first.` },
          404,
        )
      }

      // Resolve the org: explicit id, or the only org if there's exactly one.
      let organizationId = body.organizationId?.trim() || ""
      if (!organizationId) {
        const orgs = await db.select({ id: OrganizationTable.id }).from(OrganizationTable).limit(2)
        if (orgs.length === 0) {
          return c.json({ error: "no_organizations" }, 404)
        }
        if (orgs.length > 1) {
          return c.json({ error: "organization_id_required", message: "Multiple orgs exist; specify organizationId." }, 400)
        }
        organizationId = orgs[0].id
      } else {
        const [org] = await db
          .select({ id: OrganizationTable.id })
          .from(OrganizationTable)
          .where(eq(OrganizationTable.id, organizationId))
          .limit(1)
        if (!org) {
          return c.json({ error: "organization_not_found" }, 404)
        }
      }

      // Upsert the membership (idempotent on the (organization_id, user_id) unique index).
      await db
        .insert(MemberTable)
        .values({
          id: createDenTypeId("member"),
          organizationId,
          userId: userRow.id,
          role,
        })
        .onDuplicateKeyUpdate({
          set: {
            role,
            removedAt: sql`NULL`,
          },
        })

      // Initialize the org's dynamic roles for this user (also a no-op safety net).
      await ensureUserOrgAccess({ userId: userRow.id })

      return c.json({
        message: `${email} is now a ${role} of ${organizationId}`,
        userId: userRow.id,
        organizationId,
        role,
      })
    },
  )

  app.get(
    "/v1/admin/overview",
    describeRoute({
      tags: ["Admin"],
      summary: "Get admin overview",
      description: "Returns a high-level administrative overview of users, sessions, workers, admins, and optional billing data for Den operations.",
      responses: {
        200: jsonResponse("Administrative overview returned successfully.", adminOverviewResponseSchema),
        400: jsonResponse("The admin overview query parameters were invalid.", invalidRequestSchema),
        401: jsonResponse("The caller must be an authenticated admin.", unauthorizedSchema),
      },
    }),
    requireAdminMiddleware,
    queryValidator(overviewQuerySchema),
    async (c) => {
    const user = c.get("user")
    const query = c.req.valid("query")
    const includeBilling = parseBooleanQuery(query.includeBilling)

    const [admins, users, workerStatsRows, sessionStatsRows, accountRows] = await Promise.all([
      db
        .select({
          email: AdminAllowlistTable.email,
          note: AdminAllowlistTable.note,
          createdAt: AdminAllowlistTable.created_at,
        })
        .from(AdminAllowlistTable)
        .orderBy(asc(AdminAllowlistTable.email)),
      db.select().from(AuthUserTable).orderBy(desc(AuthUserTable.createdAt)),
      db
        .select({
          userId: WorkerTable.created_by_user_id,
          workerCount: sql<number>`count(*)`,
          cloudWorkerCount: sql<number>`sum(case when ${WorkerTable.destination} = 'cloud' then 1 else 0 end)`,
          localWorkerCount: sql<number>`sum(case when ${WorkerTable.destination} = 'local' then 1 else 0 end)`,
          latestWorkerCreatedAt: sql<Date | null>`max(${WorkerTable.created_at})`,
        })
        .from(WorkerTable)
        .where(isNotNull(WorkerTable.created_by_user_id))
        .groupBy(WorkerTable.created_by_user_id),
      db
        .select({
          userId: AuthSessionTable.userId,
          sessionCount: sql<number>`count(*)`,
          lastSeenAt: sql<Date | null>`max(${AuthSessionTable.updatedAt})`,
        })
        .from(AuthSessionTable)
        .groupBy(AuthSessionTable.userId),
      db
        .select({
          userId: AuthAccountTable.userId,
          providerId: AuthAccountTable.providerId,
        })
        .from(AuthAccountTable),
    ])

    const workerStatsByUser = new Map<UserId, {
      workerCount: number
      cloudWorkerCount: number
      localWorkerCount: number
      latestWorkerCreatedAt: Date | string | null
    }>()

    for (const row of workerStatsRows) {
      if (!row.userId) {
        continue
      }

      workerStatsByUser.set(row.userId, {
        workerCount: toNumber(row.workerCount),
        cloudWorkerCount: toNumber(row.cloudWorkerCount),
        localWorkerCount: toNumber(row.localWorkerCount),
        latestWorkerCreatedAt: row.latestWorkerCreatedAt,
      })
    }

    const sessionStatsByUser = new Map<UserId, {
      sessionCount: number
      lastSeenAt: Date | string | null
    }>()

    for (const row of sessionStatsRows) {
      sessionStatsByUser.set(row.userId, {
        sessionCount: toNumber(row.sessionCount),
        lastSeenAt: row.lastSeenAt,
      })
    }

    const providersByUser = new Map<UserId, Set<string>>()
    for (const row of accountRows) {
      const providerId = normalizeProvider(row.providerId)
      const existing = providersByUser.get(row.userId) ?? new Set<string>()
      existing.add(providerId)
      providersByUser.set(row.userId, existing)
    }

    const defaultBilling = {
      status: "unavailable" as const,
      featureGateEnabled: false,
      subscriptionId: null,
      subscriptionStatus: null,
      currentPeriodEnd: null,
      source: "unavailable" as const,
      note: "Billing lookup unavailable.",
    }

    const billingRows = includeBilling
      ? await mapWithConcurrency(users, 4, async (entry) => ({
          userId: entry.id,
          billing: await getCloudWorkerAdminBillingStatus({
            userId: entry.id,
            email: entry.email,
            name: entry.name ?? entry.email,
          }),
        }))
      : []

    const billingByUser = new Map(billingRows.map((row) => [row.userId, row.billing]))

    const userRows = users.map((entry) => {
      const workerStats = workerStatsByUser.get(entry.id) ?? {
        workerCount: 0,
        cloudWorkerCount: 0,
        localWorkerCount: 0,
        latestWorkerCreatedAt: null,
      }
      const sessionStats = sessionStatsByUser.get(entry.id) ?? {
        sessionCount: 0,
        lastSeenAt: null,
      }
      const authProviders = Array.from(providersByUser.get(entry.id) ?? []).sort()

      return {
        id: entry.id,
        name: entry.name,
        email: entry.email,
        emailVerified: entry.emailVerified,
        createdAt: entry.createdAt,
        updatedAt: entry.updatedAt,
        lastSeenAt: sessionStats.lastSeenAt,
        sessionCount: sessionStats.sessionCount,
        authProviders,
        workerCount: workerStats.workerCount,
        cloudWorkerCount: workerStats.cloudWorkerCount,
        localWorkerCount: workerStats.localWorkerCount,
        latestWorkerCreatedAt: workerStats.latestWorkerCreatedAt,
        billing: includeBilling ? billingByUser.get(entry.id) ?? defaultBilling : null,
      }
    })

    const summary = userRows.reduce(
      (accumulator, entry) => {
        accumulator.totalUsers += 1
        accumulator.totalWorkers += entry.workerCount
        accumulator.cloudWorkers += entry.cloudWorkerCount
        accumulator.localWorkers += entry.localWorkerCount

        if (entry.emailVerified) {
          accumulator.verifiedUsers += 1
        }

        if (entry.workerCount > 0) {
          accumulator.usersWithWorkers += 1
        }

        if (includeBilling && entry.billing) {
          if (entry.billing.status === "paid") {
            accumulator.paidUsers += 1
          } else if (entry.billing.status === "unpaid") {
            accumulator.unpaidUsers += 1
          } else {
            accumulator.billingUnavailableUsers += 1
          }
        }

        if (isWithinDays(entry.createdAt, 7)) {
          accumulator.recentUsers7d += 1
        }

        if (isWithinDays(entry.createdAt, 30)) {
          accumulator.recentUsers30d += 1
        }

        return accumulator
      },
      {
        totalUsers: 0,
        verifiedUsers: 0,
        recentUsers7d: 0,
        recentUsers30d: 0,
        totalWorkers: 0,
        cloudWorkers: 0,
        localWorkers: 0,
        usersWithWorkers: 0,
        paidUsers: 0,
        unpaidUsers: 0,
        billingUnavailableUsers: 0,
      },
    )

    return c.json({
      viewer: {
        id: user.id,
        email: normalizeEmail(user.email),
        name: user.name,
      },
      admins,
      summary: {
        ...summary,
        adminCount: admins.length,
        billingLoaded: includeBilling,
        paidUsers: includeBilling ? summary.paidUsers : null,
        unpaidUsers: includeBilling ? summary.unpaidUsers : null,
        billingUnavailableUsers: includeBilling ? summary.billingUnavailableUsers : null,
        usersWithoutWorkers: summary.totalUsers - summary.usersWithWorkers,
      },
      users: userRows,
      generatedAt: new Date().toISOString(),
    })
    },
  )

  const fixSoapboxWorkerHandler = async (c: any) => {
      const { randomBytes } = await import("node:crypto")
      const { WorkerTokenTable, OrganizationTable, WorkerInstanceTable } = await import("@openwork-ee/den-db/schema")
      const { continueCloudProvisioning } = await import("../workers/shared.js")

      const token = () => randomBytes(32).toString("hex")

      console.log("=== Recreating Worker with Docker Deployment ===")

      // Get user's active organization
      const activeOrgId = c.get("activeOrganizationId")
      console.log("1. Looking up organization...")
      console.log(`   Active org ID from context: ${activeOrgId}`)

      if (!activeOrgId) {
        return c.json({ error: "No active organization" }, 400)
      }

      const orgs = await db
        .select()
        .from(OrganizationTable)
        .where(eq(OrganizationTable.id, activeOrgId))
        .limit(1)

      const org = orgs[0]
      if (!org) {
        return c.json({ error: "Organization not found" }, 404)
      }
      console.log(`   ✓ Found: ${org.name} (${org.id})`)

      // Delete existing workers
      console.log("2. Deleting existing workers...")
      const workers = await db
        .select()
        .from(WorkerTable)
        .where(eq(WorkerTable.org_id, org.id))

      console.log(`   Found ${workers.length} existing worker(s)`)

      for (const worker of workers) {
        console.log(`   Deleting: ${worker.name} (${worker.id})`)
        await db.delete(WorkerInstanceTable).where(eq(WorkerInstanceTable.worker_id, worker.id))
        await db.delete(WorkerTokenTable).where(eq(WorkerTokenTable.worker_id, worker.id))
        await db.delete(WorkerTable).where(eq(WorkerTable.id, worker.id))
        console.log(`   ✓ Deleted ${worker.id}`)
      }

      // Create new worker
      const { createDenTypeId } = await import("@openwork-ee/utils/typeid")
      const workerId = createDenTypeId("worker")
      const workerName = `${org.name} Workspace`

      console.log("3. Creating new Docker-based worker...")
      console.log(`   Name: ${workerName}`)
      console.log(`   ID: ${workerId}`)

      await db.insert(WorkerTable).values({
        id: workerId,
        org_id: org.id,
        created_by_user_id: null,
        name: workerName,
        description: "Cloud workspace on Render with Docker deployment and 40GB disk",
        destination: "cloud",
        status: "provisioning",
        image_version: null,
        workspace_path: null,
        sandbox_backend: null,
      })

      // Generate tokens
      const hostToken = token()
      const clientToken = token()
      const activityToken = token()

      await db.insert(WorkerTokenTable).values([
        {
          id: createDenTypeId("workerToken"),
          worker_id: workerId,
          scope: "host",
          token: hostToken,
        },
        {
          id: createDenTypeId("workerToken"),
          worker_id: workerId,
          scope: "client",
          token: clientToken,
        },
        {
          id: createDenTypeId("workerToken"),
          worker_id: workerId,
          scope: "activity",
          token: activityToken,
        },
      ])

      console.log(`   ✓ Worker record created`)
      console.log(`   Host Token: ${hostToken.substring(0, 16)}...`)
      console.log(`   Client Token: ${clientToken.substring(0, 16)}...`)

      // Start Render provisioning
      console.log("4. Starting Render provisioning with Docker...")

      try {
        await continueCloudProvisioning({
          workerId,
          name: workerName,
          hostToken,
          clientToken,
          activityToken,
        })

        console.log("\n✅ SUCCESS! Worker provisioned with Docker deployment")

        return c.json({
          message: "Worker recreated with Docker deployment on Render. Build will complete in 2-5 minutes.",
          workerId,
          renderDashboard: "https://dashboard.render.com",
          workspaceUrl: "https://app.soapbox.build",
        })
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error)
        console.error(`❌ Error: ${errorMessage}`)

        return c.json({
          error: "provisioning_failed",
          message: errorMessage,
          workerId,
        }, 500)
      }
    }

  app.get(
    "/v1/admin/fix-soapbox-worker",
    describeRoute({
      tags: ["Admin"],
      summary: "Fix Soapbox worker (GET)",
      description: "Deletes broken workers and provisions a new Docker-based Render worker for your active organization with 40GB persistent disk.",
      responses: {
        200: jsonResponse("Worker provisioned successfully.", z.object({ message: z.string(), workerId: z.string() })),
        401: jsonResponse("The caller must be an authenticated admin.", unauthorizedSchema),
      },
    }),
    requireAdminMiddleware,
    resolveUserOrganizationsMiddleware,
    fixSoapboxWorkerHandler,
  )

  app.post(
    "/v1/admin/fix-soapbox-worker",
    describeRoute({
      tags: ["Admin"],
      summary: "Fix Soapbox worker (POST)",
      description: "Deletes broken workers and provisions a new Docker-based Render worker for your active organization with 40GB persistent disk.",
      responses: {
        200: jsonResponse("Worker provisioned successfully.", z.object({ message: z.string(), workerId: z.string() })),
        401: jsonResponse("The caller must be an authenticated admin.", unauthorizedSchema),
      },
    }),
    requireAdminMiddleware,
    resolveUserOrganizationsMiddleware,
    fixSoapboxWorkerHandler,
  )
}
