/**
 * 내 매물 관리 전용 레이아웃 — dashboard와 동일한 사이드바·헤더 공유
 */

import DashboardSidebar from "../dashboard/components/DashboardSidebar";
import DashboardHeader from "../dashboard/components/DashboardHeader";

export default function PropertiesLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-gradient-to-br from-white to-emerald-50/40 dark:from-slate-900 dark:to-emerald-950/30">
      <DashboardHeader />
      <DashboardSidebar />
      <main className="pt-16 lg:pl-64 pb-20 md:pb-0">
        {children}
      </main>
    </div>
  );
}
