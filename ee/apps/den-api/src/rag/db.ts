import pg from "pg"
import { drizzle } from "drizzle-orm/node-postgres"
import { env } from "../env.js"

let _pool: pg.Pool | null = null
let _db: ReturnType<typeof drizzle> | null = null

export function getRagDb() {
  if (_db) return _db

  const url = env.rag.databaseUrl
  if (!url) {
    throw new Error(
      "RAG_DATABASE_URL is not set. Add a PostgreSQL connection string with pgvector enabled.",
    )
  }

  _pool = new pg.Pool({
    connectionString: url,
    max: 5,
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 5_000,
  })

  _db = drizzle(_pool)
  return _db
}

export async function closeRagDb() {
  await _pool?.end()
  _pool = null
  _db = null
}
