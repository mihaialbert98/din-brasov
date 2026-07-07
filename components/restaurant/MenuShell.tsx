"use client";

import { useState } from "react";
import MenuView, { type MenuLang, type MenuViewCategory } from "@/components/restaurant/MenuView";
import ServiceButtons from "@/components/restaurant/ServiceButtons";
import type { MenuDesignId } from "@/lib/menu-themes";

/**
 * Client shell for the scanned menu — owns the RO/EN language state so both the
 * menu content and the service buttons switch together.
 */
export default function MenuShell({
  token,
  tableActive,
  design,
  restaurantName,
  tableLabel,
  logoUrl,
  coverUrl,
  categories,
  showAccountCta = false,
}: {
  token: string;
  tableActive: boolean;
  design: MenuDesignId;
  restaurantName: string;
  tableLabel: string;
  logoUrl: string | null;
  coverUrl?: string | null;
  categories: MenuViewCategory[];
  showAccountCta?: boolean;
}) {
  const [lang, setLang] = useState<MenuLang>("ro");

  return (
    <>
      <MenuView
        design={design}
        restaurantName={restaurantName}
        tableLabel={tableLabel}
        logoUrl={logoUrl}
        coverUrl={coverUrl}
        categories={categories}
        lang={lang}
        onLangChange={setLang}
        showAccountCta={showAccountCta}
      />
      <ServiceButtons token={token} disabled={!tableActive} lang={lang} showAccountCta={showAccountCta} />
    </>
  );
}
