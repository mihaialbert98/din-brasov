import { createUploadthing, type FileRouter } from "uploadthing/next";
import { auth } from "@/lib/auth";

const f = createUploadthing();

export const uploadRouter = {
  // For news cover images — admin/moderator only
  newsImage: f({ image: { maxFileSize: "4MB", maxFileCount: 1 } })
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
  listingImage: f({ image: { maxFileSize: "4MB", maxFileCount: 8 } })
    .middleware(async () => {
      const session = await auth();
      if (!session?.user?.id) throw new Error("Neautorizat");
      return { userId: session.user.id };
    })
    .onUploadComplete(async ({ metadata, file }) => {
      return { url: file.ufsUrl };
    }),

  // For event/place images — admin/moderator only
  eventImage: f({ image: { maxFileSize: "4MB", maxFileCount: 1 } })
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
} satisfies FileRouter;

export type UploadRouter = typeof uploadRouter;
