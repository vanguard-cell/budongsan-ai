/**
 * 대시보드 전용 레이아웃
 * - 상단 fixed 헤더 (h-16 = 64px)
 * - 좌측 fixed 사이드바 (lg:flex w-64)
 * - 메인 컨텐츠는 pt-16 + lg:pl-64
 */

import DashboardSidebar from "./components/DashboardSidebar";
import DashboardHeader from "./components/DashboardHeader";

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-gradient-to-br from-white to-emerald-50/40 dark:from-slate-900 dark:to-emerald-950/30">
      <DashboardHeader />
      <DashboardSidebar />
      <main className="pt-16 lg:pl-64">
        {children}
      </main>
    </div>
  );
}
