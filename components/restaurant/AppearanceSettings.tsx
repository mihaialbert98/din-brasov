"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { MENU_DESIGNS, getDesign, type MenuThemeTokens } from "@/lib/menu-themes";

export default function AppearanceSettings({
  restaurantId,
  initialDesign,
  initialTheme,
  totalItems,
  itemsWithPhoto,
  requiresUnlock = false,
  initiallyUnlocked = true,
}: {
  restaurantId: string;
  initialDesign: string;
  initialTheme: string;
  totalItems: number;
  itemsWithPhoto: number;
  requiresUnlock?: boolean; // false for platform admins (they bypass 2FA)
  initiallyUnlocked?: boolean;
}) {
  const router = useRouter();
  const [design, setDesign] = useState(initialDesign);
  const [theme, setTheme] = useState(initialTheme);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [missing, setMissing] = useState<string[] | null>(null);
  const [saved, setSaved] = useState(false);

  // Same 2FA lock as the menu editor — the appearance change is a menu mutation.
  const [unlocked, setUnlocked] = useState(!requiresUnlock || initiallyUnlocked);
  const [codeSent, setCodeSent] = useState(false);
  const [code, setCode] = useState("");
  const [unlockBusy, setUnlockBusy] = useState(false);
  const [unlockError, setUnlockError] = useState<string | null>(null);
  const locked = requiresUnlock && !unlocked;

  async function requestCode() {
    setUnlockBusy(true);
    setUnlockError(null);
    try {
      const res = await fetch(`/api/restaurants/${restaurantId}/menu/unlock`, { method: "POST" });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(d.error ?? "Eroare.");
      if (d.unlocked) { setUnlocked(true); return; }
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
      const res = await fetch(`/api/restaurants/${restaurantId}/menu/unlock?action=verify`, {
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

  const dirty = design !== initialDesign || theme !== initialTheme;
  const missingPhotos = Math.max(0, totalItems - itemsWithPhoto);

  function pickDesign(id: string) {
    setDesign(id);
    setMissing(null);
    setError(null);
    setSaved(false);
    // Snap to the first theme of the newly chosen design.
    setTheme(getDesign(id).themes[0].id);
  }

  function pickTheme(id: string) {
    setTheme(id);
    setSaved(false);
  }

  async function save() {
    setBusy(true);
    setError(null);
    setMissing(null);
    try {
      const res = await fetch(`/api/restaurants/${restaurantId}/appearance`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ design, theme }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        if (res.status === 423) {
          // Edit window expired mid-session → re-lock and show the unlock flow.
          setUnlocked(false);
          return;
        }
        if (data.code === "photos_required" && Array.isArray(data.missing)) {
          setMissing(data.missing);
        } else {
          setError(data.error ?? "Eroare la salvare.");
        }
        return;
      }
      setSaved(true);
      router.refresh();
    } catch {
      setError("Eroare de rețea. Încearcă din nou.");
    } finally {
      setBusy(false);
    }
  }

  const activeDesign = getDesign(design);

  return (
    <div className="space-y-8">
      {error && (
        <div role="alert" className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg text-sm">
          ⚠️ {error}
        </div>
      )}

      {/* 2FA lock banner — same flow as the menu editor */}
      {locked && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-4">
          <p className="text-sm font-medium text-amber-900 mb-1">🔒 Schimbarea aspectului este blocată</p>
          <p className="text-xs text-amber-800 mb-3">
            Pentru siguranță, modificările necesită un cod trimis pe emailul tău. Codul deblochează
            editarea (meniu + aspect) pentru 30 de minute.
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

      {/* Missing-photos prompt (blocks a photos-required design) */}
      {missing && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-4">
          <p className="text-sm font-semibold text-amber-900 mb-1">
            Acest design necesită o fotografie pentru fiecare produs
          </p>
          <p className="text-xs text-amber-800 mb-2">
            Adaugă fotografii pentru produsele de mai jos în secțiunea <strong>Meniu</strong>, apoi revino
            și salvează.
          </p>
          <ul className="text-xs text-amber-900 list-disc pl-5 space-y-0.5 max-h-40 overflow-auto">
            {missing.map((name) => (
              <li key={name}>{name}</li>
            ))}
          </ul>
        </div>
      )}

      {/* Design picker */}
      <section>
        <h2 className="text-sm font-semibold text-gray-700 mb-3">Design</h2>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          {MENU_DESIGNS.map((d) => {
            const active = d.id === design;
            const preview = d.themes[0].tokens;
            return (
              <button
                key={d.id}
                onClick={() => pickDesign(d.id)}
                className={`text-left rounded-xl border-2 p-3 transition-colors ${
                  active ? "border-[#c84b1e] bg-[#c84b1e]/[0.03]" : "border-gray-200 hover:border-gray-300 bg-white"
                }`}
              >
                <DesignThumbnail designId={d.id} tokens={preview} />
                <div className="mt-2.5 flex items-center gap-2">
                  <span className="font-semibold text-sm text-gray-900">{d.label}</span>
                  {d.photosRequired && (
                    <span className="text-[10px] font-medium px-1.5 py-0.5 rounded bg-gray-100 text-gray-500">
                      cu foto
                    </span>
                  )}
                </div>
                <p className="text-xs text-gray-500 mt-0.5 leading-snug">{d.description}</p>
              </button>
            );
          })}
        </div>

        {activeDesign.photosRequired && missingPhotos > 0 && (
          <p className="text-xs text-amber-700 mt-2">
            {missingPhotos} din {totalItems} produse nu au fotografie. Adaugă-le înainte de a salva acest design.
          </p>
        )}
      </section>

      {/* Theme swatches for the chosen design */}
      <section>
        <h2 className="text-sm font-semibold text-gray-700 mb-3">Paletă de culori</h2>
        <div className="flex flex-wrap gap-3">
          {activeDesign.themes.map((t) => {
            const active = t.id === theme;
            return (
              <button
                key={t.id}
                onClick={() => pickTheme(t.id)}
                className={`flex items-center gap-2.5 rounded-xl border-2 px-3 py-2 transition-colors ${
                  active ? "border-[#c84b1e]" : "border-gray-200 hover:border-gray-300"
                }`}
              >
                <span className="flex -space-x-1">
                  <span className="w-6 h-6 rounded-full border border-white shadow-sm" style={{ background: t.tokens.brand }} />
                  <span className="w-6 h-6 rounded-full border border-white shadow-sm" style={{ background: t.tokens.paper }} />
                </span>
                <span className="text-sm font-medium text-gray-800">{t.label}</span>
              </button>
            );
          })}
        </div>
      </section>

      {/* Save */}
      <div className="flex items-center gap-3 pt-1">
        <button
          onClick={save}
          disabled={busy || !dirty || locked}
          className="bg-[#c84b1e] text-white text-sm font-semibold px-5 py-2.5 rounded-lg hover:bg-[#d9603a] transition-colors disabled:opacity-50"
        >
          {busy ? "Se salvează..." : "Salvează aspectul"}
        </button>
        {locked && dirty && (
          <span className="text-xs text-amber-700">Deblochează mai întâi cu codul de pe email.</span>
        )}
        {saved && !dirty && <span className="text-sm text-green-700 font-medium">✓ Aspect salvat</span>}
      </div>
    </div>
  );
}

/** Tiny abstract thumbnail hinting at each design's layout, tinted by its theme. */
function DesignThumbnail({ designId, tokens }: { designId: string; tokens: MenuThemeTokens }) {
  const bg = tokens.paper;
  const brand = tokens.brand;
  const line = tokens.border;
  return (
    <div className="h-24 rounded-lg overflow-hidden flex flex-col" style={{ background: bg }}>
      <div className="h-7 flex items-center justify-center flex-shrink-0" style={{ background: brand }}>
        <span className="w-8 h-1.5 rounded-full" style={{ background: tokens.brandContrast, opacity: 0.9 }} />
      </div>
      <div className="flex-1 p-2 space-y-1.5">
        {designId === "modern" &&
          [0, 1].map((i) => (
            <div key={i} className="flex gap-1.5 items-center">
              <span className="w-5 h-5 rounded" style={{ background: line }} />
              <span className="flex-1 h-1.5 rounded-full" style={{ background: line }} />
              <span className="w-4 h-1.5 rounded-full" style={{ background: brand }} />
            </div>
          ))}
        {designId === "elegant" &&
          [0, 1, 2].map((i) => (
            <div key={i} className="flex items-center gap-1">
              <span className="h-1.5 rounded-full" style={{ background: line, width: `${40 - i * 6}%` }} />
              <span className="flex-1 border-b border-dotted" style={{ borderColor: line }} />
              <span className="w-3 h-1.5 rounded-full" style={{ background: brand }} />
            </div>
          ))}
        {designId === "compact" &&
          [0, 1, 2, 3].map((i) => (
            <div key={i} className="flex items-center justify-between gap-1">
              <span className="h-1 rounded-full" style={{ background: line, width: `${55 - (i % 2) * 15}%` }} />
              <span className="w-3 h-1 rounded-full" style={{ background: brand }} />
            </div>
          ))}
      </div>
    </div>
  );
}
