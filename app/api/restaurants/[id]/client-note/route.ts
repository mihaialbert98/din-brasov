/**
 * Owner/admin upserts a private CRM note about one of their clients — keyed by
 * account (userId) OR, for accountless diners, by phone (guestPhone). Exactly one
 * identity must be given. The note persists across repeat bookings by the same
 * account or the same phone.
 */
import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { canManageRestaurant } from "@/lib/restaurant-permissions";
import { upsertRestaurantClientNote } from "@/lib/reservations";

const schema = z
  .object({
    userId: z.string().min(1).optional(),
    phone: z.string().min(1).max(40).optional(),
    note: z.string().max(1000),
  })
  .refine((d) => (d.userId ? 1 : 0) + (d.phone ? 1 : 0) === 1, {
    message: "Exactly one of userId/phone is required",
  });

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const session = await auth();
  const role = (session?.user as any)?.role as string | undefined;
  if (!session?.user?.id) return NextResponse.json({ error: "Neautorizat" }, { status: 401 });
  if (!(await canManageRestaurant(session.user.id, id, role))) {
    return NextResponse.json({ error: "Neautorizat" }, { status: 403 });
  }

  const parsed = schema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ error: "Date invalide." }, { status: 400 });
  const { userId, phone, note } = parsed.data;

  await upsertRestaurantClientNote(id, userId ? { userId } : { phone: phone! }, note);

  return NextResponse.json({ ok: true });
}
