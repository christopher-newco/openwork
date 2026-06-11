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

// We mock global.fetch to avoid real OpenAI calls
const fakeVector = Array.from({ length: 1536 }, () => 0.1)

function seedEnv() {
  // env vars already set at module top-level before imports
}

describe("ingestFile", () => {
  let originalFetch: typeof fetch

  beforeEach(() => {
    seedEnv()
    originalFetch = global.fetch
    // Mock OpenAI embedding endpoint
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

  test("ingestFile is exported from ingest.ts", async () => {
    const mod = await import("../../src/rag/ingest.js")
    expect(typeof mod.ingestFile).toBe("function")
  })

  test("returns result with documentId, chunkCount, skipped=false for new file", async () => {
    const { ingestFile } = await import("../../src/rag/ingest.js")
    const bytes = Buffer.from("This is a test document with some content for RAG ingestion.")

    const result = await ingestFile({
      bytes,
      filename: "test-doc.txt",
      mimeType: "text/plain",
      orgId: "org_test_" + Date.now(),
      workspaceId: "ws_test",
      source: "agent",
    })

    expect(result.documentId).toBeString()
    expect(result.documentId.length).toBeGreaterThan(0)
    expect(result.chunkCount).toBeGreaterThan(0)
    expect(result.skipped).toBe(false)
  })

  test("returns skipped=true for identical content (same hash)", async () => {
    const { ingestFile } = await import("../../src/rag/ingest.js")
    const uniqueOrgId = "org_skip_" + Date.now()
    const bytes = Buffer.from("Identical content that should be deduplicated: " + Date.now())

    const params = {
      bytes,
      filename: "same.txt",
      mimeType: "text/plain",
      orgId: uniqueOrgId,
      workspaceId: "ws_dedup",
      source: "agent" as const,
    }

    const first = await ingestFile(params)
    const second = await ingestFile(params)

    expect(first.skipped).toBe(false)
    expect(second.skipped).toBe(true)
    expect(second.documentId).toBe(first.documentId)
  })
})
