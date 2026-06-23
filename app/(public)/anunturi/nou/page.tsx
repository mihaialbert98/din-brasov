import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { users } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { NouAnuntForm } from "./NouAnuntForm";
import { PAYMENTS_ENABLED } from "@/lib/payments";
import { isStaffExempt, findReusablePaidSlot, countFreeListings } from "@/lib/permissions";
import type { Metadata } from "next";

export const metadata: Metadata = { title: "Adaugă anunț" };

export default async function NouAnuntPage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/intra?next=/anunturi/nou");

  const [user] = await db
    .select({
      freeListingsAllowance: users.freeListingsAllowance,
      role: users.role,
    })
    .from(users)
    .where(eq(users.id, session.user.id))
    .limit(1);

  // Same free-quota basis the create API enforces (shared helper).
  const currentCount = await countFreeListings(session.user.id);

  // If over the free quota, a vacated paid slot still lets them post one free
  // replacement — so the form must not block in that case (mirrors the API).
  const allowance = user?.freeListingsAllowance ?? 2;
  const exempt = isStaffExempt(user?.role);
  const hasReusableSlot =
    !exempt && currentCount >= allowance ? !!(await findReusablePaidSlot(session.user.id)) : false;

  return (
    <NouAnuntForm
      currentCount={currentCount}
      allowance={allowance}
      exempt={exempt}
      hasReusableSlot={hasReusableSlot}
      paymentsEnabled={PAYMENTS_ENABLED}
    />
  );
}
