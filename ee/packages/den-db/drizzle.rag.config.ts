import { defineConfig } from "drizzle-kit"

const ragUrl = process.env.RAG_DATABASE_URL
if (!ragUrl) throw new Error("RAG_DATABASE_URL required for RAG migrations")

export default defineConfig({
  dialect: "postgresql",
  schema: "./src/schema/rag.ts",
  out: "./drizzle/rag",
  dbCredentials: { url: ragUrl },
})
