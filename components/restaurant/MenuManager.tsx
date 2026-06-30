"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import ImageField from "@/components/admin/ImageField";

// EU/ANPC 14 major allergens (Reg. 1169/2011, Order 201/2022).
const ALLERGENS = [
  "Gluten", "Crustacee", "Ouă", "Pește", "Arahide", "Soia", "Lapte",
  "Fructe cu coajă", "Țelină", "Muștar", "Susan", "Sulfiți", "Lupin", "Moluște",
];

export interface MenuItemData {
  id: string;
  name: string;
  description: string | null;
  price: string | null;
  imageUrl: string | null;
  allergens: string[];
  isAvailable: boolean;
}
export interface MenuCategoryData {
  id: string;
  name: string;
  items: MenuItemData[];
}

export default function MenuManager({
  restaurantId,
  initialCategories,
  requiresUnlock = false,
  initiallyUnlocked = true,
}: {
  restaurantId: string;
  initialCategories: MenuCategoryData[];
  requiresUnlock?: boolean; // false for admins (they bypass 2FA)
  initiallyUnlocked?: boolean;
}) {
  const router = useRouter();
  const [newCategory, setNewCategory] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Which category is showing its item form, and the item being edited (or null = new).
  const [itemForm, setItemForm] = useState<{ categoryId: string; item: MenuItemData | null } | null>(null);

  // Edit lock (2FA). When requiresUnlock and not unlocked, mutations are blocked.
  const [unlocked, setUnlocked] = useState(!requiresUnlock || initiallyUnlocked);
  const [codeSent, setCodeSent] = useState(false);
  const [code, setCode] = useState("");
  const [unlockBusy, setUnlockBusy] = useState(false);
  const [unlockError, setUnlockError] = useState<string | null>(null);

  const base = `/api/restaurants/${restaurantId}/menu`;
  const locked = requiresUnlock && !unlocked;

  async function requestCode() {
    setUnlockBusy(true);
    setUnlockError(null);
    try {
      const res = await fetch(`${base}/unlock`, { method: "POST" });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(d.error ?? "Eroare.");
      if (d.unlocked) { setUnlocked(true); return; } // admin shortcut
      setCodeSent(true);
    } catch (e: any) {
      setUnlockError(e?.message ?? "Eroare.");
    } finally {
      setUnlockBusy(false);
    }
  }

  async function verifyCode() {
    const value = code.trim();
    if (!value) return;
    setUnlockBusy(true);
    setUnlockError(null);
    try {
      const res = await fetch(`${base}/unlock?action=verify`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code: value }),
      });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(d.error ?? "Cod greșit.");
      setUnlocked(true);
      setCode("");
      setCodeSent(false);
    } catch (e: any) {
      setUnlockError(e?.message ?? "Cod greșit.");
    } finally {
      setUnlockBusy(false);
    }
  }

  async function call(url: string, method: string, body?: unknown) {
    setError(null);
    setBusy(true);
    try {
      const res = await fetch(url, {
        method,
        headers: body ? { "Content-Type": "application/json" } : undefined,
        body: body ? JSON.stringify(body) : undefined,
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        // 423 = edit window expired mid-session → re-lock and prompt for a code.
        if (res.status === 423) setUnlocked(false);
        throw new Error(d.error ?? "Eroare.");
      }
      return await res.json().catch(() => ({}));
    } catch (e: any) {
      setError(e?.message ?? "Eroare.");
      return null;
    } finally {
      setBusy(false);
    }
  }

  async function addCategory() {
    const name = newCategory.trim();
    if (!name) return;
    const r = await call(`${base}/categories`, "POST", { name });
    if (r) { setNewCategory(""); router.refresh(); }
  }

  async function renameCategory(id: string, current: string) {
    const name = prompt("Nume categorie:", current)?.trim();
    if (!name || name === current) return;
    const r = await call(`${base}/categories/${id}`, "PATCH", { name });
    if (r) router.refresh();
  }

  async function deleteCategory(id: string, name: string) {
    if (!confirm(`Ștergi categoria „${name}" și toate produsele din ea?`)) return;
    const r = await call(`${base}/categories/${id}`, "DELETE");
    if (r) router.refresh();
  }

  async function toggleAvailable(item: MenuItemData) {
    const r = await call(`${base}/items/${item.id}`, "PATCH", { isAvailable: !item.isAvailable });
    if (r) router.refresh();
  }

  async function deleteItem(item: MenuItemData) {
    if (!confirm(`Ștergi „${item.name}"?`)) return;
    const r = await call(`${base}/items/${item.id}`, "DELETE");
    if (r) router.refresh();
  }

  async function saveItem(form: ItemFormValues) {
    const { categoryId, item } = itemForm!;
    const body = {
      name: form.name,
      description: form.description || undefined,
      price: form.price || undefined,
      imageUrl: form.imageUrl || undefined,
      allergens: form.allergens,
      isAvailable: form.isAvailable,
    };
    const r = item
      ? await call(`${base}/items/${item.id}`, "PATCH", body)
      : await call(`${base}/items`, "POST", { ...body, categoryId });
    if (r) { setItemForm(null); router.refresh(); }
  }

  return (
    <div className="space-y-6">
      {error && (
        <div role="alert" className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg text-sm">
          ⚠️ {error}
        </div>
      )}

      {/* Edit lock (2FA) banner */}
      {locked && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-4">
          <p className="text-sm font-medium text-amber-900 mb-1">🔒 Editarea meniului este blocată</p>
          <p className="text-xs text-amber-800 mb-3">
            Pentru siguranță, modificările necesită un cod trimis pe emailul tău. Codul deblochează
            editarea pentru 30 de minute.
          </p>
          {unlockError && <p className="text-xs text-red-600 mb-2">{unlockError}</p>}
          {!codeSent ? (
            <button
              onClick={requestCode}
              disabled={unlockBusy}
              className="bg-[#c84b1e] text-white text-sm font-semibold px-4 py-2 rounded-lg hover:bg-[#d9603a] transition-colors disabled:opacity-50"
            >
              {unlockBusy ? "Se trimite..." : "Trimite cod pe email"}
            </button>
          ) : (
            <div className="flex gap-2 flex-wrap items-center">
              <input
                value={code}
                onChange={(e) => setCode(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && verifyCode()}
                placeholder="Cod din email"
                inputMode="numeric"
                className="border border-gray-300 rounded-lg px-4 py-2 text-base focus:outline-none focus:border-[#c84b1e] w-40"
              />
              <button
                onClick={verifyCode}
                disabled={unlockBusy || !code.trim()}
                className="bg-[#c84b1e] text-white text-sm font-semibold px-4 py-2 rounded-lg hover:bg-[#d9603a] transition-colors disabled:opacity-50"
              >
                {unlockBusy ? "..." : "Deblochează"}
              </button>
              <button onClick={requestCode} disabled={unlockBusy} className="text-xs text-gray-500 hover:underline">
                Retrimite codul
              </button>
            </div>
          )}
        </div>
      )}

      {/* Add category */}
      {!locked && (
      <div className="bg-white rounded-xl shadow-sm p-4 flex gap-2">
        <input
          value={newCategory}
          onChange={(e) => setNewCategory(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && addCategory()}
          placeholder="Categorie nouă (ex: Băuturi)"
          className="flex-1 border border-gray-300 rounded-lg px-4 py-2.5 text-base focus:outline-none focus:border-[#c84b1e]"
        />
        <button
          onClick={addCategory}
          disabled={busy || !newCategory.trim()}
          className="bg-[#c84b1e] text-white font-semibold px-4 py-2.5 rounded-lg hover:bg-[#d9603a] transition-colors disabled:opacity-50"
        >
          Adaugă
        </button>
      </div>
      )}

      {initialCategories.length === 0 && (
        <p className="text-gray-500 text-sm">Nicio categorie încă. Adaugă prima categorie mai sus.</p>
      )}

      {initialCategories.map((cat) => (
        <div key={cat.id} className="bg-white rounded-xl shadow-sm p-5">
          <div className="flex items-center justify-between mb-3">
            <h2 className="font-semibold text-lg text-gray-900">{cat.name}</h2>
            {!locked && (
            <div className="flex gap-2 text-xs">
              <button onClick={() => renameCategory(cat.id, cat.name)} className="text-gray-500 hover:underline">
                Redenumește
              </button>
              <button onClick={() => deleteCategory(cat.id, cat.name)} className="text-red-500 hover:underline">
                Șterge
              </button>
            </div>
            )}
          </div>

          {cat.items.length === 0 ? (
            <p className="text-sm text-gray-400 mb-3">Niciun produs în această categorie.</p>
          ) : (
            <ul className="divide-y mb-3">
              {cat.items.map((item) => (
                <li key={item.id} className="py-3 flex items-start gap-3">
                  {item.imageUrl && (
                    <img src={item.imageUrl} alt="" className="w-14 h-14 rounded-lg object-cover flex-shrink-0" />
                  )}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-medium text-gray-900">{item.name}</span>
                      {item.price && <span className="text-sm text-[#c84b1e] font-medium">{item.price} RON</span>}
                      {!item.isAvailable && (
                        <span className="text-xs px-2 py-0.5 rounded-full bg-gray-100 text-gray-500">Indisponibil</span>
                      )}
                    </div>
                    {item.description && <p className="text-sm text-gray-500 line-clamp-2">{item.description}</p>}
                    {item.allergens.length > 0 && (
                      <p className="text-xs text-gray-400 mt-0.5">Alergeni: {item.allergens.join(", ")}</p>
                    )}
                  </div>
                  {!locked && (
                  <div className="flex flex-col gap-1 items-end text-xs flex-shrink-0">
                    <button onClick={() => toggleAvailable(item)} className="text-gray-500 hover:underline" disabled={busy}>
                      {item.isAvailable ? "Marchează indisponibil" : "Marchează disponibil"}
                    </button>
                    <button onClick={() => setItemForm({ categoryId: cat.id, item })} className="text-gray-500 hover:underline">
                      Editează
                    </button>
                    <button onClick={() => deleteItem(item)} className="text-red-500 hover:underline" disabled={busy}>
                      Șterge
                    </button>
                  </div>
                  )}
                </li>
              ))}
            </ul>
          )}

          {!locked && (
            <button
              onClick={() => setItemForm({ categoryId: cat.id, item: null })}
              className="text-sm text-[#c84b1e] font-medium hover:underline"
            >
              + Adaugă produs
            </button>
          )}
        </div>
      ))}

      {itemForm && (
        <ItemFormModal
          initial={itemForm.item}
          busy={busy}
          onCancel={() => setItemForm(null)}
          onSave={saveItem}
        />
      )}
    </div>
  );
}

interface ItemFormValues {
  name: string;
  description: string;
  price: string;
  imageUrl: string;
  allergens: string[];
  isAvailable: boolean;
}

function ItemFormModal({
  initial,
  busy,
  onCancel,
  onSave,
}: {
  initial: MenuItemData | null;
  busy: boolean;
  onCancel: () => void;
  onSave: (v: ItemFormValues) => void;
}) {
  const [name, setName] = useState(initial?.name ?? "");
  const [description, setDescription] = useState(initial?.description ?? "");
  const [price, setPrice] = useState(initial?.price ?? "");
  const [imageUrl, setImageUrl] = useState(initial?.imageUrl ?? "");
  const [allergens, setAllergens] = useState<string[]>(initial?.allergens ?? []);
  const [isAvailable, setIsAvailable] = useState(initial?.isAvailable ?? true);
  const [formError, setFormError] = useState<string | null>(null);

  function toggleAllergen(a: string) {
    setAllergens((prev) => (prev.includes(a) ? prev.filter((x) => x !== a) : [...prev, a]));
  }

  function submit() {
    if (!name.trim()) { setFormError("Numele este obligatoriu."); return; }
    onSave({ name: name.trim(), description, price, imageUrl, allergens, isAvailable });
  }

  const field =
    "w-full border border-gray-300 rounded-lg px-4 py-2.5 text-base focus:outline-none focus:border-[#c84b1e]";

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center p-4 z-50">
      <div className="bg-white rounded-xl shadow-lg w-full max-w-lg max-h-[90vh] overflow-auto p-6 space-y-4">
        <h3 className="font-semibold text-lg">{initial ? "Editează produs" : "Produs nou"}</h3>

        {formError && <p className="text-sm text-red-600">{formError}</p>}

        <div className="flex flex-col gap-1">
          <label className="text-sm font-medium text-gray-700">Nume *</label>
          <input value={name} onChange={(e) => setName(e.target.value)} className={field} maxLength={200} />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div className="flex flex-col gap-1">
            <label className="text-sm font-medium text-gray-700">Preț (RON)</label>
            <input value={price} onChange={(e) => setPrice(e.target.value)} className={field} maxLength={40} placeholder="ex: 24.90" />
          </div>
          <label className="flex items-center gap-2 mt-6 cursor-pointer select-none">
            <input type="checkbox" checked={isAvailable} onChange={(e) => setIsAvailable(e.target.checked)} className="w-4 h-4 accent-[#c84b1e]" />
            <span className="text-sm text-gray-700">Disponibil</span>
          </label>
        </div>

        <div className="flex flex-col gap-1">
          <label className="text-sm font-medium text-gray-700">Descriere</label>
          <textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={3} className={`${field} resize-y`} maxLength={2000} />
        </div>

        <div className="flex flex-col gap-1">
          <label className="text-sm font-medium text-gray-700">Alergeni</label>
          <div className="flex flex-wrap gap-2">
            {ALLERGENS.map((a) => (
              <button
                key={a}
                type="button"
                onClick={() => toggleAllergen(a)}
                className={`text-xs px-2.5 py-1 rounded-full border transition-colors ${
                  allergens.includes(a)
                    ? "bg-[#c84b1e] text-white border-[#c84b1e]"
                    : "border-gray-300 text-gray-600 hover:bg-gray-50"
                }`}
              >
                {a}
              </button>
            ))}
          </div>
        </div>

        <ImageField
          endpoint="menuItemImage"
          value={imageUrl}
          onChange={setImageUrl}
          onError={(msg) => setFormError(msg)}
        />

        <div className="flex gap-3 pt-2">
          <button onClick={onCancel} className="flex-1 border border-gray-300 text-gray-700 font-medium py-2.5 rounded-lg hover:bg-gray-50 transition-colors">
            Anulează
          </button>
          <button onClick={submit} disabled={busy} className="flex-1 bg-[#c84b1e] text-white font-semibold py-2.5 rounded-lg hover:bg-[#d9603a] transition-colors disabled:opacity-60">
            {busy ? "Se salvează..." : "Salvează"}
          </button>
        </div>
      </div>
    </div>
  );
}
