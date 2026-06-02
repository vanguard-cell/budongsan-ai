"use client";

/**
 * 대시보드 전용 사이드바 — Stitch 시안 그대로
 * - 폭 256px (w-64)
 * - Material Symbols 아이콘
 * - 활성 메뉴 좌측 4px 초록 바 + primary-container 배경
 * - 하단: 빠른 등록 버튼 + 사용자 카드
 */

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useAuth } from "@/lib/auth-context";

interface NavItem {
  href: string;
  icon: string;     // Material Symbols
  label: string;
  highlight?: boolean;
}

const NAV: NavItem[] = [
  { href: "/dashboard",  icon: "home",            label: "홈" },
  { href: "/properties", icon: "domain",          label: "내 매물 관리" },
  { href: "/expiry",     icon: "event_busy",      label: "만기 관리" },
  { href: "/customers",  icon: "group",           label: "손님 관리" },
  { href: "/schedule",   icon: "calendar_month",  label: "스케줄" },
  { href: "/sales",      icon: "payments",        label: "매출 관리" },
  { href: "/",           icon: "auto_awesome",    label: "AI 문구 생성", highlight: true },
];

const SUB_NAV: NavItem[] = [
  { href: "/feedback",   icon: "feedback",        label: "건의함" },
];

export default function DashboardSidebar() {
  const pathname = usePathname();
  const { user } = useAuth();

  const isActive = (href: string) => {
    if (href === "/") return pathname === "/";
    return pathname === href || pathname.startsWith(href + "/");
  };

  const userName = user?.displayName || user?.email?.split("@")[0] || "사용자";

  return (
    <aside className="hidden lg:flex flex-col fixed left-0 top-16 h-[calc(100vh-64px)] w-64 bg-white dark:bg-slate-900 border-r border-gray-200 dark:border-slate-700 p-4 z-30">
      {/* 주 메뉴 */}
      <nav className="flex-grow space-y-1 overflow-y-auto">
        {NAV.map(item => {
          const active = isActive(item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`flex items-center gap-3 px-4 py-3 rounded-lg transition-all cursor-pointer relative
                ${active
                  ? "bg-green-50 dark:bg-green-950/40 text-green-800 dark:text-green-300 font-bold border-l-4 border-green-700 dark:border-green-400 pl-3"
                  : `text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-slate-800 ${item.highlight ? "text-pink-700 dark:text-pink-400" : ""}`
                }`}
            >
              <span
                className="material-symbols-outlined text-xl"
                style={active ? { fontVariationSettings: "'FILL' 1, 'wght' 500" } : undefined}
              >
                {item.icon}
              </span>
              <span className="text-sm">{item.label}</span>
              {active && (
                <span className="ml-auto w-1.5 h-1.5 rounded-full bg-green-700 dark:bg-green-400" />
              )}
            </Link>
          );
        })}

        {/* 보조 메뉴 */}
        <div className="pt-4 mt-4 border-t border-gray-200 dark:border-slate-700 space-y-1">
          {SUB_NAV.map(item => {
            const active = isActive(item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`flex items-center gap-3 px-4 py-2.5 rounded-lg transition-colors text-sm
                  ${active
                    ? "bg-gray-100 dark:bg-slate-800 text-gray-900 dark:text-gray-100 font-semibold"
                    : "text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-slate-800"
                  }`}
              >
                <span className="material-symbols-outlined text-lg">{item.icon}</span>
                {item.label}
              </Link>
            );
          })}
        </div>
      </nav>

      {/* 하단 — 빠른 등록 + 사용자 카드 */}
      <div className="pt-4 mt-4 border-t border-gray-200 dark:border-slate-700">
        <Link
          href="/properties"
          className="w-full flex items-center justify-center gap-2 py-3 bg-green-700 dark:bg-green-600 text-white rounded-xl shadow-sm hover:brightness-110 active:scale-95 transition-all mb-3"
        >
          <span className="material-symbols-outlined text-xl">edit_note</span>
          <span className="font-bold text-sm">빠른 등록</span>
        </Link>
        <div className="flex items-center gap-3 px-2">
          <div className="w-10 h-10 rounded-full bg-green-700 dark:bg-green-600 flex items-center justify-center text-white font-bold shrink-0">
            {userName.charAt(0)}
          </div>
          <div className="min-w-0">
            <p className="text-sm font-semibold text-gray-900 dark:text-gray-100 truncate">{userName}</p>
            <p className="text-[11px] text-gray-500 dark:text-gray-400 truncate">미사금빛 부동산</p>
          </div>
        </div>
      </div>
    </aside>
  );
}
