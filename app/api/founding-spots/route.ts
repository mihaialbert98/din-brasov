import { NextResponse } from "next/server";
import { getFoundingSpotsLeft } from "@/lib/permissions";

// Public, read-only: how many founding-member spots remain. Used by the register
// page (client component) to show the live counter.
export async function GET() {
  const spotsLeft = await getFoundingSpotsLeft().catch(() => 0);
  return NextResponse.json({ spotsLeft });
}
