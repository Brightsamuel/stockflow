import { NextResponse } from "next/server"
import { requireUser } from "@/lib/auth"
import { listTakers } from "@/lib/reportOptions"

// Names of everyone who has taken stock out, for suggestions on the Stock out form
export async function GET() {
  try {
    await requireUser()
  } catch (e) {
    return NextResponse.json({ error: e.message }, { status: e.status || 401 })
  }

  return NextResponse.json(await listTakers())
}
