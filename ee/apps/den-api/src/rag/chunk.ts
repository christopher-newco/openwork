// Approximate tokenization: 4 chars ≈ 1 token (good enough for chunking)
const CHARS_PER_TOKEN = 4
const CHUNK_TOKENS = 512
const OVERLAP_TOKENS = 64

const CHUNK_CHARS = CHUNK_TOKENS * CHARS_PER_TOKEN   // 2048 chars
const OVERLAP_CHARS = OVERLAP_TOKENS * CHARS_PER_TOKEN // 256 chars

const SEPARATORS = ["\n\n", "\n", ". ", " ", ""]

export interface TextChunk {
  index: number
  content: string
  tokenCount: number
}

function estimateTokens(text: string): number {
  return Math.ceil(text.length / CHARS_PER_TOKEN)
}

function splitAtSeparator(text: string, maxChars: number): [string, string] {
  if (text.length <= maxChars) return [text, ""]

  for (const sep of SEPARATORS) {
    if (sep === "") {
      return [text.slice(0, maxChars), text.slice(maxChars)]
    }
    const idx = text.lastIndexOf(sep, maxChars)
    if (idx > 0) {
      return [text.slice(0, idx + sep.length), text.slice(idx + sep.length)]
    }
  }
  return [text.slice(0, maxChars), text.slice(maxChars)]
}

export function chunkText(text: string): TextChunk[] {
  if (!text.trim()) return []

  const chunks: TextChunk[] = []
  let remaining = text
  let index = 0

  while (remaining.length > 0) {
    const prevLength = remaining.length
    const [chunk, rest] = splitAtSeparator(remaining, CHUNK_CHARS)
    const trimmed = chunk.trim()

    if (trimmed.length > 0) {
      chunks.push({
        index,
        content: trimmed,
        tokenCount: estimateTokens(trimmed),
      })
      index++
    }

    if (rest.length === 0) break

    // Apply overlap: back up OVERLAP_CHARS into the chunk we just took
    const overlapStart = Math.max(0, chunk.length - OVERLAP_CHARS)
    remaining = chunk.slice(overlapStart) + rest

    if (remaining.length >= prevLength) {
      // No progress — force advance to prevent infinite loop
      remaining = remaining.slice(CHUNK_CHARS)
    }
  }

  return chunks
}
