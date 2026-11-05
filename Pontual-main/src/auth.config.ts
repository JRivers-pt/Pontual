import type { NextAuthConfig } from "next-auth"

export const authConfig = {
    // Secret is required for NextAuth v5
    secret: process.env.AUTH_SECRET || process.env.NEXTAUTH_SECRET,
    // Use JWT sessions for better performance (no database lookup on every request)
    session: {
        strategy: "jwt",
        maxAge: 2 * 60 * 60, // 2 hours
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
            const mustChangePassword = !!(auth?.user as any)?.mustChangePassword
            const isOnDashboard = nextUrl.pathname === "/" || nextUrl.pathname.startsWith("/reports") || nextUrl.pathname.startsWith("/employees") || nextUrl.pathname.startsWith("/devices") || nextUrl.pathname.startsWith("/timesheet") || nextUrl.pathname.startsWith("/schedules") || nextUrl.pathname.startsWith("/corrections")
            const isOnAdmin = nextUrl.pathname.startsWith("/admin")
            const isOnLogin = nextUrl.pathname.startsWith("/login")
            const isOnPasswordChange = nextUrl.pathname === "/change-password"

            if (isLoggedIn && mustChangePassword && !isOnPasswordChange) {
                return Response.redirect(new URL("/change-password", nextUrl))
            }

            if (isLoggedIn && !mustChangePassword && isOnPasswordChange) {
                return Response.redirect(new URL("/", nextUrl))
            }

            if (isOnAdmin) {
                if (isLoggedIn && userRole === "ADMIN") return true
                return Response.redirect(new URL("/", nextUrl)) // Redirect non-admins to dashboard
            }

            if (isOnDashboard) {
                if (isLoggedIn) return true
                return false // Redirect unauthenticated users to login page
            } else if (isOnLogin) {
                if (isLoggedIn) {
                    if (mustChangePassword) {
                        return Response.redirect(new URL("/change-password", nextUrl))
                    }
                    return Response.redirect(new URL("/", nextUrl))
                }
                return true
            }
            return true
        },
        jwt: async ({ token, user, trigger, session }) => {
            // Allow manual session update (e.g. after changing password)
            if (trigger === "update" && session) {
                if (typeof session.mustChangePassword === "boolean") {
                    token.mustChangePassword = session.mustChangePassword;
                }
            }

            // Store user data in token on sign in
            if (user) {
                token.sub = user.id;
                token.name = user.name;
                token.email = user.email;
                token.company = (user as any).company ?? null;
                token.role = (user as any).role ?? 'CLIENT';
                token.username = (user as any).username ?? null;
                token.parentUserId = (user as any).parentUserId ?? null;
                token.isMaster = (user as any).isMaster ?? true;
                token.isCmbMaster = (user as any).isCmbMaster ?? false;
                token.mustChangePassword = (user as any).mustChangePassword ?? false;
            }
            return token;
        },
        session: async ({ session, token }) => {
            // Add user data to session from token
            if (token.sub && session.user) {
                session.user.id = token.sub;
                session.user.name = token.name ?? (session.user as any).name;
                session.user.email = (token.email as string) ?? session.user.email;
                (session.user as any).company = token.company ?? null;
                (session.user as any).role = token.role ?? 'CLIENT';
                (session.user as any).username = token.username ?? null;
                (session.user as any).parentUserId = token.parentUserId ?? null;
                (session.user as any).isMaster = token.isMaster ?? true;
                (session.user as any).isCmbMaster = token.isCmbMaster ?? false;
                (session.user as any).mustChangePassword = token.mustChangePassword ?? false;
            }
            return session;
        }
    },
    providers: [], // Providers added in auth.ts
} satisfies NextAuthConfig
