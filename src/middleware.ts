import NextAuth from "next-auth"
import { authConfig } from "./auth.config"

// Create a lightweight auth instance for the middleware (Edge Runtime)
// This does NOT include providers with database/bcrypt logic
const { auth } = NextAuth(authConfig)

export default auth

export const config = {
    matcher: ["/", "/reports/:path*"]
}
