"use client";

import { useSidebar } from "@/components/sidebar-provider";
import { cn } from "@/lib/utils";

export function DashboardMain({ children }: { children: React.ReactNode }) {
  const { collapsed } = useSidebar();

  return (
    <main
      className={cn(
        "min-h-screen transition-all duration-200",
        collapsed ? "ml-[68px]" : "ml-[260px]"
      )}
    >
      {children}
    </main>
  );
}
