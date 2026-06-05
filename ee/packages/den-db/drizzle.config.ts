import "./src/load-env.ts"
import { defineConfig } from "drizzle-kit"
import { parseMySqlConnectionConfig } from "./src/mysql-config.ts"

const databaseUrl = process.env.DATABASE_URL?.trim()

function isGenerateCommand() {
  return process.argv.some((arg) => arg === "generate")
}

function resolveDialect(): "mysql" | "postgresql" {
  if (databaseUrl && (databaseUrl.startsWith("postgres://") || databaseUrl.startsWith("postgresql://"))) {
    return "postgresql"
  }
  return "mysql"
}

function resolveDrizzleDbCredentials() {
  const dialect = resolveDialect()

  if (dialect === "postgresql") {
    if (databaseUrl) {
      return { url: databaseUrl }
    }

    if (isGenerateCommand()) {
      return { url: "postgresql://postgres:password@127.0.0.1:5432/openwork_den" }
    }

    throw new Error("Provide DATABASE_URL for postgres")
  }

  // MySQL/PlanetScale mode
  if (databaseUrl) {
    return parseMySqlConnectionConfig(databaseUrl)
  }

  const host = process.env.DATABASE_HOST?.trim()
  const user = process.env.DATABASE_USERNAME?.trim()
  const password = process.env.DATABASE_PASSWORD ?? ""

  if (!host || !user) {
    if (isGenerateCommand()) {
      return {
        host: "127.0.0.1",
        user: "root",
        password: "",
      }
    }

    throw new Error("Provide DATABASE_URL for mysql or DATABASE_HOST/DATABASE_USERNAME/DATABASE_PASSWORD for planetscale")
  }

  return {
    host,
    user,
    password,
  }
}

export default defineConfig({
  dialect: resolveDialect(),
  schema: "./src/schema.ts",
  out: "./drizzle",
  dbCredentials: resolveDrizzleDbCredentials(),
})
