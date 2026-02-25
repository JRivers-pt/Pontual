import type { NextAuthConfig } from "next-auth"

export const authConfig = {
    // Secret is required for NextAuth v5
    secret: process.env.AUTH_SECRET || process.env.NEXTAUTH_SECRET,
    // Use JWT sessions for better performance (no database lookup on every request)
    session: {
        strategy: "jwt",
        maxAge: 8 * 60 * 60, // 8 hours — expires at end of working day
    },
    // Override cookie config to make it a session cookie (expires on window close)
    cookies: {
        sessionToken: {
            name: `__Secure-next-auth.session-token`,
            options: {
                httpOnly: true,
                sameSite: 'lax' as const,
                path: '/',
                secure: process.env.NODE_ENV === 'production',
                maxAge: 8 * 60 * 60, // 8 hours — session expires after a working day
            }
        }
    },
    // Trust host for Vercel deployment
    trustHost: true,
    pages: {
        signIn: "/login",
    },
    callbacks: {
        authorized({ auth, request: { nextUrl } }) {
            const isLoggedIn = !!auth?.user
            const userRole = (auth?.user as any)?.role
            const isOnDashboard = nextUrl.pathname === "/" || nextUrl.pathname.startsWith("/reports")
            const isOnAdmin = nextUrl.pathname.startsWith("/admin")
            const isOnLogin = nextUrl.pathname.startsWith("/login")

            if (isOnAdmin) {
                if (isLoggedIn && userRole === "ADMIN") return true
                return Response.redirect(new URL("/", nextUrl)) // Redirect non-admins to dashboard
            }

            if (isOnDashboard) {
                if (isLoggedIn) return true
                return false // Redirect unauthenticated users to login page
            } else if (isOnLogin) {
                if (isLoggedIn) {
                    return Response.redirect(new URL("/", nextUrl))
                }
                return true
            }
            return true
        },
        jwt: async ({ token, user }) => {
            // Store user data in token on sign in
            if (user) {
                token.sub = user.id;
                token.company = (user as any).company ?? null;
                token.role = (user as any).role ?? 'CLIENT';
            }
            return token;
        },
        session: async ({ session, token }) => {
            // Add user data to session from token
            if (token.sub && session.user) {
                session.user.id = token.sub;
                (session.user as any).company = token.company ?? null;
                (session.user as any).role = token.role ?? 'CLIENT';
            }
            return session;
        }
    },
    providers: [], // Providers added in auth.ts
} satisfies NextAuthConfig
