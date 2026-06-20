"use client";

/**
 * 사이드바 — 노션 톤 (연회색 #F7F7F5 + 회색 활성 알약, 2026-06 확정 v2)
 *
 * PC에서는 상단바 없이 사이드바가 전부 담당:
 *  - 상단: 로고 + 접기 토글
 *  - 검색 (Enter → /properties?q= 통합검색)
 *  - 메뉴 (활성 = 회색 알약 #E9E9E7 + 진한 글자)
 *  - 하단: 빠른 등록(노션 블루 #2383E2) + 사용자 카드 + 알림·다크모드·로그아웃
 *
 * 토글(open) + 가장자리 peek 동작은 StitchLayout에서 제어.
 */

import { useState, useEffect } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useAuth, roleTitle } from "@/lib/auth-context";
import { ADMIN_EMAIL } from "@/lib/admin-db";

interface NavItem {
  href: string;
  icon: string;     // Material Symbols
  label: string;
}

const NAV: NavItem[] = [
  { href: "/dashboard",  icon: "home",            label: "홈" },
  { href: "/properties", icon: "domain",          label: "내 매물 관리" },
  { href: "/expiry",     icon: "event_busy",      label: "만기 관리" },
  { href: "/customers",  icon: "group",           label: "고객 관리" },
  { href: "/schedule",     icon: "calendar_month",  label: "스케줄" },
  { href: "/sales",        icon: "payments",        label: "매출 관리" },
  { href: "/insights",     icon: "insights",        label: "인사이트" },
  { href: "/market-price", icon: "trending_up",     label: "실거래 최고가" },
  // { href: "/ai-content", icon: "auto_awesome", label: "AI 문구 생성" },  // 임시 숨김 (미사용)
];

const SUB_NAV: NavItem[] = [
  { href: "/team",       icon: "groups",          label: "직원 관리" },
  { href: "/feedback",   icon: "feedback",        label: "건의함" },
];

const ADMIN_NAV: NavItem = { href: "/admin", icon: "admin_panel_settings", label: "유저 관리" };

interface SidebarProps {
  /** 고정 열림 (토글 버튼) — false면 화면 밖으로 슬라이드 */
  open?: boolean;
  /** 접힌 상태에서 좌측 가장자리 hover로 임시 표시 (v0 스타일) */
  peek?: boolean;
  /** peek 중 마우스가 사이드바를 벗어나면 닫기 */
  onPeekEnd?: () => void;
  /** 접기/펴기 토글 (사이드바 상단 버튼) */
  onToggle?: () => void;
}

export default function DashboardSidebar({ open = true, peek = false, onPeekEnd, onToggle }: SidebarProps) {
  const pathname = usePathname();
  const router = useRouter();
  const { user, signOut } = useAuth();
  const isAdmin = user?.email === ADMIN_EMAIL;
  const subNav = isAdmin ? [...SUB_NAV, ADMIN_NAV] : SUB_NAV;

  const [search, setSearch] = useState("");
  const [isDark, setIsDark] = useState(false);

  useEffect(() => {
    const stored = localStorage.getItem("theme");
    const dark = stored === "dark" || (!stored && window.matchMedia("(prefers-color-scheme: dark)").matches);
    setIsDark(dark);
  }, []);

  const toggleDark = () => {
    const next = !isDark;
    setIsDark(next);
    if (next) {
      document.documentElement.classList.add("dark");
      localStorage.setItem("theme", "dark");
    } else {
      document.documentElement.classList.remove("dark");
      localStorage.setItem("theme", "light");
    }
  };

  const doSearch = () => {
    const q = search.trim();
    if (!q) return;
    router.push(`/properties?q=${encodeURIComponent(q)}`);
  };

  const isActive = (href: string) => {
    if (href === "/") return pathname === "/";
    return pathname === href || pathname.startsWith(href + "/");
  };

  const userName = user?.displayName || user?.email?.split("@")[0] || "사용자";
  const title = user ? roleTitle(user.role) : "대표님";

  // open: 평소처럼 고정 / peek: 오버레이로 떠서 그림자 / 둘 다 아니면 화면 밖
  const visible = open || peek;

  return (
    <aside
      onMouseLeave={() => { if (!open && peek) onPeekEnd?.(); }}
      className={`hidden sm:flex flex-col fixed left-0 top-0 h-screen w-56 lg:w-64 bg-[var(--sidebar-bg)] border-r border-[var(--sidebar-bd)] p-4 transition-transform duration-200 ease-out ${
        visible ? "translate-x-0" : "-translate-x-full"
      } ${!open && peek ? "z-50 shadow-2xl" : "z-30"}`}
    >
      {/* 브랜드 + 접기 토글 */}
      <div className="flex items-center justify-between mb-4 pl-1">
        <Link href="/dashboard" className="flex items-center gap-2">
          <span className="text-lg">🏡</span>
          <span className="text-lg font-bold text-gray-800 dark:text-gray-100 tracking-tight">DealDone</span>
        </Link>
        <button
          onClick={onToggle}
          title="사이드바 접기"
          className="w-8 h-8 flex items-center justify-center rounded-lg text-gray-400 hover:bg-gray-100 dark:hover:bg-slate-800 hover:text-gray-700 dark:hover:text-gray-200 transition-colors"
        >
          <span className="material-symbols-outlined text-xl">menu_open</span>
        </button>
      </div>

      {/* 통합 검색 */}
      <div className="relative mb-4">
        <span
          onClick={doSearch}
          className="material-symbols-outlined absolute left-2.5 top-1/2 -translate-y-1/2 text-[18px] text-gray-400 cursor-pointer hover:text-[var(--brand-blue)]"
        >
          search
        </span>
        <input
          type="text"
          value={search}
          onChange={e => setSearch(e.target.value)}
          onKeyDown={e => { if (e.key === "Enter") doSearch(); }}
          placeholder="단지·이름·전화 검색"
          className="w-full pl-9 pr-3 py-2 text-sm rounded-lg bg-white dark:bg-slate-800 border border-[var(--sidebar-bd)] focus:outline-none focus:ring-2 focus:ring-blue-500/30"
        />
      </div>

      {/* 주 메뉴 */}
      <nav className="flex-grow space-y-1 overflow-y-auto">
        {NAV.map(item => {
          const active = isActive(item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`flex items-center gap-3 px-4 py-2.5 rounded-lg transition-all cursor-pointer
                ${active
                  ? "bg-[var(--sidebar-active)] text-gray-900 dark:text-gray-100 font-bold"
                  : "text-[#5F5E5B] dark:text-gray-300 hover:bg-[var(--sidebar-active)]/60 hover:text-gray-900 dark:hover:text-gray-100"
                }`}
            >
              <span
                className="material-symbols-outlined text-xl"
                style={active ? { fontVariationSettings: "'FILL' 1, 'wght' 500" } : undefined}
              >
                {item.icon}
              </span>
              <span className="text-sm">{item.label}</span>
            </Link>
          );
        })}

        {/* 보조 메뉴 */}
        <div className="pt-3 mt-3 border-t border-[var(--sidebar-bd)] space-y-1">
          {subNav.map(item => {
            const active = isActive(item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`flex items-center gap-3 px-4 py-2 rounded-lg transition-colors text-sm
                  ${active
                    ? "bg-[var(--sidebar-active)] text-gray-900 dark:text-gray-100 font-bold"
                    : "text-[#5F5E5B]/90 dark:text-gray-400 hover:bg-[var(--sidebar-active)]/60 hover:text-gray-900 dark:hover:text-gray-100"
                  }`}
              >
                <span className="material-symbols-outlined text-lg">{item.icon}</span>
                {item.label}
              </Link>
            );
          })}
        </div>
      </nav>

      {/* 하단 — 빠른 등록 + 사용자 + 액션 */}
      <div className="pt-3 mt-3 border-t border-[var(--sidebar-bd)]">
        <Link
          href="/properties?new=1"
          className="w-full flex items-center justify-center gap-2 py-2.5 bg-[var(--brand-blue)] text-white rounded-xl shadow-sm hover:brightness-110 active:scale-95 transition-all mb-3"
        >
          <span className="material-symbols-outlined text-xl">edit_note</span>
          <span className="font-bold text-sm">빠른 등록</span>
        </Link>

        <div className="flex items-center gap-2.5 px-1">
          <div className="w-9 h-9 rounded-full bg-gray-800 dark:bg-slate-600 flex items-center justify-center text-white font-bold text-sm shrink-0">
            {userName.charAt(0)}
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold text-gray-900 dark:text-gray-100 truncate leading-tight">{userName} {title}</p>
            <p className="text-[11px] text-gray-500 dark:text-gray-400 truncate">미사금빛 부동산</p>
          </div>
        </div>

        {/* 알림 · 다크모드 · 로그아웃 */}
        <div className="flex items-center justify-around mt-3 pt-3 border-t border-[var(--sidebar-bd)]">
          <button
            title="알림"
            className="w-9 h-9 flex items-center justify-center rounded-lg text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-slate-800 hover:text-gray-900 dark:hover:text-gray-100 transition-colors"
          >
            <span className="material-symbols-outlined text-xl">notifications</span>
          </button>
          <button
            onClick={toggleDark}
            title={isDark ? "라이트 모드" : "다크 모드"}
            className="w-9 h-9 flex items-center justify-center rounded-lg text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-slate-800 hover:text-gray-900 dark:hover:text-gray-100 transition-colors"
          >
            <span className="material-symbols-outlined text-xl">{isDark ? "dark_mode" : "light_mode"}</span>
          </button>
          <button
            onClick={() => { if (confirm("로그아웃 하시겠어요?")) signOut(); }}
            title="로그아웃"
            className="w-9 h-9 flex items-center justify-center rounded-lg text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-slate-800 hover:text-red-500 transition-colors"
          >
            <span className="material-symbols-outlined text-xl">logout</span>
          </button>
        </div>
      </div>
    </aside>
  );
}
