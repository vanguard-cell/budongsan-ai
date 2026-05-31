"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

// 메인 5개 탭
const MAIN_TABS = [
  { href: "/properties", icon: "🏘️", label: "내 매물" },
  { href: "/expiry",     icon: "⏰", label: "만기" },
  { href: "/customers",  icon: "👥", label: "손님" },
  { href: "/schedule",   icon: "📅", label: "스케줄" },
  { href: "/more",       icon: "···", label: "더보기" },
];

// 사이드바 전체 메뉴
const SIDEBAR_TABS = [
  { href: "/properties", icon: "🏘️", label: "내 매물 관리" },
  { href: "/expiry",     icon: "⏰", label: "만기 관리" },
  { href: "/customers",  icon: "👥", label: "손님 관리" },
  { href: "/schedule",   icon: "📅", label: "스케줄" },
  { href: "/",           icon: "✨", label: "AI 문구 생성" },
  { href: "/feedback",   icon: "📬", label: "건의함" },
];

export default function AppNav() {
  const pathname = usePathname();
  if (pathname === "/login") return null;

  return (
    <>
      {/* ── PC: 왼쪽 고정 사이드바 ── */}
      <aside className="hidden md:flex fixed left-0 top-0 bottom-0 w-56 bg-white border-r border-gray-100 shadow-sm flex-col z-50">
        <div className="px-5 py-6 border-b border-gray-100">
          <div className="flex items-center gap-2">
            <span className="text-xl">🏡</span>
            <div>
              <div className="text-sm font-bold text-gray-900 leading-tight">미사금빛</div>
              <div className="text-[11px] text-gray-400">매물 도우미</div>
            </div>
          </div>
        </div>

        <nav className="flex-1 px-3 py-4 space-y-1 overflow-y-auto">
          {SIDEBAR_TABS.map(tab => {
            const isActive = tab.href === "/" ? pathname === "/" : pathname.startsWith(tab.href);
            return (
              <Link key={tab.href} href={tab.href}
                className={`flex items-center gap-3 px-3 py-2.5 rounded-xl transition-colors ${
                  isActive ? "bg-blue-50 text-blue-700 font-semibold" : "text-gray-600 hover:bg-gray-50 hover:text-gray-900"
                }`}>
                <span className="text-lg leading-none w-7 text-center">{tab.icon}</span>
                <span className="text-sm">{tab.label}</span>
                {isActive && <span className="ml-auto w-1.5 h-1.5 rounded-full bg-blue-600" />}
              </Link>
            );
          })}
        </nav>

        <div className="px-5 py-4 border-t border-gray-100">
          <p className="text-[10px] text-gray-400 leading-relaxed">☁️ 실시간 동기화<br />PC · 폰 자동 연동</p>
        </div>
      </aside>

      {/* ── 모바일: 하단 탭바 ── */}
      <div className="h-20 md:hidden" />

      <nav className="md:hidden fixed bottom-0 left-0 right-0 z-50 bg-white/95 backdrop-blur-sm border-t border-gray-200 shadow-[0_-4px_20px_rgba(0,0,0,0.06)]">
        <div className="flex items-center justify-around px-1 pt-1 pb-3">
          {MAIN_TABS.map(tab => {
            const isActive = tab.href === "/" ? pathname === "/" : pathname.startsWith(tab.href);
            return (
              <Link key={tab.href} href={tab.href}
                className={`flex flex-col items-center gap-0.5 flex-1 py-2 rounded-2xl transition-colors ${isActive ? "text-blue-600" : "text-gray-400"}`}>
                <span className={`${tab.icon === "···" ? "text-lg font-bold tracking-widest" : "text-xl"} leading-none`}>{tab.icon}</span>
                <span className={`text-[10px] font-medium ${isActive ? "font-bold" : ""}`}>{tab.label}</span>
                {isActive && <span className="w-1 h-1 rounded-full bg-blue-600 mt-0.5" />}
              </Link>
            );
          })}
        </div>
      </nav>
    </>
  );
}
