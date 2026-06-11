import { readFile } from "node:fs/promises"
import type { Hono } from "hono"
import { describeRoute } from "hono-openapi"
import { z } from "zod"
import { and, eq, isNull, or } from "drizzle-orm"
import { ingestFile } from "../rag/ingest.js"
import { searchDocuments } from "../rag/search.js"
import { getRagDb } from "../rag/db.js"
import { DocumentTable } from "../rag/schema.js"
import {
  jsonValidator,
  requireUserMiddleware,
  resolveOrganizationContextMiddleware,
} from "../middleware/index.js"
import { jsonResponse, unauthorizedSchema } from "../openapi.js"
import type { OrgRouteVariables } from "./org/shared.js"

// --- Zod schemas ---
const ingestBodySchema = z.object({
  file_path: z.string().min(1).describe("Absolute path to the file to ingest"),
  workspace_id: z.string().optional().describe("Project workspace ID. Omit for org-wide."),
  source: z.enum(["upload", "agent", "sync"]).default("agent"),
})

const ingestResultSchema = z.object({
  documentId: z.string(),
  chunkCount: z.number().int(),
  skipped: z.boolean(),
})

const searchBodySchema = z.object({
  query: z.string().min(1).max(1000).describe("Natural language search query"),
  workspace_id: z.string().optional(),
  limit: z.number().int().min(1).max(20).default(5),
})

const searchResultItemSchema = z.object({
  content: z.string(),
  documentId: z.string(),
  filename: z.string(),
  workspaceId: z.string().nullable(),
  score: z.number(),
})

const searchResultSchema = z.object({
  results: z.array(searchResultItemSchema),
})

const documentListSchema = z.object({
  documents: z.array(
    z.object({
      id: z.string(),
      filename: z.string(),
      source: z.enum(["upload", "agent", "sync"]),
      workspaceId: z.string().nullable(),
      indexedAt: z.string(),
    }),
  ),
})

const deleteResultSchema = z.object({ ok: z.boolean() })

function detectMimeType(filePath: string): string {
  const ext = filePath.toLowerCase().split(".").pop() ?? ""
  const map: Record<string, string> = {
    pdf: "application/pdf",
    xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    xls: "application/vnd.ms-excel",
    docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    txt: "text/plain",
    md: "text/markdown",
    csv: "text/csv",
  }
  return map[ext] ?? "text/plain"
}

export function registerRagRoutes<T extends { Variables: OrgRouteVariables }>(app: Hono<T>) {
  // POST /v1/rag/ingest
  app.post(
    "/v1/rag/ingest",
    describeRoute({
      tags: ["RAG"],
      summary: "Ingest a file into the RAG index",
      operationId: "rag_ingest",
      description:
        "Ingest a file into the RAG index. Idempotent — re-ingesting an unchanged file is a no-op. Supports PDF, XLSX, DOCX, plain text, Markdown.",
      responses: {
        200: jsonResponse("File ingested.", ingestResultSchema),
        401: jsonResponse("Unauthorized.", unauthorizedSchema),
      },
    }),
    requireUserMiddleware,
    resolveOrganizationContextMiddleware,
    jsonValidator(ingestBodySchema),
    async (c) => {
      const payload = c.get("organizationContext")
      const orgId = payload.organization.id
      const { file_path, workspace_id, source } = c.req.valid("json")

      const bytes = await readFile(file_path)
      const mimeType = detectMimeType(file_path)
      const filename = file_path.split("/").pop() ?? file_path

      const result = await ingestFile({
        bytes,
        filename,
        mimeType,
        orgId,
        workspaceId: workspace_id,
        source,
      })

      return c.json(result)
    },
  )

  // POST /v1/rag/search
  app.post(
    "/v1/rag/search",
    describeRoute({
      tags: ["RAG"],
      summary: "Search indexed documents",
      operationId: "rag_search",
      description:
        "Hybrid semantic + keyword search over indexed documents. Searches workspace-scoped and org-wide documents together.",
      responses: {
        200: jsonResponse("Search results.", searchResultSchema),
        401: jsonResponse("Unauthorized.", unauthorizedSchema),
      },
    }),
    requireUserMiddleware,
    resolveOrganizationContextMiddleware,
    jsonValidator(searchBodySchema),
    async (c) => {
      const payload = c.get("organizationContext")
      const orgId = payload.organization.id
      const { query, workspace_id, limit } = c.req.valid("json")

      const results = await searchDocuments({
        query,
        orgId,
        workspaceId: workspace_id,
        limit,
      })

      return c.json({ results })
    },
  )

  // GET /v1/rag/documents
  app.get(
    "/v1/rag/documents",
    describeRoute({
      tags: ["RAG"],
      summary: "List indexed documents",
      operationId: "rag_list",
      description: "List all indexed documents for a workspace or org.",
      responses: {
        200: jsonResponse("Document list.", documentListSchema),
        401: jsonResponse("Unauthorized.", unauthorizedSchema),
      },
    }),
    requireUserMiddleware,
    resolveOrganizationContextMiddleware,
    async (c) => {
      const payload = c.get("organizationContext")
      const orgId = payload.organization.id
      const workspaceId = c.req.query("workspace_id")
      const db = getRagDb()

      const scopeFilter = and(
        eq(DocumentTable.orgId, orgId),
        workspaceId
          ? or(eq(DocumentTable.workspaceId, workspaceId), isNull(DocumentTable.workspaceId))
          : isNull(DocumentTable.workspaceId),
      )

      const docs = await db
        .select({
          id: DocumentTable.id,
          filename: DocumentTable.filename,
          source: DocumentTable.source,
          workspaceId: DocumentTable.workspaceId,
          indexedAt: DocumentTable.indexedAt,
        })
        .from(DocumentTable)
        .where(scopeFilter)
        .orderBy(DocumentTable.indexedAt)

      return c.json({
        documents: docs.map((d) => ({
          ...d,
          indexedAt: d.indexedAt.toISOString(),
        })),
      })
    },
  )

  // DELETE /v1/rag/documents/:id
  app.delete(
    "/v1/rag/documents/:id",
    describeRoute({
      tags: ["RAG"],
      summary: "Delete a document",
      operationId: "rag_delete",
      description: "Remove a document and all its chunks from the index.",
      responses: {
        200: jsonResponse("Deleted.", deleteResultSchema),
        401: jsonResponse("Unauthorized.", unauthorizedSchema),
        404: jsonResponse("Not found.", z.object({ error: z.string() })),
      },
    }),
    requireUserMiddleware,
    resolveOrganizationContextMiddleware,
    async (c) => {
      const payload = c.get("organizationContext")
      const orgId = payload.organization.id
      const documentId = c.req.param("id")
      const db = getRagDb()

      const existing = await db
        .select({ id: DocumentTable.id })
        .from(DocumentTable)
        .where(and(eq(DocumentTable.id, documentId), eq(DocumentTable.orgId, orgId)))
        .limit(1)

      if (!existing[0]) {
        return c.json({ error: "document_not_found" }, 404)
      }

      await db.delete(DocumentTable).where(eq(DocumentTable.id, documentId))
      return c.json({ ok: true })
    },
  )
}
