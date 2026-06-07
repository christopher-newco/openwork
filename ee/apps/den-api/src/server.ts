import { serve } from "@hono/node-server"
import app from "./app.js"
import { env } from "./env.js"
import { ensureServiceAccountSeeded } from "./service-account.js"

// Seed the headless admin service account (no-op unless configured). Runs at
// startup so the bearer token is resolvable before the first authed request.
ensureServiceAccountSeeded().catch((error) => {
  console.error("[serviceAccount] seeding failed:", error)
})

serve({ fetch: app.fetch, port: env.port }, (info) => {
  console.log(`den-api listening on ${info.port}`)
})
