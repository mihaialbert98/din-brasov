"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Menu, X } from "lucide-react";
import NavBadge from "@/components/restaurant/NavBadge";

type NavItem = { href: string; label: string; badge?: "service" | "reservations" };

type Props = {
  navItems: NavItem[];
  apiBase: string;
  restaurantName: string;
  userName: string;
  roleLabel: string;
  children: React.ReactNode;
};

/**
 * Responsive restaurant dashboard shell. On desktop (lg+) the sidebar is a static
 * column; on mobile it collapses into a slide-in drawer toggled by a hamburger in
 * a sticky top bar, so the content area gets the full viewport width. Mirrors the
 * admin shell. Auth lives in the server layout — this only owns the chrome + nav.
 */
export default function RestaurantShell({ navItems, apiBase, restaurantName, userName, roleLabel, children }: Props) {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();

  // Close the drawer whenever the route changes (a nav link was tapped).
  useEffect(() => {
    setOpen(false);
  }, [pathname]);

  // Lock body scroll + close on Escape while the mobile drawer is open.
  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = prev;
      window.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const sidebarInner = (
    <>
      <div className="p-5 border-b border-white/10 flex items-start justify-between gap-2">
        <div className="min-w-0">
          <Link href="/" className="font-bold text-lg">
            Din <span className="text-[#c84b1e]">Brașov</span>
          </Link>
          <p className="text-xs text-gray-400 mt-0.5 truncate">{restaurantName}</p>
        </div>
        {/* Close button — only relevant inside the mobile drawer. */}
        <button
          onClick={() => setOpen(false)}
          className="lg:hidden p-1.5 -mr-1.5 rounded-lg hover:bg-white/10 transition-colors flex-shrink-0"
          aria-label="Închide meniul"
        >
          <X className="w-5 h-5" aria-hidden />
        </button>
      </div>
      <nav className="flex-1 p-4 space-y-1 overflow-y-auto">
        {navItems.map((item) => (
          <Link
            key={item.href}
            href={item.href}
            className="flex items-center justify-between gap-2 px-3 py-2.5 rounded-lg hover:bg-white/10 transition-colors text-sm font-medium"
          >
            <span>{item.label}</span>
            {item.badge && <NavBadge basePath={apiBase} kind={item.badge} boardPath={item.href} />}
          </Link>
        ))}
      </nav>
      <div className="p-4 border-t border-white/10 text-xs text-gray-400">
        <p className="font-medium text-white truncate">{userName}</p>
        <p className="text-gray-400">{roleLabel}</p>
      </div>
    </>
  );

  return (
    <div className="flex min-h-screen bg-gray-100">
      {/* Desktop sidebar — static column. */}
      <aside className="hidden lg:flex w-56 bg-[#1a1a1a] text-white flex-shrink-0 flex-col">
        {sidebarInner}
      </aside>

      {/* Mobile drawer + scrim. */}
      {open && (
        <div className="lg:hidden fixed inset-0 z-40 bg-black/60" onClick={() => setOpen(false)} aria-hidden />
      )}
      <aside
        className={`lg:hidden fixed inset-y-0 left-0 z-50 w-64 max-w-[80%] bg-[#1a1a1a] text-white flex flex-col shadow-2xl transition-transform duration-200 ease-out ${
          open ? "translate-x-0" : "-translate-x-full"
        }`}
        aria-hidden={!open}
      >
        {sidebarInner}
      </aside>

      <div className="flex-1 flex flex-col min-w-0">
        {/* Mobile top bar with the hamburger. */}
        <header className="lg:hidden sticky top-0 z-30 flex items-center gap-3 bg-[#1a1a1a] text-white px-4 h-14 shadow-md">
          <button
            onClick={() => setOpen(true)}
            className="p-2 -ml-2 rounded-lg hover:bg-white/10 transition-colors"
            aria-label="Deschide meniul"
            aria-expanded={open}
          >
            <Menu className="w-6 h-6" aria-hidden />
          </button>
          <span className="font-bold truncate">
            Din <span className="text-[#c84b1e]">Brașov</span>
            <span className="text-gray-400 font-normal text-sm"> · {restaurantName}</span>
          </span>
        </header>

        <main className="flex-1 p-4 sm:p-6 lg:p-8 overflow-x-hidden overflow-y-auto">{children}</main>
      </div>
    </div>
  );
}
