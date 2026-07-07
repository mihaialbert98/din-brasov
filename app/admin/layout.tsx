import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import AdminShell from "@/components/admin/AdminShell";

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
    { href: "/admin/restaurante", label: "Restaurante" },
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
    { href: "/admin/restaurante", label: "Restaurante" },
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
    <AdminShell
      navItems={navItems}
      userName={session.user?.name ?? "Cont"}
      roleLabel={roleLabel}
    >
      {children}
    </AdminShell>
  );
}
