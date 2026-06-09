import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { users, adminAuditLog } from "@/lib/db/schema";

const VALID_ROLES = ["user", "staff", "moderator", "admin"] as const;

export async function POST(req: Request) {
  const session = await auth();
  const role = (session?.user as any)?.role as string | undefined;

  if (!session?.user?.id || role !== "admin") {
    return NextResponse.json({ error: "Neautorizat" }, { status: 401 });
  }

  const body = await req.formData();
  const userId = body.get("userId") as string | null;
  const newRole = body.get("role") as string | null;

  if (!userId || !newRole || !VALID_ROLES.includes(newRole as any)) {
    return NextResponse.json({ error: "Date invalide." }, { status: 400 });
  }

  if (userId === session.user.id) {
    return NextResponse.json({ error: "Nu îți poți schimba propriul rol." }, { status: 400 });
  }

  const [target] = await db.select({ id: users.id, role: users.role }).from(users).where(eq(users.id, userId)).limit(1);
  if (!target) {
    return NextResponse.json({ error: "Utilizator negăsit." }, { status: 404 });
  }

  await db.update(users).set({ role: newRole, updatedAt: new Date() }).where(eq(users.id, userId));

  await db.insert(adminAuditLog).values({
    adminId: session.user.id,
    action: "change_user_role",
    entityType: "user",
    entityId: userId,
    metadataJson: JSON.stringify({ from: target.role, to: newRole }),
  });

  return NextResponse.redirect(new URL("/admin/utilizatori", req.url), 303);
}
