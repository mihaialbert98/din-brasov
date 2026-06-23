import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import Google from "next-auth/providers/google";
import { DrizzleAdapter } from "@auth/drizzle-adapter";
import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import { eq } from "drizzle-orm";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { db } from "@/lib/db";
import * as schema from "@/lib/db/schema";
import { users, accounts, sessions, verificationTokens } from "@/lib/db/schema";
import { grantFoundingIfEligible } from "@/lib/permissions";
import { sendFoundingWelcomeEmail } from "@/lib/email";

// DrizzleAdapter needs a real client instance (not a Proxy) to detect the DB type
function makeAuthDb() {
  const sql = neon(process.env.DATABASE_URL!);
  return drizzle(sql, { schema });
}

const credentialsSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
});

// Google sign-in is optional — only enabled when both creds are configured.
export const googleAuthEnabled =
  !!process.env.AUTH_GOOGLE_ID && !!process.env.AUTH_GOOGLE_SECRET;

export const { handlers, auth, signIn, signOut } = NextAuth({
  adapter: DrizzleAdapter(makeAuthDb(), {
    usersTable: users,
    accountsTable: accounts,
    sessionsTable: sessions,
    verificationTokensTable: verificationTokens,
  } as any),
  session: { strategy: "jwt" },
  pages: {
    signIn: "/intra",
    error: "/intra",
  },
  providers: [
    ...(googleAuthEnabled
      ? [
          Google({
            clientId: process.env.AUTH_GOOGLE_ID!,
            clientSecret: process.env.AUTH_GOOGLE_SECRET!,
          }),
        ]
      : []),
    Credentials({
      async authorize(credentials) {
        const parsed = credentialsSchema.safeParse(credentials);
        if (!parsed.success) return null;

        const { email, password } = parsed.data;
        const [user] = await db
          .select()
          .from(users)
          .where(eq(users.email, email))
          .limit(1);

        if (!user || !user.password) return null;
        if (user.deletedAt) return null;

        const valid = await bcrypt.compare(password, user.password);
        if (!valid) return null;

        // Block login until the account's email is confirmed (Google accounts
        // are pre-verified by the OAuth flow, so they set emailVerified directly).
        if (!user.emailVerified) {
          throw new Error("Contul tău nu a fost confirmat. Verifică email-ul și apasă pe linkul de confirmare.");
        }

        if (user.bannedUntil && user.bannedUntil > new Date()) {
          const until = user.bannedUntil.toLocaleDateString("ro-RO");
          throw new Error(`Contul tău este suspendat până la ${until}. Poți contesta prin Mesaje > Suport.`);
        }

        return {
          id: user.id,
          email: user.email,
          name: user.name,
          image: user.image,
          role: user.role,
          bannedUntil: user.bannedUntil ?? null,
        };
      },
    }),
  ],
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        token.id = user.id;
        token.role = (user as any).role ?? "user";
      }
      if (token.id && !user) {
        const [dbUser] = await db
          .select({ role: users.role, deletedAt: users.deletedAt, bannedUntil: users.bannedUntil })
          .from(users)
          .where(eq(users.id, token.id as string))
          .limit(1);
        if (dbUser) {
          token.role = dbUser.role;
          token.bannedUntil = dbUser.bannedUntil?.toISOString() ?? null;
          if (dbUser.deletedAt) return {};
        }
      }
      return token;
    },
    async session({ session, token }) {
      if (token) {
        session.user.id = token.id as string;
        (session.user as any).role = token.role as string;
      }
      return session;
    },
  },
  events: {
    // Fires once when the adapter creates a new user — i.e. OAuth (Google) signups.
    // Credentials signups are inserted by our register route (not the adapter), so
    // they're handled there. This gives Google users the same founding-member grant
    // and, since they receive no confirmation email, a VIP welcome email.
    async createUser({ user }) {
      if (!user.id) return;
      try {
        const granted = await grantFoundingIfEligible(user.id);
        if (granted && user.email) {
          await sendFoundingWelcomeEmail(user.email, user.name ?? "").catch(() => {});
        }
      } catch {
        // Never block sign-up if the grant/email fails.
      }
    },
  },
});

export type UserRole = "user" | "staff" | "moderator" | "admin";
