import type { Metadata } from "next";

// The scanned-menu surface is a standalone mobile view — no site navbar/footer.
// noindex: the menu is reachable only via an unguessable per-table QR token.
export const metadata: Metadata = {
  robots: { index: false, follow: false },
};

export default function MenuLayout({ children }: { children: React.ReactNode }) {
  // Background is driven by the .menu-theme token on the page root.
  return <div className="min-h-screen">{children}</div>;
}
