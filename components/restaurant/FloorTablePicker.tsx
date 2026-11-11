"use client";

import { useEffect, useState } from "react";
import { ChevronDown, LayoutGrid } from "lucide-react";

type Section = { id: string; label: string };
type TableStatus = {
  id: string;
  label: string;
  sectionId: string | null;
  isActive: boolean;
  busy: { reservationId: string; guestName: string; from: string; to: string } | null;
};

/**
 * Optional table picker for a booking („Plan de sală”).
 *
 * Shows the room for the booking's own window: a table already held by an overlapping
 * booking is disabled and labelled with who has it and until when, so the reason is on
 * screen rather than in an error after saving. There is no override — two bookings on one
 * table is never what staff meant, and leaving the booking with no table is always fine.
 *
 * Choosing nothing is the normal state. This never nags: no red, no "required", no
 * placeholder chip when empty.
 */
export default function FloorTablePicker({
  basePath,
  date,
  time,
  partySize,
  exclude,
  value,
  onChange,
  disabled,
  collapsible = false,
}: {
  basePath: string;
  date: string;
  time: string;
  partySize: number;
  /** Editing an existing booking: it must not count as occupying its own tables. */
  exclude?: string;
  value: string[];
  onChange: (ids: string[]) => void;
  disabled?: boolean;
  /** Sections fold into one-line headers, all collapsed to start — for the add/edit
   *  forms, where a whole room of tables would push the guest fields off-screen. */
  collapsible?: boolean;
}) {
  const [sections, setSections] = useState<Section[]>([]);
  // Sections the user has opened. Starts empty = everything collapsed.
  const [open, setOpen] = useState<Set<string>>(() => new Set());
  const [tables, setTables] = useState<TableStatus[]>([]);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    // Mid-typing (party size cleared, time half-entered): skip the fetch and keep showing
    // the room as last loaded. Blanking it would make the picker flicker on every keystroke.
    if (!date || !time || partySize < 1) return;
    let cancelled = false;
    const t = setTimeout(() => {
      const q = new URLSearchParams({ date, time, partySize: String(partySize) });
      if (exclude) q.set("exclude", exclude);
      fetch(`${basePath}/reservations/floor-tables?${q}`, { cache: "no-store" })
        .then((r) => (r.ok ? r.json() : null))
        .then((d) => {
          if (cancelled || !d) return;
          setSections(d.sections ?? []);
          setTables(d.tables ?? []);
          setLoaded(true);
        })
        .catch(() => { /* the save path re-validates anyway */ });
    }, 300); // debounce while the date/time/party fields are being typed into
    return () => { cancelled = true; clearTimeout(t); };
  }, [basePath, date, time, partySize, exclude]);

  // A table that was picked and has since become busy (someone else took it on another
  // device) must stay visible as selected, so the conflict is obvious before saving.
  const usable = tables.filter((t) => t.isActive || value.includes(t.id));
  if (!loaded || usable.length === 0) return null;

  const buckets = [
    ...sections.map((s) => ({ id: s.id, label: s.label, tables: usable.filter((t) => t.sectionId === s.id) })),
    { id: "__none__", label: "Fără secțiune", tables: usable.filter((t) => !t.sectionId) },
  ].filter((b) => b.tables.length > 0);

  const toggle = (id: string) => {
    onChange(value.includes(id) ? value.filter((v) => v !== id) : [...value, id]);
  };
  const toggleSection = (id: string) =>
    setOpen((prev) => {
      const n = new Set(prev);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });

  // Folding a lone section would only add a tap, so it needs at least two.
  const folding = collapsible && buckets.length > 1;

  return (
    <div className="mb-3 border border-gray-200 rounded-lg px-3 py-2.5">
      <div className="flex items-center gap-1.5 mb-2">
        <LayoutGrid className="w-3.5 h-3.5 text-gray-400 flex-shrink-0" aria-hidden />
        <span className="text-xs font-medium text-gray-500">Masa (opțional)</span>
        {value.length > 0 && (
          <button
            type="button"
            onClick={() => onChange([])}
            disabled={disabled}
            className="ml-auto text-xs text-gray-400 hover:text-gray-700 disabled:opacity-50"
          >
            Renunță la mese
          </button>
        )}
      </div>

      <div className={folding ? "divide-y divide-gray-100" : "space-y-2"}>
        {buckets.map((b) => {
          const picked = b.tables.filter((t) => value.includes(t.id));
          const free = b.tables.filter((t) => t.isActive && !t.busy).length;
          // A picked table that has since been taken by someone else forces its section
          // open: a collapsed header must never hide a clash that has to be resolved.
          const clash = picked.some((t) => t.busy);
          const expanded = !folding || clash || open.has(b.id);
          const panelId = `floor-section-${b.id}`;
          return (
          <div key={b.id}>
            {folding ? (
              <button
                type="button"
                onClick={() => toggleSection(b.id)}
                disabled={clash}
                aria-expanded={expanded}
                aria-controls={panelId}
                className="w-full min-h-[44px] flex items-center gap-2 text-left rounded-lg px-2 -mx-2 hover:bg-gray-50 disabled:hover:bg-transparent"
              >
                <ChevronDown className={`w-4 h-4 text-gray-400 flex-shrink-0 transition-transform ${expanded ? "" : "-rotate-90"}`} aria-hidden />
                <span className="text-xs uppercase tracking-wide text-gray-500 font-medium">{b.label}</span>
                <span className="text-xs text-gray-400 tabular-nums">{free}/{b.tables.length} libere</span>
                {/* What's chosen stays visible while the section is folded. */}
                {picked.length > 0 && (
                  <span className="ml-auto text-xs font-medium text-[#c84b1e] truncate">
                    {picked.map((t) => t.label).join(", ")}
                  </span>
                )}
              </button>
            ) : (
              <p className="text-[11px] uppercase tracking-wide text-gray-400 mb-1">{b.label}</p>
            )}
            {expanded && (
            <div id={panelId} className={`flex flex-wrap gap-1.5 ${folding ? "pb-1.5" : ""}`}>
              {b.tables.map((t) => {
                const selected = value.includes(t.id);
                // Busy always wins visually, even when selected, so a clash that appeared
                // after picking can't be missed.
                const busy = !!t.busy && !selected;
                const title = t.busy
                  ? `Ocupată de ${t.busy.guestName}, ${t.busy.from}–${t.busy.to}`
                  : !t.isActive
                  ? "Masă scoasă din uz"
                  : undefined;
                return (
                  <button
                    key={t.id}
                    type="button"
                    onClick={() => toggle(t.id)}
                    disabled={disabled || busy}
                    title={title}
                    className={`text-xs px-2.5 py-1.5 rounded-lg border transition-colors ${
                      selected
                        ? "bg-[#c84b1e] border-[#c84b1e] text-white font-medium"
                        : busy
                        ? "bg-gray-50 border-gray-200 text-gray-400 cursor-not-allowed"
                        : "bg-white border-gray-300 text-gray-700 hover:border-gray-400"
                    }`}
                  >
                    {t.label}
                    {t.busy && (
                      <span className={`block text-[10px] font-normal ${selected ? "text-white/80" : "text-gray-400"}`}>
                        {t.busy.guestName} · {t.busy.from}–{t.busy.to}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
            )}
          </div>
          );
        })}
      </div>
    </div>
  );
}
