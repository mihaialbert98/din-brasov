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

// DrizzleAdapter needs a real client instance (not a Proxy) to detect the DB type
function makeAuthDb() {
  const sql = neon(process.env.DATABASE_URL!);
  return drizzle(sql, { schema });
}

const credentialsSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
});

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
    Google({
      clientId: process.env.AUTH_GOOGLE_ID!,
      clientSecret: process.env.AUTH_GOOGLE_SECRET!,
    }),
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
});

export type UserRole = "user" | "staff" | "moderator" | "admin";
