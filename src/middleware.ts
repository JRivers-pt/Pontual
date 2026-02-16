import NextAuth from "next-auth"
import { authConfig } from "./auth.config"

// Create a lightweight auth instance for the middleware (Edge Runtime)
// This does NOT include providers with database/bcrypt logic
const { auth } = NextAuth(authConfig)

export default auth

export const config = {
    // Protect routes but exclude static files, images, API routes, and Next.js internals
    // This prevents middleware from running on every asset load
    matcher: ["/((?!api|_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)"]
}
