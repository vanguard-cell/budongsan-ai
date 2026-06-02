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
      {/* pt-16: 상단 헤더 / lg:pl-64: PC 사이드바 / pb-20 md:pb-0: 모바일 하단 탭바 여유 */}
      <main className="pt-16 lg:pl-64 pb-20 md:pb-0">
        {children}
      </main>
    </div>
  );
}
