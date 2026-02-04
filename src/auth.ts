import NextAuth from "next-auth"
import Credentials from "next-auth/providers/credentials"
import { z } from "zod"
import { prisma } from "@/lib/db"
import bcrypt from "bcryptjs"
import { authConfig } from "./auth.config"

export const { handlers, signIn, signOut, auth } = NextAuth({
    ...authConfig,
    providers: [
        Credentials({
            name: "Credentials",
            credentials: {
                username: { label: "Username", type: "text" },
                password: { label: "Password", type: "password" },
            },
            authorize: async (credentials) => {
                const parsedCredentials = z
                    .object({ username: z.string().min(1), password: z.string().min(1) })
                    .safeParse(credentials);

                if (!parsedCredentials.success) return null;

                const { username, password } = parsedCredentials.data;

                const user = await prisma.user.findUnique({
                    where: { username }
                });

                if (!user) return null;

                const passwordMatch = await bcrypt.compare(password, user.password);

                if (passwordMatch) {
                    return {
                        id: user.id,
                        name: user.name,
                        email: user.email
                    };
                }

                return null;
            },
        }),
    ],
    // Remove pages and callbacks from here as they are in auth.config or spread from it
    // We only need to override/extend specific callbacks if they need Node.js APIs (like DB)
    callbacks: {
        ...authConfig.callbacks,
        session: async ({ session, token }) => {
            if (token.sub && session.user) {
                session.user.id = token.sub;
            }
            return session;
        }
    },
})
