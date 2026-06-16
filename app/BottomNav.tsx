"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useAuth } from "@/lib/auth-context";
import { ADMIN_EMAIL } from "@/lib/admin-db";

// 메인 5개 탭 — 모바일 (Material Symbols Outlined)
const MAIN_TABS = [
  { href: "/dashboard",  icon: "home",       label: "홈" },
  { href: "/properties", icon: "domain",     label: "내 매물" },
  { href: "/expiry",     icon: "event_busy", label: "만기" },
  { href: "/customers",  icon: "group",      label: "손님" },
  { href: "/more",       icon: "more_horiz", label: "더보기" },
];

// 사이드바 전체 메뉴 — PC (Material Symbols Outlined, 대시보드와 통일)
const SIDEBAR_TABS = [
  { href: "/dashboard",  icon: "home",            label: "홈" },
  { href: "/properties", icon: "domain",          label: "내 매물 관리" },
  { href: "/expiry",     icon: "event_busy",      label: "만기 관리" },
  { href: "/customers",  icon: "group",           label: "손님 관리" },
  { href: "/schedule",     icon: "calendar_month",  label: "스케줄" },
  { href: "/sales",        icon: "payments",        label: "매출 관리" },
  { href: "/market-price", icon: "trending_up",     label: "실거래 최고가" },
  { href: "/team",         icon: "groups",          label: "직원 관리" },
  { href: "/feedback",     icon: "feedback",        label: "건의함" },
];

const ADMIN_TAB = { href: "/admin", icon: "admin_panel_settings", label: "유저 관리" };

export default function AppNav() {
  const pathname = usePathname();
  const { user } = useAuth();
  if (pathname === "/login") return null;

  // 관리자에게만 유저 관리 메뉴 노출
  const sidebarTabs = user?.email === ADMIN_EMAIL ? [...SIDEBAR_TABS, ADMIN_TAB] : SIDEBAR_TABS;

  // Stitch 톤 페이지(자체 사이드바)는 PC 사이드바 중복 방지.
  // 단 모바일 하단 탭바는 그대로 표시
  const hideDesktopSidebar =
    pathname.startsWith("/dashboard") ||
    pathname.startsWith("/properties") ||
    pathname.startsWith("/expiry") ||
    pathname.startsWith("/customers") ||
    pathname.startsWith("/schedule") ||
    pathname.startsWith("/sales") ||
    pathname.startsWith("/ai-content") ||
    pathname.startsWith("/market-price") ||
    pathname.startsWith("/team");

  return (
    <>
      {/* ── PC: 왼쪽 고정 사이드바 (대시보드에서는 자체 사이드바라 숨김) ── */}
      <aside className={`${hideDesktopSidebar ? "hidden" : "hidden sm:flex"} fixed left-0 top-0 bottom-0 w-56 bg-[var(--sidebar-bg)] border-r border-[var(--sidebar-bd)] flex-col z-50`}>
        <div className="px-5 py-6 border-b border-[var(--sidebar-bd)]">
          <div className="flex items-center gap-2">
            <span className="text-xl">🏡</span>
            <div>
              <div className="text-sm font-bold text-gray-800 dark:text-gray-100 leading-tight">DealDone</div>
              <div className="text-[11px] text-gray-400 dark:text-gray-500">부동산 매물 도우미</div>
            </div>
          </div>
        </div>

        <nav className="flex-1 px-3 py-4 space-y-1 overflow-y-auto">
          {sidebarTabs.map(tab => {
            const isActive = tab.href === "/" ? pathname === "/" : pathname.startsWith(tab.href);
            return (
              <Link key={tab.href} href={tab.href}
                className={`flex items-center gap-3 px-3 py-2.5 rounded-lg transition-colors ${
                  isActive
                    ? "bg-[var(--sidebar-active)] text-gray-900 dark:text-gray-100 font-bold"
                    : "text-[#5F5E5B] dark:text-gray-300 hover:bg-[var(--sidebar-active)]/60 hover:text-gray-900 dark:hover:text-gray-100"
                }`}>
                <span
                  className="material-symbols-outlined text-xl leading-none w-7 text-center"
                  style={isActive ? { fontVariationSettings: "'FILL' 1, 'wght' 500" } : undefined}
                >
                  {tab.icon}
                </span>
                <span className="text-sm">{tab.label}</span>
              </Link>
            );
          })}
        </nav>

        <div className="px-5 py-4 border-t border-[var(--sidebar-bd)]">
          <p className="text-[10px] text-gray-400 dark:text-gray-500 leading-relaxed">☁️ 실시간 동기화<br />PC · 폰 자동 연동</p>
        </div>
      </aside>

      {/* ── 모바일: 하단 탭바 (sm 미만 — 사이드바 표시 기준과 일치) ── */}
      <div className="h-20 sm:hidden" />

      <nav className="sm:hidden fixed bottom-0 left-0 right-0 z-50 bg-white/95 dark:bg-slate-900/95 backdrop-blur-sm border-t border-gray-200 dark:border-slate-700 shadow-[0_-4px_20px_rgba(0,0,0,0.06)]">
        <div className="flex items-center justify-around px-1 pt-1 pb-3">
          {MAIN_TABS.map(tab => {
            const isActive = tab.href === "/" ? pathname === "/" : pathname.startsWith(tab.href);
            return (
              <Link key={tab.href} href={tab.href}
                className={`flex flex-col items-center gap-0.5 flex-1 py-2 rounded-2xl transition-colors ${
                  isActive ? "text-blue-600 dark:text-blue-400" : "text-gray-500 dark:text-gray-500"
                }`}>
                <span
                  className="material-symbols-outlined text-2xl leading-none"
                  style={isActive ? { fontVariationSettings: "'FILL' 1, 'wght' 600" } : undefined}
                >
                  {tab.icon}
                </span>
                <span className={`text-[10px] font-medium ${isActive ? "font-bold" : ""}`}>{tab.label}</span>
                {isActive && <span className="w-1 h-1 rounded-full bg-blue-600 dark:bg-blue-400 mt-0.5" />}
              </Link>
            );
          })}
        </div>
      </nav>
    </>
  );
}
