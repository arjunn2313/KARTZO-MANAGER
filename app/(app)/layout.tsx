import { Sidebar } from "@/components/sidebar";
import { logout } from "../(auth)/login/actions";

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-stone-100 text-stone-900">
      <Sidebar logoutAction={logout} />
      <div className="lg:pl-64">
        <main className="w-full px-4 pb-28 pt-6 sm:px-6 lg:px-8 lg:py-8">{children}</main>
      </div>
    </div>
  );
}
