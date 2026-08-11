import { auth } from "@/auth";
import { redirect } from "next/navigation";

export default async function AdminLayout({
    children,
}: {
    children: React.ReactNode;
}) {
    const session = await auth();

    if (!session || (session.user as any)?.role !== "ADMIN") {
        redirect("/");
    }

    return (
        <div className="flex flex-col h-full">
            <header className="h-16 border-b bg-white dark:bg-neutral-900 flex items-center px-8 shrink-0">
                <h1 className="text-xl font-bold bg-gradient-to-r from-blue-600 to-indigo-600 bg-clip-text text-transparent">
                    Painel Administrativo
                </h1>
            </header>
            <main className="flex-1 overflow-auto">
                <div className="container mx-auto p-8">
                    {children}
                </div>
            </main>
        </div>
    );
}
