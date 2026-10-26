import NextAuth from "next-auth"
import { authConfig } from "./auth.config"
import { NextResponse } from "next/server"

// Lightweight auth instance for Edge runtime
const { auth } = NextAuth(authConfig)

export default auth((req) => {
    const { nextUrl } = req
    const isLoggedIn = !!req.auth?.user
    const userRole = (req.auth?.user as any)?.role

    // 1. Domain Redirect Strategy
    // Strictly enforce www.pontualidade.pt in production
    if (process.env.NODE_ENV === "production") {
        const hostname = req.headers.get("host") || ""
        const desiredDomain = "www.pontualidade.pt"
        const isPost = req.method === "POST"
        const isAuthPath = nextUrl.pathname.startsWith("/api/auth")

        if (hostname && hostname !== desiredDomain && !isPost && !isAuthPath) {
            const newUrl = new URL(req.url)
            newUrl.host = desiredDomain
            newUrl.protocol = "https"
            return NextResponse.redirect(newUrl)
        }
    }

    // 2. Authentication & Route Guard Strategy
    const isOnLogin = nextUrl.pathname === "/login"
    const isOnAdmin = nextUrl.pathname.startsWith("/admin")

    // Protected application routes
    const isProtectedRoute =
        nextUrl.pathname === "/" ||
        nextUrl.pathname.startsWith("/reports") ||
        nextUrl.pathname.startsWith("/timesheet") ||
        nextUrl.pathname.startsWith("/schedules") ||
        nextUrl.pathname.startsWith("/corrections") ||
        isOnAdmin

    // Unauthenticated user accessing any protected route -> redirect to /login
    if (isProtectedRoute && !isLoggedIn) {
        const loginUrl = new URL("/login", req.url)
        return NextResponse.redirect(loginUrl)
    }

    // Authenticated user accessing /login -> redirect to dashboard
    if (isOnLogin && isLoggedIn) {
        const dashboardUrl = new URL("/", req.url)
        return NextResponse.redirect(dashboardUrl)
    }

    // Authenticated non-admin accessing /admin -> redirect to dashboard
    if (isOnAdmin && userRole !== "ADMIN") {
        const dashboardUrl = new URL("/", req.url)
        return NextResponse.redirect(dashboardUrl)
    }

    return NextResponse.next()
})

export const config = {
    /*
     * Match all request paths except for the ones starting with:
     * - api (API routes)
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     * - public files (svg, png, jpg, jpeg, gif, webp)
     */
    matcher: ["/((?!api|_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)"],
}
