import type { DefaultSession } from "next-auth";

declare module "next-auth" {
    interface User {
        company?: string | null;
    }
    interface Session {
        user: DefaultSession["user"] & { id: string; company?: string | null };
    }
}
