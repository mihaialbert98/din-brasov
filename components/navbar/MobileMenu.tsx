"use client";

import { useState } from "react";
import Link from "next/link";

type NavItem = { href: string; label: string };

type Props = {
  items: NavItem[];
  isStaff: boolean;
  role: string | undefined;
  userName: string | undefined;
  isLoggedIn: boolean;
  unreadCount: number;
};

export default function MobileMenu({ items, isStaff, role, userName, isLoggedIn, unreadCount }: Props) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        onClick={() => setOpen((v) => !v)}
        className="md:hidden p-2 rounded-lg hover:bg-white/10 transition-colors"
        aria-label={open ? "Închide meniu" : "Deschide meniu"}
        aria-expanded={open}
      >
        {open ? (
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-6 h-6" aria-hidden>
            <line x1="18" y1="6" x2="6" y2="18" />
            <line x1="6" y1="6" x2="18" y2="18" />
          </svg>
        ) : (
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-6 h-6" aria-hidden>
            <line x1="3" y1="6" x2="21" y2="6" />
            <line x1="3" y1="12" x2="21" y2="12" />
            <line x1="3" y1="18" x2="21" y2="18" />
          </svg>
        )}
      </button>

      {open && (
        <div className="md:hidden absolute top-16 left-0 right-0 bg-[#1a1a1a] border-t border-white/10 shadow-xl z-50 px-4 py-4 flex flex-col gap-1">
          {items.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              onClick={() => setOpen(false)}
              className="px-4 py-3 rounded-lg hover:bg-white/10 transition-colors font-medium text-base text-white"
            >
              {item.label}
            </Link>
          ))}
          <div className="border-t border-white/10 mt-3 pt-3 flex flex-col gap-1">
            {isLoggedIn ? (
              <>
                <Link
                  href="/mesaje"
                  onClick={() => setOpen(false)}
                  className="flex items-center gap-2 px-4 py-3 rounded-lg hover:bg-white/10 transition-colors font-medium text-base text-white"
                >
                  Mesaje
                  {unreadCount > 0 && (
                    <span className="bg-[#c84b1e] text-white text-xs font-bold px-1.5 py-0.5 rounded-full leading-none">
                      {unreadCount > 9 ? "9+" : unreadCount}
                    </span>
                  )}
                </Link>
                {isStaff && (
                  <Link
                    href="/admin"
                    onClick={() => setOpen(false)}
                    className="px-4 py-3 rounded-lg bg-[#c84b1e] hover:bg-[#d9603a] transition-colors font-medium text-base text-white"
                  >
                    {role === "admin" ? "Admin" : role === "moderator" ? "Moderator" : "Asistent"}
                  </Link>
                )}
                <Link
                  href="/profil"
                  onClick={() => setOpen(false)}
                  className="px-4 py-3 rounded-lg hover:bg-white/10 transition-colors font-medium text-base text-white"
                >
                  {userName ?? "Profil"}
                </Link>
              </>
            ) : (
              <Link
                href="/intra"
                onClick={() => setOpen(false)}
                className="px-4 py-3 rounded-lg border border-[#6bb5d4] text-[#6bb5d4] hover:bg-[#6bb5d4] hover:text-[#1a1a1a] transition-colors font-medium text-base text-center"
              >
                Intră în cont
              </Link>
            )}
          </div>
        </div>
      )}
    </>
  );
}
