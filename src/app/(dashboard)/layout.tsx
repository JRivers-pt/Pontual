import { Sidebar, MobileNav } from "@/components/layout/sidebar";

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="flex min-h-screen bg-neutral-50 dark:bg-neutral-950">
      {/* Desktop Sidebar */}
      <div className="hidden md:flex w-64 flex-col fixed inset-y-0 z-50">
        <Sidebar />
      </div>

      {/* Mobile Header & Content */}
      <div className="flex-1 md:ml-64 transition-all duration-300 ease-in-out">
        <div className="md:hidden flex items-center p-4 border-b bg-white dark:bg-neutral-900">
          <MobileNav />
          <span className="ml-2 font-bold text-lg">Pontualidade</span>
        </div>
        <main>
          {children}
        </main>
      </div>
    </div>
  );
}
