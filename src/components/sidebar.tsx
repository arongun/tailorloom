"use client";

import Link from "next/link";
import Image from "next/image";
import { usePathname, useRouter } from "next/navigation";
import {
  LayoutDashboard,
  Users,
  Upload,
  History,
  AlertTriangle,
  LogOut,
  PanelLeftClose,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { createClient } from "@/lib/supabase/client";
import { useSidebar } from "@/components/sidebar-provider";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

export const SIDEBAR_EXPANDED_W = 260;
export const SIDEBAR_COLLAPSED_W = 64;

const navItems = [
  { href: "/", label: "Dashboard", icon: LayoutDashboard },
  { href: "/customers", label: "Customers", icon: Users },
  { href: "/upload", label: "Upload", icon: Upload },
  { href: "/imports", label: "Imports", icon: History },
  { href: "/conflicts", label: "Conflicts", icon: AlertTriangle },
];

export function Sidebar() {
  const pathname = usePathname();
  const router = useRouter();
  const { collapsed, toggle, setCollapsed } = useSidebar();

  const handleSignOut = async () => {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push("/login");
  };

  const handleSidebarClick = () => {
    if (collapsed) setCollapsed(false);
  };

  return (
    <TooltipProvider>
      <aside
        onClick={handleSidebarClick}
        className={cn(
          "fixed left-0 top-0 z-40 flex h-screen flex-col border-r border-slate-200 bg-white transition-all duration-200 overflow-hidden",
          collapsed ? "cursor-pointer" : ""
        )}
        style={{
          width: collapsed ? SIDEBAR_COLLAPSED_W : SIDEBAR_EXPANDED_W,
        }}
      >
        {/* Brand */}
        <div className="flex items-center justify-between px-4 py-5 min-h-[68px]">
          <div className="overflow-hidden shrink-0">
            <Image
              src="/tailorloom-logo.png"
              alt="TailorLoom"
              width={300}
              height={100}
              className="shrink-0 h-7 w-auto"
              priority
              unoptimized
            />
          </div>
          <button
            onClick={(e) => {
              e.stopPropagation();
              toggle();
            }}
            className={cn(
              "flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-slate-400 transition-all hover:bg-slate-100 hover:text-slate-600",
              collapsed
                ? "opacity-0 pointer-events-none w-0 overflow-hidden"
                : "opacity-100"
            )}
          >
            <PanelLeftClose className="h-4 w-4" />
          </button>
        </div>

        <div className="mx-4 h-px bg-slate-100" />

        {/* Navigation */}
        <nav className="flex flex-1 flex-col gap-1 px-3 pt-4">
          <div
            className={cn(
              "mb-2 h-4 px-3 overflow-hidden transition-opacity duration-200",
              collapsed ? "opacity-0" : "opacity-100"
            )}
          >
            <p className="text-[10px] font-semibold tracking-widest text-slate-400 uppercase whitespace-nowrap">
              Navigation
            </p>
          </div>
          {navItems.map((item) => {
            const isActive =
              item.href === "/"
                ? pathname === "/"
                : pathname.startsWith(item.href);

            const link = (
              <Link
                key={item.href}
                href={item.href}
                onClick={(e) => e.stopPropagation()}
                className={cn(
                  "group flex items-center gap-3 rounded-lg px-3 py-2.5 text-[13px] font-medium transition-all duration-150 overflow-hidden whitespace-nowrap",
                  isActive
                    ? "bg-slate-900 text-white shadow-sm"
                    : "text-slate-500 hover:bg-slate-50 hover:text-slate-900"
                )}
              >
                <item.icon
                  className={cn(
                    "h-4 w-4 shrink-0 transition-colors",
                    isActive
                      ? "text-white"
                      : "text-slate-400 group-hover:text-slate-600"
                  )}
                  strokeWidth={isActive ? 2.5 : 2}
                />
                <span
                  className={cn(
                    "transition-opacity duration-200",
                    collapsed ? "opacity-0" : "opacity-100"
                  )}
                >
                  {item.label}
                </span>
              </Link>
            );

            if (collapsed) {
              return (
                <Tooltip key={item.href}>
                  <TooltipTrigger asChild>{link}</TooltipTrigger>
                  <TooltipContent side="right" sideOffset={8}>
                    {item.label}
                  </TooltipContent>
                </Tooltip>
              );
            }

            return link;
          })}
        </nav>

        {/* Footer */}
        <div className="border-t border-slate-100 px-3 py-3">
          {/* Powered by */}
          <div
            className={cn(
              "overflow-hidden transition-all duration-200",
              collapsed ? "h-0 opacity-0" : "h-6 opacity-100"
            )}
          >
            <p className="px-3 pb-2 text-[10px] text-slate-300 tracking-wide whitespace-nowrap">
              Powered by TailorLoom
            </p>
          </div>

          {/* Sign out */}
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  handleSignOut();
                }}
                className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-[13px] font-medium text-slate-500 overflow-hidden whitespace-nowrap transition-colors hover:bg-slate-50 hover:text-slate-900"
              >
                <LogOut className="h-4 w-4 shrink-0 text-slate-400" />
                <span
                  className={cn(
                    "transition-opacity duration-200",
                    collapsed ? "opacity-0" : "opacity-100"
                  )}
                >
                  Sign out
                </span>
              </button>
            </TooltipTrigger>
            {collapsed && (
              <TooltipContent side="right" sideOffset={8}>
                Sign out
              </TooltipContent>
            )}
          </Tooltip>
        </div>
      </aside>
    </TooltipProvider>
  );
}
