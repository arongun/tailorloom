"use client";

import {
  createContext,
  useContext,
  useState,
  useEffect,
  type ReactNode,
} from "react";

type SidebarContextType = {
  collapsed: boolean;
  setCollapsed: (collapsed: boolean) => void;
  toggle: () => void;
};

const SidebarContext = createContext<SidebarContextType | undefined>(undefined);

const STORAGE_KEY = "tailorloom-sidebar-collapsed";

export function SidebarProvider({ children }: { children: ReactNode }) {
  const [collapsed, setCollapsedState] = useState(false);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored === "true") setCollapsedState(true);
    setMounted(true);
  }, []);

  const setCollapsed = (value: boolean) => {
    setCollapsedState(value);
    localStorage.setItem(STORAGE_KEY, String(value));
  };

  const toggle = () => setCollapsed(!collapsed);

  // Prevent hydration mismatch — render expanded by default until mounted
  const value = {
    collapsed: mounted ? collapsed : false,
    setCollapsed,
    toggle,
  };

  return (
    <SidebarContext.Provider value={value}>{children}</SidebarContext.Provider>
  );
}

export function useSidebar() {
  const context = useContext(SidebarContext);
  if (!context) {
    throw new Error("useSidebar must be used within a SidebarProvider");
  }
  return context;
}
