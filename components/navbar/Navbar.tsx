import Link from "next/link";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { conversations, messages } from "@/lib/db/schema";
import { eq, or, and, ne, isNull } from "drizzle-orm";
import MobileMenu from "./MobileMenu";

async function getUnreadCount(userId: string): Promise<number> {
  try {
    const userConvs = await db
      .select({ id: conversations.id, buyerId: conversations.buyerId, sellerId: conversations.sellerId })
      .from(conversations)
      .where(or(eq(conversations.buyerId, userId), eq(conversations.sellerId, userId)));

    let unread = 0;
    for (const conv of userConvs) {
      const msgs = await db
        .select({ id: messages.id })
        .from(messages)
        .where(
          and(
            eq(messages.conversationId, conv.id),
            ne(messages.senderId, userId),
            eq(messages.status, "delivered"),
            isNull(messages.readAt)
          )
        );
      unread += msgs.length;
    }
    return unread;
  } catch {
    return 0;
  }
}

export async function Navbar() {
  const session = await auth();
  const role = (session?.user as any)?.role as string | undefined;
  const isStaff = role === "admin" || role === "moderator" || role === "staff";
  const unreadCount = session?.user?.id ? await getUnreadCount(session.user.id) : 0;

  const navItems = [
    { href: "/stiri", label: "Știri" },
    { href: "/evenimente", label: "Evenimente" },
    { href: "/experiente", label: "Experiențe" },
    { href: "/localuri", label: "Localuri" },
    { href: "/anunturi", label: "Anunțuri" },
  ];

  return (
    <header className="bg-[#1a1a1a] text-white sticky top-0 z-50 shadow-md relative">
      <div className="max-w-5xl mx-auto px-4 h-16 flex items-center justify-between">
        {/* Logo + wordmark */}
        <Link
          href="/"
          className="flex items-center gap-3 hover:opacity-90 transition-opacity"
          aria-label="Din Brașov — pagina principală"
        >
          <span className="block w-10 h-10 rounded-full overflow-hidden flex-shrink-0">
            <img
              src="/logo.png"
              alt="Din Brașov"
              width={40}
              height={40}
              className="w-full h-full object-cover"
            />
          </span>
          <span className="font-bold text-xl tracking-tight">
            Din <span className="text-[#c84b1e]">Brașov</span>
          </span>
        </Link>

        {/* Desktop nav */}
        <nav className="hidden md:flex items-center gap-1" aria-label="Navigare principală">
          {navItems.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className="px-4 py-2 rounded-lg hover:bg-white/10 transition-colors font-medium text-sm"
            >
              {item.label}
            </Link>
          ))}
        </nav>

        <div className="flex items-center gap-2">
          {/* Mobile hamburger */}
          <MobileMenu
            items={navItems}
            isStaff={isStaff}
            role={role}
            userName={session?.user?.name ?? undefined}
            isLoggedIn={!!session}
            unreadCount={unreadCount}
          />
          {session ? (
            <>
              {/* Inbox with unread badge */}
              <Link
                href="/mesaje"
                className="relative text-sm font-medium hover:bg-white/10 p-2 rounded-lg transition-colors"
                aria-label={`Mesaje${unreadCount > 0 ? ` (${unreadCount} necitite)` : ""}`}
              >
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-5 h-5" aria-hidden="true">
                  <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
                </svg>
                {unreadCount > 0 && (
                  <span className="absolute -top-0.5 -right-0.5 bg-[#c84b1e] text-white text-xs font-bold w-4 h-4 rounded-full flex items-center justify-center leading-none">
                    {unreadCount > 9 ? "9+" : unreadCount}
                  </span>
                )}
              </Link>
              {isStaff && (
                <Link
                  href="/admin"
                  className="text-sm font-medium bg-[#c84b1e] hover:bg-[#d9603a] px-3 py-2 rounded-lg transition-colors"
                  aria-label="Panou de administrare"
                >
                  {role === "admin" ? "Admin" : role === "moderator" ? "Moderator" : "Asistent"}
                </Link>
              )}
              <Link
                href="/profil"
                className="text-sm font-medium bg-white/10 hover:bg-white/20 px-4 py-2 rounded-lg transition-colors"
              >
                {session.user?.name ?? "Profil"}
              </Link>
            </>
          ) : (
            <Link
              href="/intra"
              className="text-sm font-medium border border-[#6bb5d4] text-[#6bb5d4] hover:bg-[#6bb5d4] hover:text-[#1a1a1a] px-4 py-2 rounded-lg transition-colors"
            >
              Intră în cont
            </Link>
          )}
        </div>
      </div>
    </header>
  );
}
