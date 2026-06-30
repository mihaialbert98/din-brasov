/**
 * Owner staff management — add a waiter by EXISTING-account email. Owner or
 * platform staff only. (No invite flow in v1: the waiter must already have a
 * Din Brașov account.)
 */
import { NextResponse } from "next/server";
import { z } from "zod";
import { and, eq } from "drizzle-orm";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { users, restaurantMembers } from "@/lib/db/schema";
import { canManageRestaurant } from "@/lib/restaurant-permissions";

const schema = z.object({ email: z.string().email() });

async function authorize(restaurantId: string) {
  const session = await auth();
  const role = (session?.user as any)?.role as string | undefined;
  if (!session?.user?.id) return { error: "Neautorizat", status: 401 as const };
  const ok = await canManageRestaurant(session.user.id, restaurantId, role);
  if (!ok) return { error: "Neautorizat", status: 403 as const };
  return { userId: session.user.id };
}

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const a = await authorize(id);
  if ("error" in a) return NextResponse.json({ error: a.error }, { status: a.status });

  const parsed = schema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ error: "Email invalid." }, { status: 400 });

  const [user] = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.email, parsed.data.email.toLowerCase()))
    .limit(1);
  if (!user) {
    return NextResponse.json(
      { error: "Nu există un cont cu acest email. Ospătarul trebuie să își creeze cont întâi." },
      { status: 404 }
    );
  }

  // Already a member?
  const [existing] = await db
    .select({ id: restaurantMembers.id })
    .from(restaurantMembers)
    .where(and(eq(restaurantMembers.restaurantId, id), eq(restaurantMembers.userId, user.id)))
    .limit(1);
  if (existing) {
    return NextResponse.json({ error: "Această persoană face deja parte din echipă." }, { status: 409 });
  }

  await db.insert(restaurantMembers).values({
    restaurantId: id,
    userId: user.id,
    memberRole: "waiter",
  });

  return NextResponse.json({ ok: true }, { status: 201 });
}
