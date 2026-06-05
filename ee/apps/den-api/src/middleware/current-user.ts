import type { MiddlewareHandler } from "hono"
import type { AuthContextVariables } from "../session.js"

export const requireUserMiddleware: MiddlewareHandler<{ Variables: AuthContextVariables }> = async (c, next) => {
  const user = c.get("user")
  console.log("[requireUserMiddleware]", {
    path: c.req.path,
    hasUser: !!user,
    userId: user?.id,
  })
  if (!c.get("user")?.id) {
    console.error("[requireUserMiddleware] No user found, returning 401")
    return c.json({ error: "unauthorized" }, 401) as never
  }

  await next()
}
