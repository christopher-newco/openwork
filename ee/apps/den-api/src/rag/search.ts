import { sql } from "drizzle-orm"
import { getRagDb } from "./db.js"
import { embedTexts } from "./embed.js"
import { env } from "../env.js"

export interface SearchParams {
  query: string
  orgId: string
  workspaceId?: string
  limit?: number
}

export interface SearchResult {
  content: string
  documentId: string
  filename: string
  workspaceId: string | null
  score: number
}

export async function searchDocuments(params: SearchParams): Promise<SearchResult[]> {
  const db = getRagDb()
  const apiKey = env.rag.embedApiKey
  if (!apiKey) throw new Error("RAG_EMBED_API_KEY is not set")

  const limit = params.limit ?? 5
  const [queryEmbedding] = await embedTexts([params.query], apiKey)
  if (!queryEmbedding) throw new Error("embedding_failed: no embedding returned")

  // Format as pgvector literal
  const vectorLiteral = `[${queryEmbedding.join(",")}]`

  // Hybrid search: semantic + keyword, fused via RRF
  // Scope: workspace docs + org-wide docs (workspace_id IS NULL)
  const workspaceCondition = params.workspaceId
    ? sql`(d.workspace_id = ${params.workspaceId} OR d.workspace_id IS NULL)`
    : sql`d.workspace_id IS NULL`

  const results = await db.execute(sql`
    WITH semantic AS (
      SELECT
        dc.id        AS chunk_id,
        dc.content,
        dc.document_id,
        d.filename,
        d.workspace_id,
        ROW_NUMBER() OVER (
          ORDER BY dc.embedding <=> ${sql.raw(`'${vectorLiteral}'::vector`)}
        ) AS rank
      FROM rag_document_chunks dc
      JOIN rag_documents d ON dc.document_id = d.id
      WHERE d.org_id = ${params.orgId}
        AND ${workspaceCondition}
      LIMIT ${limit * 3}
    ),
    keyword AS (
      SELECT
        dc.id AS chunk_id,
        ROW_NUMBER() OVER (
          ORDER BY ts_rank(
            to_tsvector('english', dc.content),
            plainto_tsquery('english', ${params.query})
          ) DESC
        ) AS rank
      FROM rag_document_chunks dc
      JOIN rag_documents d ON dc.document_id = d.id
      WHERE d.org_id = ${params.orgId}
        AND ${workspaceCondition}
        AND to_tsvector('english', dc.content) @@ plainto_tsquery('english', ${params.query})
      LIMIT ${limit * 3}
    ),
    fused AS (
      SELECT
        s.chunk_id,
        s.content,
        s.document_id,
        s.filename,
        s.workspace_id,
        (0.7 / (60.0 + s.rank)) + COALESCE(0.3 / (60.0 + k.rank), 0) AS fused_score
      FROM semantic s
      LEFT JOIN keyword k ON k.chunk_id = s.chunk_id
      UNION ALL
      SELECT
        k.chunk_id,
        s2.content,
        s2.document_id,
        s2.filename,
        s2.workspace_id,
        0.3 / (60.0 + k.rank) AS fused_score
      FROM keyword k
      JOIN rag_document_chunks dc ON dc.id = k.chunk_id
      JOIN rag_documents s2 ON dc.document_id = s2.id
      LEFT JOIN semantic s ON s.chunk_id = k.chunk_id
      WHERE s.chunk_id IS NULL
    )
    SELECT DISTINCT ON (chunk_id)
      chunk_id,
      content,
      document_id,
      filename,
      workspace_id,
      MAX(fused_score) AS score
    FROM fused
    GROUP BY chunk_id, content, document_id, filename, workspace_id
    ORDER BY score DESC
    LIMIT ${limit}
  `)

  return (
    results.rows as Array<{
      content: string
      document_id: string
      filename: string
      workspace_id: string | null
      score: number
    }>
  ).map((r) => ({
    content: r.content,
    documentId: r.document_id,
    filename: r.filename,
    workspaceId: r.workspace_id,
    score: Number(r.score),
  }))
}
