import { auth } from "@/lib/auth";
import { NextResponse } from "next/server";

const ADMIN_PATHS = ["/admin"];
// Paths accessible to staff, moderator, and admin
const STAFF_PATHS = ["/admin/anunturi/nou-asistat"];
// Paths only admin can access
const ADMIN_ONLY_PATHS = ["/admin/utilizatori"];
const AUTH_PATHS = ["/profil", "/anunturi/nou"];

export default auth((req) => {
  const { pathname } = req.nextUrl;
  const session = req.auth;
  const role = (session?.user as any)?.role as string | undefined;

  const isAdminPath = ADMIN_PATHS.some((p) => pathname.startsWith(p));
  const isAuthPath = AUTH_PATHS.some((p) => pathname.startsWith(p));

  if (isAdminPath) {
    if (!session) {
      return NextResponse.redirect(new URL("/intra", req.url));
    }

    if (role === "staff") {
      // Staff: only assisted listing creation
      const isStaffAllowed = STAFF_PATHS.some((p) => pathname.startsWith(p));
      if (!isStaffAllowed && pathname !== "/admin") {
        return NextResponse.redirect(new URL("/admin/anunturi/nou-asistat", req.url));
      }
    } else if (role === "moderator") {
      // Moderator: all admin pages except admin-only paths
      const isAdminOnly = ADMIN_ONLY_PATHS.some((p) => pathname.startsWith(p));
      if (isAdminOnly) {
        return NextResponse.redirect(new URL("/admin", req.url));
      }
    } else if (role !== "admin") {
      // Regular user — no admin access
      return NextResponse.redirect(new URL("/", req.url));
    }
  }

  if (isAuthPath && !session) {
    return NextResponse.redirect(new URL("/intra", req.url));
  }

  return NextResponse.next();
});

export const config = {
  matcher: ["/admin/:path*", "/profil/:path*", "/anunturi/nou"],
};
