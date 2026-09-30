import { getCurrentUser } from "@/lib/auth"
import { json } from "@/lib/http"

export async function GET() {
  const user = await getCurrentUser()
  if (!user) return json(null)
  return json({ id: user.id, username: user.username, role: user.role })
}
