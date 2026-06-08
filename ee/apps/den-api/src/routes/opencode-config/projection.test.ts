import { describe, expect, test } from "bun:test"
import {
  type OrgLlmProviderForProjection,
  projectOrgProvidersToOpencodeConfig,
} from "./projection.js"

describe("projectOrgProvidersToOpencodeConfig", () => {
  test("maps a custom OpenAI-compatible provider (baseURL + apiKey + models)", () => {
    const providers: OrgLlmProviderForProjection[] = [
      {
        providerId: "llmp_openrouter",
        name: "OpenRouter (ZDR)",
        providerConfig: {
          id: "openrouter",
          npm: "@ai-sdk/openai-compatible",
          options: { baseURL: "https://openrouter.ai/api/v1" },
        },
        apiKey: "sk-or-v1-secret",
        models: [
          { id: "deepseek/deepseek-chat-v3.1", name: "DeepSeek V3.1", config: {} },
          {
            id: "qwen/qwen3-coder",
            name: "Qwen3 Coder 480B",
            config: { limit: { context: 262144, output: 16384 } },
          },
        ],
      },
    ]

    const { config } = projectOrgProvidersToOpencodeConfig(providers)

    // keyed by the template id, not the den providerId
    expect(Object.keys(config.provider)).toEqual(["openrouter"])
    const or = config.provider.openrouter
    expect(or.npm).toBe("@ai-sdk/openai-compatible")
    // apiKey injected into options WITHOUT clobbering baseURL
    expect(or.options).toEqual({ baseURL: "https://openrouter.ai/api/v1", apiKey: "sk-or-v1-secret" })
    // models keyed by id, name + config merged
    expect(or.models).toEqual({
      "deepseek/deepseek-chat-v3.1": { name: "DeepSeek V3.1" },
      "qwen/qwen3-coder": { name: "Qwen3 Coder 480B", limit: { context: 262144, output: 16384 } },
    })
  })

  test("falls back to den providerId as the key when template has no id", () => {
    const providers: OrgLlmProviderForProjection[] = [
      {
        providerId: "anthropic",
        name: "Anthropic",
        providerConfig: { npm: "@ai-sdk/anthropic" },
        apiKey: "sk-ant-xxx",
        models: [{ id: "claude-opus-4-8", name: "Claude Opus 4.8", config: {} }],
      },
    ]
    const { config } = projectOrgProvidersToOpencodeConfig(providers)
    expect(Object.keys(config.provider)).toEqual(["anthropic"])
    expect(config.provider.anthropic.options).toEqual({ apiKey: "sk-ant-xxx" })
  })

  test("omits apiKey from options when the provider has none (env-based auth)", () => {
    const providers: OrgLlmProviderForProjection[] = [
      {
        providerId: "ollama",
        name: "Ollama",
        providerConfig: { id: "ollama", npm: "@ai-sdk/openai-compatible", options: { baseURL: "http://localhost:11434/v1" } },
        apiKey: null,
        models: [{ id: "llama3", name: "Llama 3", config: {} }],
      },
    ]
    const { config } = projectOrgProvidersToOpencodeConfig(providers)
    expect(config.provider.ollama.options).toEqual({ baseURL: "http://localhost:11434/v1" })
    expect((config.provider.ollama.options as Record<string, unknown>).apiKey).toBeUndefined()
  })

  test("strips a stray `models` from the stored template (model rows are authoritative)", () => {
    const providers: OrgLlmProviderForProjection[] = [
      {
        providerId: "custom",
        name: "Custom",
        providerConfig: { id: "custom", npm: "@ai-sdk/openai-compatible", models: { ghost: { name: "Ghost" } } },
        apiKey: "k",
        models: [{ id: "real", name: "Real", config: {} }],
      },
    ]
    const { config } = projectOrgProvidersToOpencodeConfig(providers)
    expect(config.provider.custom.models).toEqual({ real: { name: "Real" } })
  })

  test("preserves an explicit template name and projects multiple providers", () => {
    const providers: OrgLlmProviderForProjection[] = [
      {
        providerId: "a",
        name: "Den Name A",
        providerConfig: { id: "a", name: "Template Name A", npm: "x" },
        apiKey: "k1",
        models: [{ id: "m1", name: "M1", config: {} }],
      },
      {
        providerId: "b",
        name: "Den Name B",
        providerConfig: { id: "b", npm: "y" },
        apiKey: "k2",
        models: [{ id: "m2", name: "M2", config: {} }],
      },
    ]
    const { config } = projectOrgProvidersToOpencodeConfig(providers)
    expect(config.provider.a.name).toBe("Template Name A") // template name wins
    expect(config.provider.b.name).toBe("Den Name B") // falls back to den name
    expect(Object.keys(config.provider).sort()).toEqual(["a", "b"])
  })

  test("empty provider list -> empty provider map", () => {
    expect(projectOrgProvidersToOpencodeConfig([])).toEqual({ config: { provider: {} } })
  })
})
