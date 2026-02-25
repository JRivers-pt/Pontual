import NextAuth from "next-auth"
import { authConfig } from "./auth.config"

// Create a lightweight auth instance for the middleware (Edge Runtime)
// This does NOT include providers with database/bcrypt logic
const { auth } = NextAuth(authConfig)

import { NextResponse } from "next/server"

export default auth((req) => {
    // 1. Domain Redirect Strategy
    // Strictly enforce www.pontualidade.pt in production
    // This catches ANY other domain (e.g., pontual-azure.vercel.app) and redirects to the canonical one
    if (process.env.NODE_ENV === "production") {
        const hostname = req.headers.get("host") || ""
        const desiredDomain = "www.pontualidade.pt"
        const isPost = req.method === "POST"
        const isAuthPath = req.nextUrl.pathname.startsWith("/api/auth")

        // If we are NOT on the desired domain, and it's NOT a POST/Auth request, redirect
        if (hostname !== desiredDomain && !isPost && !isAuthPath) {
            const newUrl = new URL(req.url)
            newUrl.host = desiredDomain
            newUrl.protocol = "https"
            return NextResponse.redirect(newUrl)
        }
    }

    // 2. Authentication is handled automatically by the authwrapper
    // The 'authorized' callback in auth.config.ts determines access
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
