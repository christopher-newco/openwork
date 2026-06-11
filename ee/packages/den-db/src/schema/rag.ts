import { sql } from "drizzle-orm"
import {
  index,
  integer,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uuid,
  varchar,
  vector,
} from "drizzle-orm/pg-core"

export const documentSourceEnum = pgEnum("document_source", [
  "upload",
  "agent",
  "sync",
])

export const DocumentTable = pgTable(
  "rag_documents",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orgId: varchar("org_id", { length: 255 }).notNull(),
    workspaceId: varchar("workspace_id", { length: 255 }),
    filename: varchar("filename", { length: 500 }).notNull(),
    mimeType: varchar("mime_type", { length: 100 }).notNull(),
    source: documentSourceEnum("source").notNull(),
    sourceUrl: varchar("source_url", { length: 2048 }),
    contentHash: varchar("content_hash", { length: 64 }).notNull(),
    indexedAt: timestamp("indexed_at", { withTimezone: true }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .default(sql`now()`),
  },
  (table) => [
    index("rag_documents_org_workspace").on(table.orgId, table.workspaceId),
    index("rag_documents_content_hash").on(table.contentHash),
  ],
)

export const DocumentChunkTable = pgTable(
  "rag_document_chunks",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    documentId: uuid("document_id")
      .notNull()
      .references(() => DocumentTable.id, { onDelete: "cascade" }),
    chunkIndex: integer("chunk_index").notNull(),
    content: text("content").notNull(),
    embedding: vector("embedding", { dimensions: 1536 }).notNull(),
    tokenCount: integer("token_count").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .default(sql`now()`),
  },
  (table) => [
    index("rag_chunks_document_id").on(table.documentId),
  ],
)

export const documents = DocumentTable
export const documentChunks = DocumentChunkTable
