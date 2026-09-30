import { requireUser } from "@/lib/auth"
import { json, handleError } from "@/lib/http"
import { listTakers } from "@/lib/reportOptions"

// Names of everyone who has taken stock out, for suggestions on the Stock out form
export async function GET() {
  try {
    await requireUser()
    return json(await listTakers())
  } catch (e) {
    return handleError(e, "Failed to load names")
  }
}
