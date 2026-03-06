"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { PanelLeftClose } from "lucide-react";
import {
  DashboardIcon,
  CustomersIcon,
  UploadIcon,
  ImportsIcon,
  ConflictsIcon,
  SunIcon,
  MoonIcon,
  LogOutIcon,
} from "@/components/sidebar-icons";
import { useTheme } from "next-themes";
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
  { href: "/", label: "Dashboard", icon: DashboardIcon },
  { href: "/customers", label: "Customers", icon: CustomersIcon },
  { href: "/upload", label: "Upload", icon: UploadIcon },
  { href: "/imports", label: "Imports", icon: ImportsIcon },
  { href: "/conflicts", label: "Conflicts", icon: ConflictsIcon },
];

export function Sidebar() {
  const pathname = usePathname();
  const router = useRouter();
  const { collapsed, toggle, setCollapsed } = useSidebar();
  const { resolvedTheme, setTheme } = useTheme();

  const handleSignOut = async () => {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push("/login");
  };

  const handleSidebarClick = () => {
    if (collapsed) setCollapsed(false);
  };

  const toggleTheme = () => {
    setTheme(resolvedTheme === "dark" ? "light" : "dark");
  };

  return (
    <TooltipProvider>
      <aside
        onClick={handleSidebarClick}
        className={cn(
          "sb-nav fixed left-0 top-0 z-40 flex h-screen flex-col border-r border-border-default bg-surface transition-[width] duration-200 overflow-hidden",
          collapsed ? "cursor-pointer" : ""
        )}
        style={{
          width: collapsed ? SIDEBAR_COLLAPSED_W : SIDEBAR_EXPANDED_W,
        }}
      >
        {/* Brand */}
        <div className="flex items-center px-4 py-5 min-h-[68px]">
          <div className="relative flex-1 min-w-0">
            {/* Full logo — visible when expanded */}
            <img
              src={resolvedTheme === "dark" ? "/tailorloom-logo-dark.png" : "/tailorloom-logo.png"}
              alt="TailorLoom"
              className={cn(
                "h-[44px] w-auto transition-opacity duration-200",
                collapsed ? "opacity-0" : "opacity-100"
              )}
            />
            {/* Icon only — visible when collapsed */}
            <img
              src="/tailorloom-icon.png"
              alt="TailorLoom"
              className={cn(
                "absolute left-0 top-1/2 -translate-y-1/2 h-8 w-8 transition-opacity duration-200",
                collapsed ? "opacity-100" : "opacity-0"
              )}
            />
          </div>
          <button
            onClick={(e) => {
              e.stopPropagation();
              toggle();
            }}
            className={cn(
              "flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-text-muted transition-all hover:bg-surface-muted hover:text-text-secondary",
              collapsed
                ? "opacity-0 pointer-events-none w-0 overflow-hidden"
                : "opacity-100"
            )}
          >
            <PanelLeftClose className="h-4 w-4" />
          </button>
        </div>

        <div className="mx-4 h-px bg-border-muted" />

        {/* Navigation */}
        <nav className="flex flex-1 flex-col gap-1 px-3 pt-2">
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
                    ? "bg-surface-active text-text-on-active shadow-sm"
                    : "text-text-muted hover:bg-surface-elevated hover:text-text-primary"
                )}
              >
                <item.icon
                  className={cn(
                    "h-4 w-4 shrink-0",
                    isActive
                      ? "text-text-on-active"
                      : "text-text-muted"
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
        <div className="border-t border-border-muted px-3 py-3">
          {/* Theme toggle */}
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  toggleTheme();
                }}
                className="group flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-[13px] font-medium text-text-muted overflow-hidden whitespace-nowrap transition-colors hover:bg-surface-elevated hover:text-text-primary"
              >
                {resolvedTheme === "dark" ? (
                  <SunIcon className="h-4 w-4 shrink-0 text-text-muted" />
                ) : (
                  <MoonIcon className="h-4 w-4 shrink-0 text-text-muted" />
                )}
                <span
                  className={cn(
                    "transition-opacity duration-200",
                    collapsed ? "opacity-0" : "opacity-100"
                  )}
                >
                  {resolvedTheme === "dark" ? "Light mode" : "Dark mode"}
                </span>
              </button>
            </TooltipTrigger>
            {collapsed && (
              <TooltipContent side="right" sideOffset={8}>
                {resolvedTheme === "dark" ? "Light mode" : "Dark mode"}
              </TooltipContent>
            )}
          </Tooltip>

          {/* Powered by */}
          <div
            className={cn(
              "overflow-hidden transition-all duration-200",
              collapsed ? "h-0 opacity-0" : "h-6 opacity-100"
            )}
          >
            <p className="px-3 pb-2 text-[10px] text-text-muted/50 tracking-wide whitespace-nowrap">
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
                className="group flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-[13px] font-medium text-text-muted overflow-hidden whitespace-nowrap transition-colors hover:bg-surface-elevated hover:text-text-primary"
              >
                <LogOutIcon className="h-4 w-4 shrink-0 text-text-muted" />
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
