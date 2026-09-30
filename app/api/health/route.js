import prisma from "@/lib/prisma"
import { json } from "@/lib/http"

// Health check for load balancers and uptime monitors (AWS ALB / App Runner, etc.)
export async function GET() {
  try {
    await prisma.$queryRaw`SELECT 1`
    return json({ ok: true, database: "up" })
  } catch {
    return json({ ok: false, database: "down" }, 503)
  }
}
