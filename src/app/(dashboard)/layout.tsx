import { Toaster } from "@/components/ui/sonner";
import { Sidebar } from "@/components/sidebar";

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
    <>
      <Sidebar />
      <main className="ml-[260px] min-h-screen">{children}</main>
      <Toaster position="bottom-right" richColors />
    </>
  );
}
