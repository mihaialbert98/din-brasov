import { db } from "@/lib/db";
import { users, userReports, listings } from "@/lib/db/schema";
import { desc, eq, count } from "drizzle-orm";
import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { formatDate } from "@/lib/utils";
import Link from "next/link";
import { OpenSupportButton } from "@/components/admin/OpenSupportButton";
import { StatusBadge } from "@/components/ui/StatusBadge";
import Pagination from "@/components/ui/Pagination";
import type { Metadata } from "next";

export const metadata: Metadata = { title: "Admin — Utilizatori" };

const PAGE_SIZE = 30;

const ROLE_LABELS: Record<string, string> = {
  user: "Utilizator",
  staff: "Asistent",
  moderator: "Moderator",
  admin: "Administrator",
  restaurant_admin: "Admin restaurant",
};

export default async function UtilizatoriPage({
  searchParams,
}: {
  searchParams: Promise<{ pagina?: string }>;
}) {
  const session = await auth();
  const role = (session?.user as any)?.role;
  if (role !== "admin" && role !== "moderator") redirect("/admin");
  const isAdmin = role === "admin";
  const params = await searchParams;
  const page = Math.max(1, parseInt(params.pagina ?? "1"));

  // Pending user reports with context
  const pendingReports = await db
    .select({
      id: userReports.id,
      reason: userReports.reason,
      createdAt: userReports.createdAt,
      listingId: userReports.listingId,
      reportedUserId: userReports.reportedUserId,
      reporterId: userReports.reporterId,
    })
    .from(userReports)
    .where(eq(userReports.status, "pending"))
    .orderBy(desc(userReports.createdAt));

  // Enrich reports with user names
  const enrichedReports = await Promise.all(
    pendingReports.map(async (r) => {
      const [reported] = await db
        .select({ name: users.name, email: users.email })
        .from(users)
        .where(eq(users.id, r.reportedUserId))
        .limit(1);
      const [reporter] = r.reporterId
        ? await db.select({ name: users.name }).from(users).where(eq(users.id, r.reporterId)).limit(1)
        : [{ name: null }];
      const [listing] = r.listingId
        ? await db.select({ title: listings.title, slug: listings.slug }).from(listings).where(eq(listings.id, r.listingId)).limit(1)
        : [null];
      return { ...r, reported, reporterName: reporter?.name, listing };
    })
  );

  const [allUsers, [{ total }]] = await Promise.all([
    db
      .select({
        id: users.id,
        name: users.name,
        email: users.email,
        role: users.role,
        createdAt: users.createdAt,
        deletedAt: users.deletedAt,
        deletionRequestedAt: users.deletionRequestedAt,
        bannedUntil: users.bannedUntil,
      })
      .from(users)
      .orderBy(desc(users.createdAt))
      .limit(PAGE_SIZE)
      .offset((page - 1) * PAGE_SIZE),
    db.select({ total: count() }).from(users),
  ]);

  const totalPages = Math.ceil(total / PAGE_SIZE);

  return (
    <div className="space-y-8">
      {/* Pending reports */}
      <section>
        <div className="flex items-center justify-between mb-4">
          <h1 className="text-2xl font-bold text-gray-900">Utilizatori</h1>
          {enrichedReports.length > 0 && (
            <span className="bg-red-100 text-red-700 text-sm font-medium px-3 py-1 rounded-full">
              {enrichedReports.length} raport{enrichedReports.length !== 1 ? "e" : ""} în așteptare
            </span>
          )}
        </div>

        {enrichedReports.length > 0 && (
          <div className="bg-white rounded-xl shadow-sm overflow-hidden mb-6">
            <div className="bg-amber-50 border-b border-amber-100 px-4 py-3">
              <h2 className="font-semibold text-amber-800 text-sm">Rapoarte utilizatori în așteptare</h2>
            </div>
            <div className="divide-y divide-gray-100">
              {enrichedReports.map((r) => (
                <div key={r.id} className="p-4">
                  <div className="flex items-start gap-4">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="font-semibold text-gray-900">
                          {r.reported?.name ?? "Utilizator"} —{" "}
                          <span className="font-normal text-gray-500 text-sm">{r.reported?.email}</span>
                        </span>
                      </div>
                      <p className="text-sm text-gray-600 mb-1">
                        <span className="text-gray-400">Raportat de:</span> {r.reporterName ?? "Anonim"}
                        {r.listing && (
                          <> · <Link href={`/anunturi/${r.listing.slug}`} className="text-[#c84b1e] hover:underline" target="_blank">
                            {r.listing.title}
                          </Link></>
                        )}
                      </p>
                      <p className="text-sm text-gray-700 bg-gray-50 rounded-lg px-3 py-2 line-clamp-2">
                        {r.reason}
                      </p>
                      <p className="text-xs text-gray-400 mt-1">
                        {r.createdAt ? formatDate(r.createdAt, { day: "numeric", month: "short", year: "numeric" }) : ""}
                      </p>
                    </div>
                    <div className="flex flex-col gap-2 flex-shrink-0">
                      {r.reporterId && (
                        <OpenSupportButton
                          userId={r.reporterId}
                          subject="Context raport"
                          label="Contactează raportorul"
                          className="text-xs bg-[#6bb5d4] text-white px-3 py-1.5 rounded-lg hover:bg-[#5aa3c0] transition-colors whitespace-nowrap"
                        />
                      )}
                      <OpenSupportButton
                        userId={r.reportedUserId}
                        subject="Raport utilizator"
                        label="Contactează utilizatorul raportat"
                        className="text-xs bg-[#1a1a1a] text-white px-3 py-1.5 rounded-lg hover:bg-gray-700 transition-colors whitespace-nowrap"
                      />
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </section>

      {/* Users table */}
      <section>
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-base font-semibold text-gray-700">Toți utilizatorii</h2>
          <span className="text-sm text-gray-500">{total} total</span>
        </div>

        <div className="bg-white rounded-xl shadow-sm overflow-x-auto">
          <table className="w-full text-sm min-w-[560px]">
            <thead className="bg-gray-50 border-b">
              <tr>
                <th className="text-left p-3 font-semibold text-gray-600">Nume</th>
                <th className="text-left p-3 font-semibold text-gray-600">Email</th>
                <th className="text-left p-3 font-semibold text-gray-600">Rol</th>
                <th className="text-left p-3 font-semibold text-gray-600">Înregistrat</th>
                <th className="text-left p-3 font-semibold text-gray-600">Status</th>
                <th className="text-left p-3 font-semibold text-gray-600">Suport</th>
                {isAdmin && <th className="text-left p-3 font-semibold text-gray-600">Rol</th>}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {allUsers.map((u) => {
                const isDeleted = !!u.deletedAt;
                const pendingDeletion = !!u.deletionRequestedAt && !isDeleted;
                const isSelf = u.id === session?.user?.id;
                const isBanned = u.bannedUntil && u.bannedUntil > new Date();

                return (
                  <tr key={u.id} className={`hover:bg-gray-50 ${isDeleted ? "opacity-50" : ""}`}>
                    <td className="p-3 font-medium text-gray-900">
                      {u.name ?? "—"}
                      {isSelf && <span className="ml-2 text-xs text-gray-400">(tu)</span>}
                    </td>
                    <td className="p-3 text-gray-500 text-xs">{u.email}</td>
                    <td className="p-3">
                      <StatusBadge status={u.role} label={ROLE_LABELS[u.role] ?? u.role} />
                    </td>
                    <td className="p-3 text-gray-400 text-xs">
                      {u.createdAt ? formatDate(u.createdAt, { day: "numeric", month: "short", year: "numeric" }) : "—"}
                    </td>
                    <td className="p-3 text-xs space-y-0.5">
                      {isDeleted ? (
                        <span className="text-red-500">Șters</span>
                      ) : pendingDeletion ? (
                        <span className="text-amber-600">Ștergere solicitată</span>
                      ) : isBanned ? (
                        <span className="text-amber-600">
                          Suspendat până la {u.bannedUntil!.toLocaleDateString("ro-RO")}
                        </span>
                      ) : (
                        <span className="text-green-600">Activ</span>
                      )}
                    </td>
                    <td className="p-3">
                      {!isDeleted && !isSelf && (
                        <OpenSupportButton
                          userId={u.id}
                          label="Contactează"
                          className="text-xs bg-[#6bb5d4] text-white px-3 py-1.5 rounded-lg hover:bg-[#5aa3c0] transition-colors"
                        />
                      )}
                    </td>
                    {isAdmin && (
                      <td className="p-3">
                        {!isDeleted && !isSelf && (
                          <form action="/api/admin/users/role" method="POST" className="flex items-center gap-2">
                            <input type="hidden" name="userId" value={u.id} />
                            <select
                              name="role"
                              defaultValue={u.role}
                              className="text-xs border border-gray-300 rounded px-2 py-1 focus:outline-none focus:border-[#c84b1e]"
                            >
                              <option value="user">Utilizator</option>
                              <option value="staff">Asistent</option>
                              <option value="restaurant_admin">Admin restaurant</option>
                              <option value="moderator">Moderator</option>
                              <option value="admin">Administrator</option>
                            </select>
                            <button
                              type="submit"
                              className="text-xs bg-[#1a1a1a] text-white px-3 py-1 rounded hover:bg-gray-700 transition-colors"
                            >
                              Salvează
                            </button>
                          </form>
                        )}
                      </td>
                    )}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        <Pagination
          currentPage={page}
          totalPages={totalPages}
          buildHref={(p) => `/admin/utilizatori${p > 1 ? `?pagina=${p}` : ""}`}
        />
      </section>
    </div>
  );
}
