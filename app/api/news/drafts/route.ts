import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { newsItems } from "@/lib/db/schema";
import { eq, count } from "drizzle-orm";

export async function GET() {
  const session = await auth();
  const role = (session?.user as any)?.role as string | undefined;
  if (role !== "admin" && role !== "moderator") {
    return NextResponse.json({ error: "Neautorizat" }, { status: 401 });
  }

  const [row] = await db.select({ c: count() }).from(newsItems).where(eq(newsItems.status, "draft"));
  return NextResponse.json({ count: row?.c ?? 0 });
}
