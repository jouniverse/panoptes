import { TopBar } from "@/components/shell/TopBar";
import { BottomBar } from "@/components/shell/BottomBar";

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex h-screen w-screen flex-col overflow-hidden">
      <TopBar />
      <main className="relative flex min-h-0 flex-1">{children}</main>
      <BottomBar />
    </div>
  );
}
