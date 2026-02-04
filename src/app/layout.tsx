import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import { Sidebar, MobileNav } from "@/components/layout/sidebar";

const inter = Inter({ subsets: ["latin"] });

export const metadata: Metadata = {
  title: "Pontualidade | VE Vontade e Empenho",
  description: "Sistema inteligente de gestão de assiduidade para VE Vontade e Empenho.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="pt-PT">
      <body className={inter.className}>
        <div className="flex min-h-screen bg-neutral-50 dark:bg-neutral-950">
          {/* Desktop Sidebar */}
          <div className="hidden md:flex w-64 flex-col fixed inset-y-0 z-50">
            <Sidebar />
          </div>

          {/* Mobile Header & Content */}
          <div className="flex-1 md:ml-64 transition-all duration-300 ease-in-out">
            <div className="md:hidden flex items-center p-4 border-b bg-white dark:bg-neutral-900">
              <MobileNav />
              <span className="ml-2 font-bold text-lg">Pontual | VE</span>
            </div>
            <main>
              {children}
            </main>
          </div>
        </div>
      </body>
    </html>
  );
}
