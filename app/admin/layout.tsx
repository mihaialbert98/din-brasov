import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import Link from "next/link";

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const session = await auth();
  const role = (session?.user as any)?.role;

  if (!session || (role !== "admin" && role !== "moderator" && role !== "staff")) {
    redirect("/intra");
  }

  const adminNav = [
    { href: "/admin", label: "Dashboard" },
    { href: "/admin/stiri", label: "Știri" },
    { href: "/admin/evenimente", label: "Evenimente" },
    { href: "/admin/experiente", label: "Experiențe" },
    { href: "/admin/localuri", label: "Localuri" },
    { href: "/admin/anunturi", label: "Anunțuri" },
    { href: "/admin/anunturi/nou-asistat", label: "Anunț Asistat" },
    { href: "/admin/suport", label: "Suport" },
    { href: "/admin/newsletter", label: "Newsletter" },
    { href: "/admin/utilizatori", label: "Utilizatori" },
  ];

  const moderatorNav = [
    { href: "/admin", label: "Dashboard" },
    { href: "/admin/stiri", label: "Știri" },
    { href: "/admin/evenimente", label: "Evenimente" },
    { href: "/admin/experiente", label: "Experiențe" },
    { href: "/admin/localuri", label: "Localuri" },
    { href: "/admin/anunturi", label: "Anunțuri" },
    { href: "/admin/anunturi/nou-asistat", label: "Anunț Asistat" },
    { href: "/admin/suport", label: "Suport" },
    { href: "/admin/newsletter", label: "Newsletter" },
    { href: "/admin/utilizatori", label: "Utilizatori" },
  ];

  const staffNav = [
    { href: "/admin/anunturi/nou-asistat", label: "Anunț Asistat" },
  ];

  const navItems =
    role === "admin" ? adminNav :
    role === "moderator" ? moderatorNav :
    staffNav;

  const roleLabel =
    role === "admin" ? "Administrator" :
    role === "moderator" ? "Moderator" :
    "Asistent";

  return (
    <div className="flex min-h-screen bg-gray-100">
      <aside className="w-56 bg-[#1a1a1a] text-white flex-shrink-0 flex flex-col">
        <div className="p-5 border-b border-white/10">
          <Link href="/" className="font-bold text-lg">
            Din <span className="text-[#c84b1e]">Brașov</span>
          </Link>
          <p className="text-xs text-gray-400 mt-0.5">Admin Panel</p>
        </div>
        <nav className="flex-1 p-4 space-y-1">
          {navItems.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className="block px-3 py-2.5 rounded-lg hover:bg-white/10 transition-colors text-sm font-medium"
            >
              {item.label}
            </Link>
          ))}
        </nav>
        <div className="p-4 border-t border-white/10 text-xs text-gray-400">
          <p className="font-medium text-white truncate">{session.user?.name}</p>
          <p className="text-gray-400">{roleLabel}</p>
        </div>
      </aside>
      <main className="flex-1 p-8 overflow-auto">{children}</main>
    </div>
  );
}
