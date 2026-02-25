"use client";

import { useSidebar } from "@/components/sidebar-provider";
import {
  SIDEBAR_EXPANDED_W,
  SIDEBAR_COLLAPSED_W,
} from "@/components/sidebar";

export function DashboardMain({ children }: { children: React.ReactNode }) {
  const { collapsed } = useSidebar();

  return (
    <main
      className="min-h-screen transition-all duration-200"
      style={{
        marginLeft: collapsed ? SIDEBAR_COLLAPSED_W : SIDEBAR_EXPANDED_W,
      }}
    >
      {children}
    </main>
  );
}
