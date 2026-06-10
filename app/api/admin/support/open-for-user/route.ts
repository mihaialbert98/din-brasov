import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { supportConversations } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { z } from "zod";

const bodySchema = z.object({
  userId: z.string().min(1),
  subject: z.string().min(1).max(100).optional(),
});

// Find or create an open support conversation for a given user.
// Mods/admins use this to initiate contact with a user from the admin panel.
export async function POST(req: NextRequest) {
  const session = await auth();
  const role = (session?.user as any)?.role;
  if (!session?.user?.id || (role !== "moderator" && role !== "admin")) {
    return NextResponse.json({ error: "Acces interzis." }, { status: 403 });
  }

  const parsed = bodySchema.safeParse(await req.json());
  if (!parsed.success) {
    return NextResponse.json({ error: "Date invalide." }, { status: 422 });
  }

  const { userId, subject } = parsed.data;

  // Prefer an existing open conversation; if only closed ones exist, reopen the most recent
  const existing = await db
    .select({ id: supportConversations.id, status: supportConversations.status })
    .from(supportConversations)
    .where(eq(supportConversations.userId, userId))
    .orderBy(supportConversations.createdAt);

  const open = existing.find((c) => c.status === "open");
  if (open) {
    // Claim it if not already assigned
    await db
      .update(supportConversations)
      .set({ assignedTo: session.user.id, updatedAt: new Date() })
      .where(eq(supportConversations.id, open.id));
    return NextResponse.json({ conversationId: open.id });
  }

  const last = existing.at(-1);
  if (last) {
    // Reopen the most recent closed conversation
    await db
      .update(supportConversations)
      .set({ status: "open", assignedTo: session.user.id, updatedAt: new Date() })
      .where(eq(supportConversations.id, last.id));
    return NextResponse.json({ conversationId: last.id });
  }

  // No conversation at all — create one
  const [newConv] = await db
    .insert(supportConversations)
    .values({
      userId,
      assignedTo: session.user.id,
      subject: subject ?? "Sesizare din partea echipei",
      status: "open",
    })
    .returning({ id: supportConversations.id });

  return NextResponse.json({ conversationId: newConv.id }, { status: 201 });
}
