import { notFound, redirect } from "next/navigation";
import QRCode from "qrcode";
import { Crown, UserRound, Info } from "lucide-react";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { restaurants, restaurantMembers, users } from "@/lib/db/schema";
import { eq, desc } from "drizzle-orm";
import {
  getRestaurantBySlug,
  canManageRestaurant,
  canEditMenuNow,
  isPlatformStaff,
} from "@/lib/restaurant-permissions";
import { absoluteUrl } from "@/lib/seo";
import StaffLinkCard from "@/components/restaurant/StaffLinkCard";

const ROLE_LABEL: Record<string, string> = { owner: "Proprietar", waiter: "Ospătar" };

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

  // Members with names/emails.
  const members = await db
    .select({
      id: restaurantMembers.id,
      memberRole: restaurantMembers.memberRole,
      name: users.name,
      email: users.email,
    })
    .from(restaurantMembers)
    .innerJoin(users, eq(restaurantMembers.userId, users.id))
    .where(eq(restaurantMembers.restaurantId, restaurant.id))
    .orderBy(desc(restaurantMembers.memberRole)); // owner sorts after waiter alphabetically → handle below

  const owners = members.filter((m) => m.memberRole === "owner");
  const waiters = members.filter((m) => m.memberRole === "waiter");

  // Staff link + QR (waiters use this — no account needed).
  const [row] = await db
    .select({ staffToken: restaurants.staffToken })
    .from(restaurants)
    .where(eq(restaurants.id, restaurant.id))
    .limit(1);
  const staffUrl = absoluteUrl(`/s/${row!.staffToken}`);
  const staffQr = await QRCode.toDataURL(staffUrl, { width: 240, margin: 1, color: { dark: "#1a1a1a", light: "#ffffff" } });
  const isAdmin = isPlatformStaff(role);
  const canRegenerate = isAdmin || (await canEditMenuNow(session.user.id, restaurant.id, role));

  return (
    <div className="max-w-2xl space-y-8">
      <div>
        <h1 className="text-2xl font-bold text-gray-900 mb-1">Membri echipă</h1>
        <p className="text-sm text-gray-500">Cine are acces la acest restaurant pe Din Brașov.</p>
      </div>

      {/* Members list */}
      <div className="bg-white rounded-xl border border-gray-200 divide-y divide-gray-100">
        {[...owners, ...waiters].map((m) => (
          <div key={m.id} className="flex items-center gap-3 px-4 py-3">
            <span className={`w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0 ${m.memberRole === "owner" ? "bg-[#c84b1e]/10" : "bg-gray-100"}`}>
              {m.memberRole === "owner"
                ? <Crown className="w-4 h-4 text-[#c84b1e]" aria-hidden />
                : <UserRound className="w-4 h-4 text-gray-500" aria-hidden />}
            </span>
            <div className="min-w-0">
              <p className="font-medium text-gray-900 truncate">{m.name ?? m.email}</p>
              <p className="text-xs text-gray-500 truncate">{m.email}</p>
            </div>
            <span className="ml-auto text-xs font-medium px-2 py-0.5 rounded-full bg-gray-100 text-gray-600">
              {ROLE_LABEL[m.memberRole] ?? m.memberRole}
            </span>
          </div>
        ))}
      </div>

      {/* How waiters join — the no-account model */}
      <div>
        <div className="flex items-start gap-2 bg-blue-50 border border-blue-100 rounded-xl p-4 mb-4 text-sm text-blue-800">
          <Info className="w-5 h-5 flex-shrink-0 mt-0.5" aria-hidden />
          <p>
            Ospătarii <strong>nu au nevoie de cont</strong>. Trimite-le linkul de serviciu de mai jos —
            îl deschid pe telefon și văd cererile clienților și rezervările. Regenerează linkul dacă
            un ospătar pleacă.
          </p>
        </div>
        <StaffLinkCard
          restaurantId={restaurant.id}
          staffUrl={staffUrl}
          qrDataUrl={staffQr}
          canRegenerate={canRegenerate}
        />
      </div>
    </div>
  );
}
