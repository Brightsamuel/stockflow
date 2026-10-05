import { requireUser } from "@/lib/auth"
import { json, handleError } from "@/lib/http"
import { listPeople } from "@/lib/reportOptions"

// Names typed on earlier stock records (taken by, delivered by, issued by, received by),
// for suggestions in the name boxes of the Stock in, Transfer and Stock out forms
export async function GET() {
  try {
    await requireUser()
    return json(await listPeople())
  } catch (e) {
    return handleError(e, "Failed to load names")
  }
}
