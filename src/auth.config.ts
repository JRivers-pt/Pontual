import type { NextAuthConfig } from "next-auth"

export const authConfig = {
    // Secret is required for NextAuth v5
    secret: process.env.AUTH_SECRET || process.env.NEXTAUTH_SECRET,
    // Use JWT sessions for better performance (no database lookup on every request)
    session: {
        strategy: "jwt",
        maxAge: 30 * 24 * 60 * 60, // 30 days
    },
    // Trust host for Vercel deployment
    trustHost: true,
    pages: {
        signIn: "/login",
    },
    callbacks: {
        authorized({ auth, request: { nextUrl } }) {
            const isLoggedIn = !!auth?.user
            const isOnDashboard = nextUrl.pathname === "/" || nextUrl.pathname.startsWith("/reports")
            const isOnLogin = nextUrl.pathname.startsWith("/login")

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
    },
    providers: [], // Providers added in auth.ts
} satisfies NextAuthConfig
