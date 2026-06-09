import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { places, adminAuditLog } from "@/lib/db/schema";
import { eq } from "drizzle-orm";

export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  const role = (session?.user as any)?.role;
  if (role !== "admin" && role !== "moderator") {
    return NextResponse.json({ error: "Neautorizat" }, { status: 401 });
  }
  const { id } = await params;
  await db.update(places).set({ status: "rejected", updatedAt: new Date() }).where(eq(places.id, id));
  await db.insert(adminAuditLog).values({ adminId: session!.user!.id!, action: "reject_place", entityType: "place", entityId: id });
  return NextResponse.redirect(new URL("/admin/localuri", process.env.NEXTAUTH_URL ?? "http://localhost:3000"));
}
