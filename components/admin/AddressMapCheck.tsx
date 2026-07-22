"use client";

import { MapPin } from "lucide-react";
import { mapsUrl } from "@/lib/maps";

/**
 * A small live "check this address on Google Maps" link for admin create/edit
 * forms. Lets the editor confirm a typed address resolves to the right spot
 * before saving. Purely a preview — it doesn't store coordinates. Shows nothing
 * until there's an address to search.
 */
export default function AddressMapCheck({ address, name }: { address: string; name?: string }) {
  const href = mapsUrl({ address, name });
  if (!href) return null;
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="inline-flex items-center gap-1 text-xs text-[#c84b1e] hover:underline mt-0.5 self-start"
      title="Deschide în Google Maps ca să verifici adresa"
    >
      <MapPin className="w-3.5 h-3.5" aria-hidden /> Verifică pe hartă ↗
    </a>
  );
}
