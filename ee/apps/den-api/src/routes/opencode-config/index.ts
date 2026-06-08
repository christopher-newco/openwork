import { eq, inArray } from "@openwork-ee/den-db/drizzle"
import { LlmProviderModelTable, LlmProviderTable } from "@openwork-ee/den-db/schema"
import type { Hono } from "hono"
import { getApiKeyScopedOrganizationId } from "../../api-keys.js"
import { db } from "../../db.js"
import type { AuthContextVariables } from "../../session.js"
import { type OrgLlmProviderForProjection, projectOrgProvidersToOpencodeConfig } from "./projection.js"

type OrganizationId = typeof LlmProviderTable.$inferSelect.organizationId

// Load every LLM provider the organization has configured (org-owned, not
// per-member access-gated — the worker's opencode inherits the whole org
// catalog), shaped for the pure projection.
async function loadOrgProvidersForProjection(
  organizationId: OrganizationId,
): Promise<OrgLlmProviderForProjection[]> {
  const providers = await db
    .select()
    .from(LlmProviderTable)
    .where(eq(LlmProviderTable.organizationId, organizationId))

  if (providers.length === 0) {
    return []
  }

  const providerIds = providers.map((provider) => provider.id)
  const models = await db
    .select()
    .from(LlmProviderModelTable)
    .where(inArray(LlmProviderModelTable.llmProviderId, providerIds))

  const modelsByProviderId = new Map<(typeof providers)[number]["id"], typeof models>()
  for (const model of models) {
    const existing = modelsByProviderId.get(model.llmProviderId) ?? []
    existing.push(model)
    modelsByProviderId.set(model.llmProviderId, existing)
  }

  return providers.map((provider) => ({
    providerId: provider.providerId,
    name: provider.name,
    providerConfig: provider.providerConfig ?? {},
    apiKey: provider.apiKey ?? null,
    models: (modelsByProviderId.get(provider.id) ?? []).map((model) => ({
      id: model.modelId,
      name: model.name,
      config: model.modelConfig ?? {},
    })),
  }))
}

/**
 * opencode-native org-config inheritance for cloud workers.
 *
 * A worker's opencode is seeded (in auth.json) with a `wellknown` entry pointing
 * at this den-api host. opencode then:
 *   1. GET  /.well-known/opencode            (unauthenticated discovery)
 *   2. GET  /v1/opencode-config              (follows remote_config.url, sends the
 *                                             org-scoped api key as x-api-key)
 * and merges the returned `{ config: { provider } }` natively. Re-fetched on each
 * opencode instance reload, so catalog changes propagate without a process restart.
 */
export function registerOpencodeConfigRoutes<T extends { Variables: AuthContextVariables }>(
  app: Hono<T>,
) {
  // Step 1 — discovery. opencode sends NO auth on this hop, so return only a
  // pointer to the authenticated config endpoint; no org data here.
  app.get("/.well-known/opencode", (c) => {
    const origin = new URL(c.req.url).origin
    return c.json({
      remote_config: {
        url: `${origin}/v1/opencode-config`,
        // {env:...} is substituted by opencode from the auth.json `wellknown`
        // token, keyed by the entry's `key` (SOAPBOX_ORG_TOKEN).
        headers: { "x-api-key": "{env:SOAPBOX_ORG_TOKEN}" },
      },
    })
  })

  // Step 2 — authenticated config. The org-scoped api key (x-api-key, populated
  // into c.apiKey by the global session middleware) resolves the organization.
  app.get("/v1/opencode-config", async (c) => {
    const organizationId = getApiKeyScopedOrganizationId(c.get("apiKey"))
    if (!organizationId) {
      return c.json(
        { error: "unauthorized", message: "An organization-scoped API key is required." },
        401,
      )
    }

    const providers = await loadOrgProvidersForProjection(organizationId)
    return c.json(projectOrgProvidersToOpencodeConfig(providers))
  })
}
