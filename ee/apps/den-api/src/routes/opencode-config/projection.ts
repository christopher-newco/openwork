// Pure projection: an organization's configured LLM providers -> the `provider`
// block of an opencode config document. A cloud worker's opencode inherits this
// via opencode's native `.well-known/opencode` remote-config mechanism, so the
// org's model catalog appears in the worker with no per-workspace plumbing.
//
// Each org provider is stored as an opencode-shaped template (`providerConfig`:
// npm/api/env/options, WITHOUT models) plus a decrypted `apiKey` and a model
// list. We merge those into opencode's `provider` schema:
//   provider[<key>] = { ...template, name, options:{...,apiKey}, models:{ id: {...} } }

export type OrgLlmProviderForProjection = {
  /** Canonical provider id; used as the opencode provider-map key (e.g. "anthropic", "openrouter"). */
  providerId: string
  /** Human-readable provider name. */
  name: string
  /** opencode-shaped provider template WITHOUT models (npm, api, env, options, ...). */
  providerConfig: Record<string, unknown>
  /** Decrypted API key, or null when the provider authenticates via an env var. */
  apiKey: string | null
  /** Selected models for this provider. */
  models: Array<{ id: string; name: string; config: Record<string, unknown> }>
}

export type OpencodeConfigDocument = {
  config: {
    provider: Record<string, Record<string, unknown>>
  }
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? { ...(value as Record<string, unknown>) }
    : {}
}

/**
 * Project the org's providers into an opencode config document.
 * Pure and dependency-free: callers pass already-fetched rows (with the key
 * decrypted). Providers are emitted faithfully — whatever the org configured.
 */
export function projectOrgProvidersToOpencodeConfig(
  providers: OrgLlmProviderForProjection[],
): OpencodeConfigDocument {
  const provider: Record<string, Record<string, unknown>> = {}

  for (const p of providers) {
    const template = asRecord(p.providerConfig)
    // The provider-map key: prefer an explicit id in the stored template, else the den providerId.
    const key =
      typeof template.id === "string" && template.id.trim().length > 0
        ? (template.id as string)
        : p.providerId
    // The model list is authoritative from the model rows; never let a stray
    // `models` in the template leak through.
    delete template.models

    const options = asRecord(template.options)
    if (p.apiKey && p.apiKey.trim().length > 0) {
      options.apiKey = p.apiKey
    }

    const models: Record<string, Record<string, unknown>> = {}
    for (const m of p.models) {
      models[m.id] = { name: m.name, ...asRecord(m.config) }
    }

    provider[key] = {
      ...template,
      name: typeof template.name === "string" && template.name.length > 0 ? template.name : p.name,
      options,
      models,
    }
  }

  return { config: { provider } }
}
