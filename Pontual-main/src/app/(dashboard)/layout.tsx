import { Sidebar, MobileNav } from "@/components/layout/sidebar";
import { ExternalLink, Sparkles } from "lucide-react";

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

      {/* Main Content Area */}
      <div className="flex-1 md:ml-64 transition-all duration-300 ease-in-out flex flex-col min-h-screen">
        
        {/* Top Header Bar with iFlow Ecosystem Banner */}
        <header className="sticky top-0 z-40 h-14 bg-white/80 dark:bg-neutral-900/80 backdrop-blur-md border-b border-neutral-200 dark:border-neutral-800 px-4 sm:px-6 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="md:hidden flex items-center">
              <MobileNav />
            </div>
            <div className="flex items-center gap-2">
              <span className="font-extrabold text-base sm:text-lg text-neutral-900 dark:text-white">Pontualidade</span>
              <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-blue-50 dark:bg-blue-950/60 text-blue-700 dark:text-cyan-300 border border-blue-200 dark:border-blue-900/40 font-semibold">
                Cloud v2.4
              </span>
            </div>
          </div>

          {/* Right Header Quick Link to iFlow.pt */}
          <div className="flex items-center gap-3">
            <a
              href="https://iflow.pt"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-slate-100 dark:bg-white/5 hover:bg-blue-50 dark:hover:bg-blue-950/40 border border-slate-200 dark:border-white/10 hover:border-blue-400 text-slate-700 dark:text-slate-300 hover:text-blue-700 dark:hover:text-cyan-300 text-xs font-semibold transition-all shadow-2xs group"
              title="Visitar iFlow.pt — Software, POS e Engenharia Digital"
            >
              <span className="w-1.5 h-1.5 rounded-full bg-blue-600 dark:bg-cyan-400 animate-pulse"></span>
              <span className="hidden sm:inline">Ecossistema</span>
              <span className="font-bold">iFlow.pt</span>
              <ExternalLink className="h-3 w-3 opacity-60 group-hover:opacity-100 group-hover:translate-x-0.5 transition-all" />
            </a>
          </div>
        </header>

        {/* Page Body */}
        <main className="flex-1">
          {children}
        </main>
      </div>
    </div>
  );
}
