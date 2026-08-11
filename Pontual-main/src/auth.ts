import NextAuth from "next-auth"
import Credentials from "next-auth/providers/credentials"
import { z } from "zod"
import { prisma } from "@/lib/db"
import bcrypt from "bcryptjs"
import { authConfig } from "./auth.config"

export const { handlers, signIn, signOut, auth } = NextAuth({
    ...authConfig,
    secret: process.env.AUTH_SECRET || process.env.NEXTAUTH_SECRET,
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

                // We use findFirst with mode 'insensitive' to ignore casing during the DB lookup
                let user = await prisma.user.findFirst({
                    where: {
                        username: {
                            equals: username,
                            mode: 'insensitive'
                        }
                    }
                });

                // Auto-create admin user on first-ever login (empty database)
                if (!user) {
                    const adminUser = process.env.ADMIN_USERNAME;
                    const adminPass = process.env.ADMIN_PASSWORD;

                    // Case-insensitive check for adminUser
                    if (adminUser && adminPass &&
                        username.toLowerCase() === adminUser.toLowerCase() &&
                        password === adminPass) {

                        const userCount = await prisma.user.count();
                        if (userCount === 0) {
                            const hashedPassword = await bcrypt.hash(adminPass, 8);
                            user = await prisma.user.create({
                                data: {
                                    // Use the exact configured admin username casing
                                    username: adminUser,
                                    password: hashedPassword,
                                    name: "Admin",
                                    role: "ADMIN",
                                }
                            });
                        }
                    }
                }

                if (!user) return null;

                const passwordMatch = await bcrypt.compare(password, user.password);

                if (passwordMatch) {
                    return {
                        id: user.id,
                        name: user.name,
                        email: user.email,
                        company: user.company,
                        role: user.role,
                    };
                }

                return null;
            },
        }),
    ],
})
