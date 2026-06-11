import { describe, expect, mock, test, beforeEach, afterEach } from "bun:test"

const fakeVector = Array.from({ length: 1536 }, (_, i) => i * 0.001)

describe("embedTexts", () => {
  let originalFetch: typeof fetch

  beforeEach(() => {
    originalFetch = global.fetch
  })

  afterEach(() => {
    global.fetch = originalFetch
  })

  test("returns one embedding vector per input text", async () => {
    global.fetch = mock(async () =>
      new Response(
        JSON.stringify({
          data: [{ embedding: fakeVector, index: 0 }],
          model: "text-embedding-ada-002",
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      ),
    ) as typeof fetch

    const { embedTexts } = await import("../../src/rag/embed.js")
    const result = await embedTexts(["hello world"], "test-api-key")

    expect(result).toHaveLength(1)
    expect(result[0]).toHaveLength(1536)
    expect(result[0]![0]).toBeCloseTo(0)
  })

  test("throws on non-200 response", async () => {
    global.fetch = mock(async () =>
      new Response(JSON.stringify({ error: { message: "invalid key" } }), {
        status: 401,
      }),
    ) as typeof fetch

    const { embedTexts } = await import("../../src/rag/embed.js")
    await expect(embedTexts(["hello"], "bad-key")).rejects.toThrow("embedding_failed")
  })

  test("sends Authorization header with Bearer token", async () => {
    let capturedHeaders: Record<string, string> = {}

    global.fetch = mock(async (_url: string | URL | Request, init?: RequestInit) => {
      capturedHeaders = Object.fromEntries(
        new Headers(init?.headers as HeadersInit).entries(),
      )
      return new Response(
        JSON.stringify({ data: [{ embedding: fakeVector, index: 0 }] }),
        { status: 200, headers: { "content-type": "application/json" } },
      )
    }) as typeof fetch

    const { embedTexts } = await import("../../src/rag/embed.js")
    await embedTexts(["test"], "my-api-key")

    expect(capturedHeaders["authorization"]).toBe("Bearer my-api-key")
  })

  test("handles batch of 20 texts in one call", async () => {
    let callCount = 0

    global.fetch = mock(async (_url: string | URL | Request, init?: RequestInit) => {
      callCount++
      const body = JSON.parse(init?.body as string)
      const data = (body.input as string[]).map((_: string, i: number) => ({
        embedding: fakeVector,
        index: i,
      }))
      return new Response(JSON.stringify({ data }), {
        status: 200,
        headers: { "content-type": "application/json" },
      })
    }) as typeof fetch

    const { embedTexts } = await import("../../src/rag/embed.js")
    const texts = Array.from({ length: 20 }, (_, i) => `text ${i}`)
    const result = await embedTexts(texts, "key")

    expect(result).toHaveLength(20)
    expect(callCount).toBe(1) // all 20 in one batch
  })
})
