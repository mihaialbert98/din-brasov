"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export interface MemberData {
  id: string;
  role: string; // owner | waiter
  name: string;
  email: string;
}

export default function StaffManager({
  restaurantId,
  initialMembers,
}: {
  restaurantId: string;
  initialMembers: MemberData[];
}) {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const base = `/api/restaurants/${restaurantId}/members`;

  async function addWaiter() {
    const value = email.trim();
    if (!value) return;
    setError(null);
    setBusy(true);
    try {
      const res = await fetch(base, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: value }),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        throw new Error(d.error ?? "Eroare.");
      }
      setEmail("");
      router.refresh();
    } catch (e: any) {
      setError(e?.message ?? "Eroare.");
    } finally {
      setBusy(false);
    }
  }

  async function remove(m: MemberData) {
    if (!confirm(`Elimini ${m.name} (${m.email}) din echipă?`)) return;
    setBusy(true);
    try {
      const res = await fetch(`${base}/${m.id}`, { method: "DELETE" });
      if (res.ok) router.refresh();
      else {
        const d = await res.json().catch(() => ({}));
        setError(d.error ?? "Eroare.");
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-6">
      {error && (
        <div role="alert" className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg text-sm">
          ⚠️ {error}
        </div>
      )}

      <div className="bg-white rounded-xl shadow-sm p-4 flex gap-2">
        <input
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && addWaiter()}
          placeholder="email@ospatar.ro"
          className="flex-1 border border-gray-300 rounded-lg px-4 py-2.5 text-base focus:outline-none focus:border-[#c84b1e]"
        />
        <button
          onClick={addWaiter}
          disabled={busy || !email.trim()}
          className="bg-[#c84b1e] text-white font-semibold px-4 py-2.5 rounded-lg hover:bg-[#d9603a] transition-colors disabled:opacity-50"
        >
          Adaugă ospătar
        </button>
      </div>

      <div className="bg-white rounded-xl shadow-sm divide-y">
        {initialMembers.map((m) => (
          <div key={m.id} className="p-4 flex items-center justify-between gap-3">
            <div className="min-w-0">
              <p className="font-medium text-gray-900 truncate">{m.name}</p>
              <p className="text-sm text-gray-500 truncate">{m.email}</p>
            </div>
            <div className="flex items-center gap-3 flex-shrink-0">
              <span
                className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                  m.role === "owner" ? "bg-[#c84b1e]/10 text-[#c84b1e]" : "bg-gray-100 text-gray-600"
                }`}
              >
                {m.role === "owner" ? "Proprietar" : "Ospătar"}
              </span>
              {m.role !== "owner" && (
                <button
                  onClick={() => remove(m)}
                  disabled={busy}
                  className="text-xs text-red-500 hover:underline disabled:opacity-50"
                >
                  Elimină
                </button>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
