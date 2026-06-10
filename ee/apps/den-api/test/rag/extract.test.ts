import { describe, expect, test } from "bun:test"
import { extractText } from "../../src/rag/extract.js"

describe("extractText", () => {
  test("extracts plain text from text/plain", async () => {
    const content = "Hello world\nThis is a test."
    const bytes = Buffer.from(content, "utf-8")
    const result = await extractText(bytes, "text/plain")
    expect(result).toBe("Hello world\nThis is a test.")
  })

  test("extracts markdown as plain text", async () => {
    const content = "# Title\n\nSome **bold** text."
    const bytes = Buffer.from(content, "utf-8")
    const result = await extractText(bytes, "text/markdown")
    expect(result).toBe("# Title\n\nSome **bold** text.")
  })

  test("throws for unsupported mime type", async () => {
    const bytes = Buffer.from("data")
    await expect(extractText(bytes, "image/png")).rejects.toThrow("unsupported_mime_type")
  })

  test("returns empty string for empty input", async () => {
    const bytes = Buffer.from("")
    const result = await extractText(bytes, "text/plain")
    expect(result).toBe("")
  })
})
