import NextAuth from "next-auth"
import { authConfig } from "./auth.config"

// Create a lightweight auth instance for the middleware (Edge Runtime)
// This does NOT include providers with database/bcrypt logic
const { auth } = NextAuth(authConfig)

export default auth

export const config = {
    // Protect all main routes, exclude login/api/static
    matcher: ["/", "/reports/:path*", "/timesheet/:path*", "/employees/:path*", "/settings/:path*"]
}
