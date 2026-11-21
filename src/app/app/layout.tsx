import AppNav from "@/components/AppNav";
import AppSessionGuard from "@/components/AppSessionGuard";

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="app-shell app-shell--sidebar">
      <aside className="app-sidebar sans">
        <AppNav />
      </aside>
      <div className="app-content">
        <AppSessionGuard />
        {children}
      </div>
    </div>
  );
}
