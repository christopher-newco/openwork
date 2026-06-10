// Set required env vars before any module imports — env.ts is evaluated on first import
process.env.RAG_DATABASE_URL =
  process.env.RAG_DATABASE_URL ?? "postgresql://localhost/openwork_rag_test"
process.env.RAG_EMBED_API_KEY = "test-embed-key"
process.env.DEN_DB_ENCRYPTION_KEY = "x".repeat(32)
process.env.BETTER_AUTH_SECRET = "y".repeat(32)
process.env.BETTER_AUTH_URL = "http://localhost:3000"
// env.ts requires planetscale vars when no DATABASE_URL is set
process.env.DATABASE_HOST = process.env.DATABASE_HOST ?? "localhost"
process.env.DATABASE_USERNAME = process.env.DATABASE_USERNAME ?? "root"
process.env.DATABASE_PASSWORD = process.env.DATABASE_PASSWORD ?? "test-password"

import { afterEach, beforeEach, describe, expect, mock, test } from "bun:test"

const fakeVector = Array.from({ length: 1536 }, () => 0.1)

function seedEnv() {
  // env vars already set at module top-level before imports
}

describe("searchDocuments", () => {
  let originalFetch: typeof fetch

  beforeEach(() => {
    seedEnv()
    originalFetch = global.fetch
    global.fetch = mock(async (url: string | URL | Request) => {
      const urlStr = typeof url === "string" ? url : url.toString()
      if (urlStr.includes("openai.com")) {
        return new Response(
          JSON.stringify({ data: [{ embedding: fakeVector, index: 0 }] }),
          { status: 200, headers: { "content-type": "application/json" } },
        )
      }
      return new Response("not found", { status: 404 })
    }) as typeof fetch
  })

  afterEach(() => {
    global.fetch = originalFetch
  })

  test("searchDocuments is exported", async () => {
    const mod = await import("../../src/rag/search.js")
    expect(typeof mod.searchDocuments).toBe("function")
  })

  test("returns array (empty or with results) for valid query", async () => {
    const { searchDocuments } = await import("../../src/rag/search.js")
    const results = await searchDocuments({
      query: "test query",
      orgId: "org_test",
      workspaceId: "ws_test",
      limit: 5,
    }).catch((e: Error & { cause?: unknown }) => {
      // ECONNREFUSED is acceptable — no DB available (may be wrapped by DrizzleQueryError)
      const causeCode = (e.cause as { code?: string } | undefined)?.code ?? ""
      const msg = e.message + String(e.cause ?? "") + causeCode
      if (msg.includes("ECONNREFUSED") || msg.includes("connect") || causeCode === "ECONNREFUSED") return null
      throw e
    })
    if (results === null) return // DB not available, skip
    expect(Array.isArray(results)).toBe(true)
    expect(results.length).toBeLessThanOrEqual(5)
  })

  test("result items have expected shape", async () => {
    const { searchDocuments } = await import("../../src/rag/search.js")
    const results = await searchDocuments({
      query: "anything",
      orgId: "org_test",
      limit: 3,
    }).catch((e: Error & { cause?: unknown }) => {
      // ECONNREFUSED is acceptable — no DB available (may be wrapped by DrizzleQueryError)
      const causeCode = (e.cause as { code?: string } | undefined)?.code ?? ""
      const msg = e.message + String(e.cause ?? "") + causeCode
      if (msg.includes("ECONNREFUSED") || msg.includes("connect") || causeCode === "ECONNREFUSED") return null
      throw e
    })
    if (results === null) return
    for (const r of results) {
      expect(r).toHaveProperty("content")
      expect(r).toHaveProperty("documentId")
      expect(r).toHaveProperty("filename")
      expect(r).toHaveProperty("score")
    }
  })
})
