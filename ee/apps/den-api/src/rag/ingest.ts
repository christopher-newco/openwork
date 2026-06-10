import crypto from "node:crypto"
import { and, eq, isNull } from "drizzle-orm"
import { DocumentChunkTable, DocumentTable } from "./schema.js"
import { env } from "../env.js"
import { chunkText } from "./chunk.js"
import { getRagDb } from "./db.js"
import { embedTexts } from "./embed.js"
import { extractText } from "./extract.js"

export interface IngestParams {
  bytes: Buffer
  filename: string
  mimeType: string
  orgId: string
  workspaceId?: string
  source: "upload" | "agent" | "sync"
  sourceUrl?: string
}

export interface IngestResult {
  documentId: string
  chunkCount: number
  skipped: boolean
}

function sha256(data: Buffer): string {
  return crypto.createHash("sha256").update(data as unknown as Uint8Array).digest("hex")
}

export async function ingestFile(params: IngestParams): Promise<IngestResult> {
  const db = getRagDb()
  const apiKey = env.rag.embedApiKey
  if (!apiKey) throw new Error("RAG_EMBED_API_KEY is not set")

  const contentHash = sha256(params.bytes)

  // Dedup: check if same content already indexed for this org+workspace
  const workspaceFilter = params.workspaceId
    ? eq(DocumentTable.workspaceId, params.workspaceId)
    : isNull(DocumentTable.workspaceId)

  const existing = await db
    .select({ id: DocumentTable.id })
    .from(DocumentTable)
    .where(
      and(
        eq(DocumentTable.orgId, params.orgId),
        eq(DocumentTable.contentHash, contentHash),
        workspaceFilter,
      ),
    )
    .limit(1)

  if (existing[0]) {
    return { documentId: existing[0].id, chunkCount: 0, skipped: true }
  }

  // Extract, chunk, embed
  const text = await extractText(params.bytes, params.mimeType)
  const chunks = chunkText(text)
  if (chunks.length === 0) {
    throw new Error("no_extractable_text: file produced no text content")
  }

  const embeddings = await embedTexts(
    chunks.map((c) => c.content),
    apiKey,
  )

  // Insert document + chunks in a transaction
  const now = new Date()
  const documentId = crypto.randomUUID()

  await db.transaction(async (tx) => {
    await tx.insert(DocumentTable).values({
      id: documentId,
      orgId: params.orgId,
      workspaceId: params.workspaceId ?? null,
      filename: params.filename,
      mimeType: params.mimeType,
      source: params.source,
      sourceUrl: params.sourceUrl ?? null,
      contentHash,
      indexedAt: now,
    })

    await tx.insert(DocumentChunkTable).values(
      chunks.map((chunk, i) => ({
        id: crypto.randomUUID(),
        documentId,
        chunkIndex: chunk.index,
        content: chunk.content,
        embedding: embeddings[i]!,
        tokenCount: chunk.tokenCount,
      })),
    )
  })

  return { documentId, chunkCount: chunks.length, skipped: false }
}
