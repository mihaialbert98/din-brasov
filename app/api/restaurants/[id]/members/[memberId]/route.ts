/** Remove a member (waiter). Owners can't be removed here (protects ownership). */
import { NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { restaurantMembers } from "@/lib/db/schema";
import { canManageRestaurant } from "@/lib/restaurant-permissions";

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string; memberId: string }> }
) {
  const { id, memberId } = await params;
  const session = await auth();
  const role = (session?.user as any)?.role as string | undefined;
  if (!session?.user?.id) return NextResponse.json({ error: "Neautorizat" }, { status: 401 });
  if (!(await canManageRestaurant(session.user.id, id, role))) {
    return NextResponse.json({ error: "Neautorizat" }, { status: 403 });
  }

  const [member] = await db
    .select({ memberRole: restaurantMembers.memberRole })
    .from(restaurantMembers)
    .where(and(eq(restaurantMembers.id, memberId), eq(restaurantMembers.restaurantId, id)))
    .limit(1);
  if (!member) return NextResponse.json({ error: "Membru negăsit." }, { status: 404 });
  if (member.memberRole === "owner") {
    return NextResponse.json({ error: "Proprietarul nu poate fi eliminat." }, { status: 400 });
  }

  await db
    .delete(restaurantMembers)
    .where(and(eq(restaurantMembers.id, memberId), eq(restaurantMembers.restaurantId, id)));
  return NextResponse.json({ ok: true });
}
