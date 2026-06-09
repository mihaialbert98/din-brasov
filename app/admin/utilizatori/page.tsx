import { db } from "@/lib/db";
import { users } from "@/lib/db/schema";
import { desc } from "drizzle-orm";
import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { formatDate } from "@/lib/utils";
import type { Metadata } from "next";

export const metadata: Metadata = { title: "Admin — Utilizatori" };

const ROLE_LABELS: Record<string, string> = {
  user: "Utilizator",
  staff: "Asistent",
  moderator: "Moderator",
  admin: "Administrator",
};

const ROLE_COLORS: Record<string, string> = {
  user: "bg-gray-100 text-gray-700",
  staff: "bg-blue-100 text-blue-700",
  moderator: "bg-purple-100 text-purple-700",
  admin: "bg-red-100 text-red-700",
};

export default async function UtilizatoriPage() {
  const session = await auth();
  const role = (session?.user as any)?.role;
  if (role !== "admin") redirect("/admin");

  const allUsers = await db
    .select({
      id: users.id,
      name: users.name,
      email: users.email,
      role: users.role,
      createdAt: users.createdAt,
      deletedAt: users.deletedAt,
      deletionRequestedAt: users.deletionRequestedAt,
    })
    .from(users)
    .orderBy(desc(users.createdAt));

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900">Utilizatori</h1>
        <span className="text-sm text-gray-500">{allUsers.length} total</span>
      </div>

      <div className="bg-white rounded-xl shadow-sm overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 border-b">
            <tr>
              <th className="text-left p-3 font-semibold text-gray-600">Nume</th>
              <th className="text-left p-3 font-semibold text-gray-600">Email</th>
              <th className="text-left p-3 font-semibold text-gray-600">Rol</th>
              <th className="text-left p-3 font-semibold text-gray-600">Înregistrat</th>
              <th className="text-left p-3 font-semibold text-gray-600">Status</th>
              <th className="text-left p-3 font-semibold text-gray-600">Acțiuni</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {allUsers.map((u) => {
              const isDeleted = !!u.deletedAt;
              const pendingDeletion = !!u.deletionRequestedAt && !isDeleted;
              const isSelf = u.id === session?.user?.id;

              return (
                <tr key={u.id} className={`hover:bg-gray-50 ${isDeleted ? "opacity-50" : ""}`}>
                  <td className="p-3 font-medium text-gray-900">
                    {u.name ?? "—"}
                    {isSelf && <span className="ml-2 text-xs text-gray-400">(tu)</span>}
                  </td>
                  <td className="p-3 text-gray-500 text-xs">{u.email}</td>
                  <td className="p-3">
                    <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${ROLE_COLORS[u.role] ?? "bg-gray-100 text-gray-700"}`}>
                      {ROLE_LABELS[u.role] ?? u.role}
                    </span>
                  </td>
                  <td className="p-3 text-gray-400 text-xs">
                    {u.createdAt ? formatDate(u.createdAt, { day: "numeric", month: "short", year: "numeric" }) : "—"}
                  </td>
                  <td className="p-3">
                    {isDeleted ? (
                      <span className="text-xs text-red-500">Șters</span>
                    ) : pendingDeletion ? (
                      <span className="text-xs text-amber-600">Ștergere solicitată</span>
                    ) : (
                      <span className="text-xs text-green-600">Activ</span>
                    )}
                  </td>
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
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
