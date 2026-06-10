import { describe, expect, test } from "bun:test"
import { chunkText } from "../../src/rag/chunk.js"

describe("chunkText", () => {
  test("returns empty array for empty text", () => {
    expect(chunkText("")).toEqual([])
  })

  test("returns empty array for whitespace-only text", () => {
    expect(chunkText("   \n\n  ")).toEqual([])
  })

  test("returns single chunk for short text", () => {
    const text = "Hello world."
    const chunks = chunkText(text)
    expect(chunks).toHaveLength(1)
    expect(chunks[0]?.content).toBe("Hello world.")
    expect(chunks[0]?.index).toBe(0)
    expect(chunks[0]?.tokenCount).toBeGreaterThan(0)
  })

  test("splits long text into multiple chunks", () => {
    // ~600 words ≈ 600 tokens, should produce 2+ chunks with 512-token limit
    const words = Array.from({ length: 600 }, (_, i) => `word${i}`)
    const text = words.join(" ")
    const chunks = chunkText(text)
    expect(chunks.length).toBeGreaterThan(1)
  })

  test("all chunks have positive tokenCount within bounds", () => {
    const words = Array.from({ length: 600 }, (_, i) => `word${i}`)
    const text = words.join(" ")
    const chunks = chunkText(text)
    for (const chunk of chunks) {
      expect(chunk.tokenCount).toBeGreaterThan(0)
      expect(chunk.tokenCount).toBeLessThanOrEqual(580)
    }
  })

  test("chunk indexes are sequential starting from 0", () => {
    const words = Array.from({ length: 600 }, (_, i) => `word${i}`)
    const chunks = chunkText(words.join(" "))
    chunks.forEach((chunk, i) => expect(chunk.index).toBe(i))
  })
})
