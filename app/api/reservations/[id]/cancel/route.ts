/** A logged-in user cancels their OWN reservation. */
import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { cancelOwnReservation } from "@/lib/reservations";

export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Neautorizat" }, { status: 401 });

  const { id } = await params;
  const result = await cancelOwnReservation(session.user.id, id);
  if (!result.ok) return NextResponse.json({ error: result.reason }, { status: 400 });
  return NextResponse.json({ ok: true, placeSlug: result.placeSlug });
}
