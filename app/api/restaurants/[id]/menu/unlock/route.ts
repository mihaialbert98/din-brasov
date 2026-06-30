/**
 * Menu-edit 2FA. Owner-only (admins don't need it — they bypass the lock).
 *
 *  POST            → request a code: emails a 6-digit code to the owner.
 *  POST ?action=verify { code } → verify: on success, opens a 30-min edit window.
 *  GET             → current unlock status { unlocked, unlockedUntil }.
 */
import { NextResponse } from "next/server";
import { z } from "zod";
import { createHash } from "crypto";
import { and, eq } from "drizzle-orm";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { restaurants, restaurantEditUnlocks, users } from "@/lib/db/schema";
import { canManageRestaurant, isPlatformStaff } from "@/lib/restaurant-permissions";
import { sendMenuEditCodeEmail } from "@/lib/email";

const CODE_TTL_MS = 10 * 60 * 1000; // code valid 10 min
const UNLOCK_MS = 30 * 60 * 1000; // edit window 30 min
const MAX_ATTEMPTS = 5;

function hashCode(code: string) {
  return createHash("sha256").update(code + process.env.AUTH_SECRET!).digest("hex");
}

async function gate(restaurantId: string) {
  const session = await auth();
  const role = (session?.user as any)?.role as string | undefined;
  if (!session?.user?.id) return { error: "Neautorizat", status: 401 as const };
  if (!(await canManageRestaurant(session.user.id, restaurantId, role))) {
    return { error: "Neautorizat", status: 403 as const };
  }
  return { userId: session.user.id, role };
}

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const g = await gate(id);
  if ("error" in g) return NextResponse.json({ error: g.error }, { status: g.status });

  // Admins are always unlocked (no 2FA for platform staff).
  if (isPlatformStaff(g.role)) return NextResponse.json({ unlocked: true, admin: true });

  const [row] = await db
    .select({ unlockedUntil: restaurantEditUnlocks.unlockedUntil })
    .from(restaurantEditUnlocks)
    .where(and(eq(restaurantEditUnlocks.restaurantId, id), eq(restaurantEditUnlocks.userId, g.userId)))
    .limit(1);
  const unlocked = !!row?.unlockedUntil && row.unlockedUntil.getTime() > Date.now();
  return NextResponse.json({ unlocked, unlockedUntil: unlocked ? row!.unlockedUntil : null });
}

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const g = await gate(id);
  if ("error" in g) return NextResponse.json({ error: g.error }, { status: g.status });

  // Admins never need a code.
  if (isPlatformStaff(g.role)) return NextResponse.json({ unlocked: true, admin: true });

  const url = new URL(req.url);
  const action = url.searchParams.get("action");

  if (action === "verify") {
    const parsed = z.object({ code: z.string().min(4).max(8) }).safeParse(await req.json().catch(() => ({})));
    if (!parsed.success) return NextResponse.json({ error: "Cod invalid." }, { status: 400 });

    const [row] = await db
      .select()
      .from(restaurantEditUnlocks)
      .where(and(eq(restaurantEditUnlocks.restaurantId, id), eq(restaurantEditUnlocks.userId, g.userId)))
      .limit(1);

    if (!row?.codeHash || !row.codeExpiresAt || row.codeExpiresAt.getTime() < Date.now()) {
      return NextResponse.json({ error: "Codul a expirat. Cere unul nou." }, { status: 400 });
    }
    if (row.attempts >= MAX_ATTEMPTS) {
      return NextResponse.json({ error: "Prea multe încercări. Cere un cod nou." }, { status: 429 });
    }
    if (hashCode(parsed.data.code) !== row.codeHash) {
      await db
        .update(restaurantEditUnlocks)
        .set({ attempts: row.attempts + 1, updatedAt: new Date() })
        .where(eq(restaurantEditUnlocks.id, row.id));
      return NextResponse.json({ error: "Cod greșit." }, { status: 400 });
    }

    // Correct → open the edit window, clear the code.
    const unlockedUntil = new Date(Date.now() + UNLOCK_MS);
    await db
      .update(restaurantEditUnlocks)
      .set({ unlockedUntil, codeHash: null, codeExpiresAt: null, attempts: 0, updatedAt: new Date() })
      .where(eq(restaurantEditUnlocks.id, row.id));
    return NextResponse.json({ ok: true, unlockedUntil });
  }

  // Default: request a fresh code, email it.
  const code = String(Math.floor(100000 + Math.random() * 900000)); // 6 digits
  const codeExpiresAt = new Date(Date.now() + CODE_TTL_MS);

  const [existing] = await db
    .select({ id: restaurantEditUnlocks.id })
    .from(restaurantEditUnlocks)
    .where(and(eq(restaurantEditUnlocks.restaurantId, id), eq(restaurantEditUnlocks.userId, g.userId)))
    .limit(1);

  if (existing) {
    await db
      .update(restaurantEditUnlocks)
      .set({ codeHash: hashCode(code), codeExpiresAt, attempts: 0, updatedAt: new Date() })
      .where(eq(restaurantEditUnlocks.id, existing.id));
  } else {
    await db.insert(restaurantEditUnlocks).values({
      restaurantId: id,
      userId: g.userId,
      codeHash: hashCode(code),
      codeExpiresAt,
    });
  }

  // Email the owner their code.
  const [me] = await db.select({ email: users.email }).from(users).where(eq(users.id, g.userId)).limit(1);
  const [rest] = await db.select({ name: restaurants.name }).from(restaurants).where(eq(restaurants.id, id)).limit(1);
  if (me?.email && rest?.name) {
    await sendMenuEditCodeEmail(me.email, rest.name, code);
  }

  return NextResponse.json({ ok: true, sent: true });
}
