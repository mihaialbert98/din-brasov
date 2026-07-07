import { createUploadthing, type FileRouter } from "uploadthing/next";
import { auth } from "@/lib/auth";

const f = createUploadthing();

export const uploadRouter = {
  // Caps below are a safety net — images are compressed client-side (resized +
  // re-encoded to WebP) to a few hundred KB before upload, so they rarely apply.

  // For news cover images — admin/moderator only
  newsImage: f({ image: { maxFileSize: "8MB", maxFileCount: 1 } })
    .middleware(async () => {
      const session = await auth();
      const role = (session?.user as any)?.role as string | undefined;
      if (!session || (role !== "admin" && role !== "moderator")) {
        throw new Error("Neautorizat");
      }
      return { userId: session.user!.id! };
    })
    .onUploadComplete(async ({ metadata, file }) => {
      return { url: file.ufsUrl };
    }),

  // For marketplace listing images — any authenticated user
  listingImage: f({ image: { maxFileSize: "8MB", maxFileCount: 8 } })
    .middleware(async () => {
      const session = await auth();
      if (!session?.user?.id) throw new Error("Neautorizat");
      return { userId: session.user.id };
    })
    .onUploadComplete(async ({ metadata, file }) => {
      return { url: file.ufsUrl };
    }),

  // For event/place images — admin/moderator only
  eventImage: f({ image: { maxFileSize: "8MB", maxFileCount: 1 } })
    .middleware(async () => {
      const session = await auth();
      const role = (session?.user as any)?.role as string | undefined;
      if (!session || (role !== "admin" && role !== "moderator")) {
        throw new Error("Neautorizat");
      }
      return { userId: session.user!.id! };
    })
    .onUploadComplete(async ({ metadata, file }) => {
      return { url: file.ufsUrl };
    }),

  // For restaurant menu-item photos — any authenticated user. The per-restaurant
  // ownership check happens when the URL is saved (menu-item API verifies the
  // caller manages the target restaurant); a bare uploaded URL is harmless.
  menuItemImage: f({ image: { maxFileSize: "8MB", maxFileCount: 1 } })
    .middleware(async () => {
      const session = await auth();
      if (!session?.user?.id) throw new Error("Neautorizat");
      return { userId: session.user.id };
    })
    .onUploadComplete(async ({ metadata, file }) => {
      return { url: file.ufsUrl };
    }),
} satisfies FileRouter;

export type UploadRouter = typeof uploadRouter;
