const OPENAI_EMBED_URL = "https://api.openai.com/v1/embeddings"
const EMBED_MODEL = "text-embedding-ada-002"
export const EMBEDDING_DIMENSIONS = 1536
const BATCH_SIZE = 20

interface OpenAIEmbedResponse {
  data: Array<{ embedding: number[]; index: number }>
}

async function embedBatch(texts: string[], apiKey: string): Promise<number[][]> {
  const response = await fetch(OPENAI_EMBED_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ model: EMBED_MODEL, input: texts }),
  })

  if (!response.ok) {
    const body = await response.text().catch(() => "")
    throw new Error(`embedding_failed: HTTP ${response.status} — ${body}`)
  }

  const result = (await response.json()) as OpenAIEmbedResponse
  const sorted = [...result.data].sort((a, b) => a.index - b.index)
  return sorted.map((d) => d.embedding)
}

export async function embedTexts(texts: string[], apiKey: string): Promise<number[][]> {
  const results: number[][] = []
  for (let i = 0; i < texts.length; i += BATCH_SIZE) {
    const batch = texts.slice(i, i + BATCH_SIZE)
    const embeddings = await embedBatch(batch, apiKey)
    results.push(...embeddings)
  }
  return results
}
