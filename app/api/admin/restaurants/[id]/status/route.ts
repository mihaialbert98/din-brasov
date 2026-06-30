/** Admin: suspend / reactivate a restaurant. */
import { NextResponse } from "next/server";
import { z } from "zod";
import { eq } from "drizzle-orm";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { restaurants, adminAuditLog } from "@/lib/db/schema";

const schema = z.object({ status: z.enum(["active", "suspended"]) });

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  const role = (session?.user as any)?.role as string | undefined;
  if (!session?.user?.id || (role !== "admin" && role !== "moderator")) {
    return NextResponse.json({ error: "Neautorizat" }, { status: 401 });
  }

  const { id } = await params;
  const parsed = schema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) {
    return NextResponse.json({ error: "Date invalide." }, { status: 400 });
  }

  const [updated] = await db
    .update(restaurants)
    .set({ status: parsed.data.status, updatedAt: new Date() })
    .where(eq(restaurants.id, id))
    .returning({ id: restaurants.id });

  if (!updated) {
    return NextResponse.json({ error: "Restaurant negăsit." }, { status: 404 });
  }

  await db.insert(adminAuditLog).values({
    adminId: session.user.id,
    action: parsed.data.status === "suspended" ? "suspend_restaurant" : "restore_restaurant",
    entityType: "restaurant",
    entityId: id,
    metadataJson: null,
  });

  return NextResponse.json({ ok: true });
}
