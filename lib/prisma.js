import { PrismaClient } from "@prisma/client"

// A database that has scaled to zero (Neon free tier) can take several seconds to wake, longer
// than Prisma's defaults (5s to connect, 10s waiting for a pooled connection), so allow 30s for
// each unless the URL sets its own.
function withTimeouts(url) {
  if (!url) return url
  const extra = ["connect_timeout", "pool_timeout"].filter(key => !new RegExp(`[?&]${key}=`).test(url))
  if (!extra.length) return url
  return `${url}${url.includes("?") ? "&" : "?"}${extra.map(key => `${key}=30`).join("&")}`
}

const globalForPrisma = globalThis

const prisma = globalForPrisma.prisma ?? new PrismaClient({
  datasourceUrl: withTimeouts(process.env.DATABASE_URL),
})

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma
}

export default prisma
