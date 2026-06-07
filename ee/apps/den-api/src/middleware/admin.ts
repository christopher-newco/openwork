import { eq } from "@openwork-ee/den-db/drizzle"
import { AdminAllowlistTable } from "@openwork-ee/den-db/schema"
import type { MiddlewareHandler } from "hono"
import { ensureAdminAllowlistSeeded } from "../admin-allowlist.js"
import { db } from "../db.js"
import type { AuthContextVariables } from "../session.js"

function normalizeEmail(value: string | null | undefined) {
  return value?.trim().toLowerCase() ?? ""
}

export const requireAdminMiddleware: MiddlewareHandler<{ Variables: AuthContextVariables }> = async (c, next) => {
  const user = c.get("user")
  if (!user?.id) {
    return c.json({ error: "unauthorized" }, 401) as never
  }

  const email = normalizeEmail(user.email)
  if (!email) {
    return c.json({ error: "admin_email_required" }, 403) as never
  }

  console.log(`[requireAdminMiddleware] Checking admin access for ${email}`)

  await ensureAdminAllowlistSeeded()

  const allowed = await db
    .select({ id: AdminAllowlistTable.id })
    .from(AdminAllowlistTable)
    .where(eq(AdminAllowlistTable.email, email))
    .limit(1)

  console.log(`[requireAdminMiddleware] Found ${allowed.length} matching admins`)

  if (allowed.length === 0) {
    // Log all admins for debugging
    const allAdmins = await db.select({ email: AdminAllowlistTable.email }).from(AdminAllowlistTable)
    console.log(`[requireAdminMiddleware] All admins in allowlist:`, allAdmins.map(a => a.email))
    return c.json({ error: "forbidden" }, 403) as never
  }

  await next()
}
