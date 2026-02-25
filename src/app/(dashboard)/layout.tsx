import { Toaster } from "@/components/ui/sonner";
import { Sidebar } from "@/components/sidebar";
import { SidebarProvider } from "@/components/sidebar-provider";
import { DashboardMain } from "@/components/dashboard-main";

export const metadata = {
  title: "TailorLoom — Revenue Intelligence Console",
  description:
    "Revenue analytics and customer intelligence for service-based businesses",
};

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <SidebarProvider>
      <Sidebar />
      <DashboardMain>{children}</DashboardMain>
      <Toaster position="bottom-right" richColors />
    </SidebarProvider>
  );
}
