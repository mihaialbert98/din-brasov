import { notFound, redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { restaurantMembers, users } from "@/lib/db/schema";
import { eq, asc } from "drizzle-orm";
import {
  getRestaurantBySlug,
  canManageRestaurant,
} from "@/lib/restaurant-permissions";
import StaffManager, { type MemberData } from "@/components/restaurant/StaffManager";

export default async function PersonalPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const session = await auth();
  if (!session?.user?.id) redirect("/intra");

  const restaurant = await getRestaurantBySlug(slug);
  if (!restaurant) notFound();

  const role = (session.user as any)?.role as string | undefined;
  if (!(await canManageRestaurant(session.user.id, restaurant.id, role))) notFound();

  const rows = await db
    .select({
      id: restaurantMembers.id,
      memberRole: restaurantMembers.memberRole,
      name: users.name,
      email: users.email,
    })
    .from(restaurantMembers)
    .innerJoin(users, eq(restaurantMembers.userId, users.id))
    .where(eq(restaurantMembers.restaurantId, restaurant.id))
    .orderBy(asc(restaurantMembers.createdAt));

  const members: MemberData[] = rows.map((r) => ({
    id: r.id,
    role: r.memberRole,
    name: r.name ?? "—",
    email: r.email,
  }));

  return (
    <div className="max-w-2xl">
      <h1 className="text-2xl font-bold text-gray-900 mb-1">Personal</h1>
      <p className="text-sm text-gray-500 mb-6">
        Adaugă ospătari după email. Aceștia trebuie să aibă deja cont pe Din Brașov și vor vedea
        cererile de la mese.
      </p>
      <StaffManager restaurantId={restaurant.id} initialMembers={members} />
    </div>
  );
}
