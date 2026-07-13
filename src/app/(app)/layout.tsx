import { TopBar } from "@/components/shell/TopBar";
import { BottomBar } from "@/components/shell/BottomBar";
import { MobileBanner } from "@/components/shell/MobileBanner";
import { MobileLayoutInit } from "@/components/shell/MobileLayoutInit";
import { NarrowViewGuard } from "@/components/shell/NarrowViewGuard";

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="pan-app-shell flex w-screen flex-col overflow-hidden">
      <MobileLayoutInit />
      <MobileBanner />
      <TopBar />
      <main className="relative flex min-h-0 min-w-0 flex-1 overflow-hidden">
        <NarrowViewGuard>{children}</NarrowViewGuard>
      </main>
      <BottomBar />
    </div>
  );
}
