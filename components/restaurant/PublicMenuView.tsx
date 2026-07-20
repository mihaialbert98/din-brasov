"use client";

import { useState } from "react";
import MenuView, { type MenuLang, type MenuViewCategory } from "@/components/restaurant/MenuView";
import type { MenuDesignId } from "@/lib/menu-themes";

/**
 * Public read-only menu shell — like MenuShell but WITHOUT the service buttons
 * (call waiter / bill). Used on the browse-before-you-visit menu reached from
 * Localuri (`/restaurant/[slug]/meniu`). Owns the RO/EN language state.
 */
export default function PublicMenuView({
  design,
  restaurantName,
  logoUrl,
  coverUrl,
  categories,
}: {
  design: MenuDesignId;
  restaurantName: string;
  logoUrl: string | null;
  coverUrl?: string | null;
  categories: MenuViewCategory[];
}) {
  const [lang, setLang] = useState<MenuLang>("ro");

  return (
    <MenuView
      design={design}
      restaurantName={restaurantName}
      tableLabel=""
      logoUrl={logoUrl}
      coverUrl={coverUrl}
      categories={categories}
      lang={lang}
      onLangChange={setLang}
      showAccountCta={false}
      // Sits under the sticky site Navbar (h-16 = 64px) on the public web menu.
      stickyTop={64}
    />
  );
}
