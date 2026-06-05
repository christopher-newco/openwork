import { and, asc, eq, isNull } from "@openwork-ee/den-db/drizzle"
import { MemberTable } from "@openwork-ee/den-db/schema"
import { normalizeDenTypeId } from "@openwork-ee/utils/typeid"
import { db } from "./db.js"

export async function getInitialActiveOrganizationIdForUser(userId: string) {
  try {
    if (!userId) {
      console.error("[getInitialActiveOrganizationIdForUser] No userId provided")
      return null
    }

    const normalizedUserId = normalizeDenTypeId("user", userId)
    console.log(`[getInitialActiveOrganizationIdForUser] Looking up org for userId: ${userId} (normalized: ${normalizedUserId})`)

    const rows = await db
      .select({
        organizationId: MemberTable.organizationId,
      })
      .from(MemberTable)
      .where(and(eq(MemberTable.userId, normalizedUserId), isNull(MemberTable.removedAt)))
      .orderBy(asc(MemberTable.createdAt))
      .limit(1)

    const organizationId = rows[0]?.organizationId ?? null
    console.log(`[getInitialActiveOrganizationIdForUser] Found organizationId: ${organizationId}`)

    return organizationId
  } catch (error) {
    console.error("[getInitialActiveOrganizationIdForUser] Error:", error)
    return null
  }
}
