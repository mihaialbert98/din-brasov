import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { requestUserDeletion } from "@/lib/gdpr";
import { sendAccountDeletionConfirmationEmail } from "@/lib/email";

export async function DELETE() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Neautorizat" }, { status: 401 });
  }

  await requestUserDeletion(session.user.id);

  if (session.user.email) {
    await sendAccountDeletionConfirmationEmail(session.user.email).catch(() => {});
  }

  return NextResponse.json({ ok: true });
}
