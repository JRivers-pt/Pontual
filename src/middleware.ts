import NextAuth from "next-auth"
import { auth } from "@/auth"

export default auth((req) => {
    const isLoggedIn = !!req.auth
    const isOnLogin = req.nextUrl.pathname.startsWith('/login')

    if (isOnLogin) {
        if (isLoggedIn) {
            return Response.redirect(new URL('/', req.nextUrl))
        }
        return // Continue to login page
    }

    if (!isLoggedIn) {
        return Response.redirect(new URL('/login', req.nextUrl))
    }
})

export const config = {
    // matcher: ["/((?!api|_next/static|_next/image|favicon.ico).*)"],
    // Simple matcher for dashboard and root
    matcher: ["/", "/reports/:path*"]
}
