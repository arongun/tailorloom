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
  PanelLeftOpen,
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
  const { collapsed, toggle } = useSidebar();

  const handleSignOut = async () => {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push("/login");
  };

  return (
    <TooltipProvider>
      <aside
        className={cn(
          "fixed left-0 top-0 z-40 flex h-screen flex-col border-r border-slate-200 bg-white transition-all duration-200",
          collapsed ? "w-[68px]" : "w-[260px]"
        )}
      >
        {/* Brand */}
        <div
          className={cn(
            "flex items-center py-6 transition-all duration-200",
            collapsed ? "justify-center px-3" : "px-6"
          )}
        >
          {collapsed ? (
            <Image
              src="/tailorloom-icon.png"
              alt="TailorLoom"
              width={28}
              height={28}
              className="shrink-0"
            />
          ) : (
            <div>
              <Image
                src="/tailorloom-logo.png"
                alt="TailorLoom"
                width={150}
                height={32}
                className="shrink-0"
              />
              <p className="mt-1 text-[11px] font-medium tracking-wide text-slate-400 uppercase">
                Revenue Console
              </p>
            </div>
          )}
        </div>

        <div className="mx-4 h-px bg-slate-100" />

        {/* Navigation */}
        <nav className="flex flex-1 flex-col gap-1 px-3 pt-4">
          {!collapsed && (
            <p className="mb-2 px-3 text-[10px] font-semibold tracking-widest text-slate-400 uppercase">
              Navigation
            </p>
          )}
          {navItems.map((item) => {
            const isActive =
              item.href === "/"
                ? pathname === "/"
                : pathname.startsWith(item.href);

            const link = (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  "group flex items-center rounded-lg text-[13px] font-medium transition-all duration-150",
                  collapsed
                    ? "justify-center px-0 py-2.5"
                    : "gap-3 px-3 py-2.5",
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
                {!collapsed && item.label}
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
        <div className="border-t border-slate-100 p-3">
          {/* Collapse toggle */}
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                onClick={toggle}
                className={cn(
                  "flex w-full items-center rounded-lg py-2 text-[13px] font-medium text-slate-400 transition-colors hover:bg-slate-50 hover:text-slate-600",
                  collapsed ? "justify-center px-0" : "gap-3 px-3"
                )}
              >
                {collapsed ? (
                  <PanelLeftOpen className="h-4 w-4" />
                ) : (
                  <>
                    <PanelLeftClose className="h-4 w-4" />
                    <span>Collapse</span>
                  </>
                )}
              </button>
            </TooltipTrigger>
            {collapsed && (
              <TooltipContent side="right" sideOffset={8}>
                Expand sidebar
              </TooltipContent>
            )}
          </Tooltip>

          {/* Sign out */}
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                onClick={handleSignOut}
                className={cn(
                  "flex w-full items-center rounded-lg py-2.5 text-[13px] font-medium text-slate-500 transition-colors hover:bg-slate-50 hover:text-slate-900",
                  collapsed ? "justify-center px-0" : "gap-3 px-3"
                )}
              >
                <LogOut className="h-4 w-4 shrink-0 text-slate-400" />
                {!collapsed && "Sign out"}
              </button>
            </TooltipTrigger>
            {collapsed && (
              <TooltipContent side="right" sideOffset={8}>
                Sign out
              </TooltipContent>
            )}
          </Tooltip>

          {/* Powered by */}
          {!collapsed && (
            <div className="mt-2 px-3">
              <p className="text-[10px] text-slate-300 tracking-wide">
                Powered by TailorLoom
              </p>
            </div>
          )}
        </div>
      </aside>
    </TooltipProvider>
  );
}
