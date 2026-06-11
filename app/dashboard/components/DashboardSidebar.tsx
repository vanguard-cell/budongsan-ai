"use client";

/**
 * 사이드바 — 딥 네이비블루 (DealDone 리디자인 2026-06)
 * - 배경 #16284A(--brand-navy), 메뉴 텍스트 #9BB4D4, 활성 메뉴 #2563EB + 흰 글씨
 * - 라이트/다크 모드 공통 네이비 (사이드바는 항상 어두운 톤)
 * - 토글(open) + 가장자리 peek 동작은 기존 그대로
 */

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useAuth } from "@/lib/auth-context";
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
  { href: "/customers",  icon: "group",           label: "손님 관리" },
  { href: "/schedule",     icon: "calendar_month",  label: "스케줄" },
  { href: "/sales",        icon: "payments",        label: "매출 관리" },
  { href: "/market-price", icon: "trending_up",     label: "실거래 최고가" },
  { href: "/ai-content",   icon: "auto_awesome",    label: "AI 문구 생성" },
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
}

export default function DashboardSidebar({ open = true, peek = false, onPeekEnd }: SidebarProps) {
  const pathname = usePathname();
  const { user } = useAuth();
  const isAdmin = user?.email === ADMIN_EMAIL;
  const subNav = isAdmin ? [...SUB_NAV, ADMIN_NAV] : SUB_NAV;

  const isActive = (href: string) => {
    if (href === "/") return pathname === "/";
    return pathname === href || pathname.startsWith(href + "/");
  };

  const userName = user?.displayName || user?.email?.split("@")[0] || "사용자";

  // open: 평소처럼 고정 / peek: 오버레이로 떠서 그림자 / 둘 다 아니면 화면 밖
  const visible = open || peek;

  return (
    <aside
      onMouseLeave={() => { if (!open && peek) onPeekEnd?.(); }}
      className={`hidden sm:flex flex-col fixed left-0 top-16 h-[calc(100vh-64px)] w-56 lg:w-64 bg-[var(--brand-navy)] p-4 transition-transform duration-200 ease-out ${
        visible ? "translate-x-0" : "-translate-x-full"
      } ${!open && peek ? "z-50 shadow-2xl" : "z-30"}`}
    >
      {/* 주 메뉴 */}
      <nav className="flex-grow space-y-1 overflow-y-auto">
        {NAV.map(item => {
          const active = isActive(item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`flex items-center gap-3 px-4 py-3 rounded-xl transition-all cursor-pointer
                ${active
                  ? "bg-[var(--brand-blue)] text-white font-bold shadow-md shadow-blue-900/30"
                  : "text-[var(--sidebar-text)] hover:bg-white/8 hover:text-white"
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
        <div className="pt-4 mt-4 border-t border-white/10 space-y-1">
          {subNav.map(item => {
            const active = isActive(item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`flex items-center gap-3 px-4 py-2.5 rounded-xl transition-colors text-sm
                  ${active
                    ? "bg-[var(--brand-blue)] text-white font-bold"
                    : "text-[var(--sidebar-text)]/80 hover:bg-white/8 hover:text-white"
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
      <div className="pt-4 mt-4 border-t border-white/10">
        <Link
          href="/properties"
          className="w-full flex items-center justify-center gap-2 py-3 bg-[var(--brand-blue)] text-white rounded-xl shadow-md shadow-blue-900/30 hover:brightness-110 active:scale-95 transition-all mb-3"
        >
          <span className="material-symbols-outlined text-xl">edit_note</span>
          <span className="font-bold text-sm">빠른 등록</span>
        </Link>
        <div className="flex items-center gap-3 px-2">
          <div className="w-10 h-10 rounded-full bg-[var(--brand-blue)] flex items-center justify-center text-white font-bold shrink-0">
            {userName.charAt(0)}
          </div>
          <div className="min-w-0">
            <p className="text-sm font-semibold text-white truncate">{userName}</p>
            <p className="text-[11px] text-[var(--sidebar-text)] truncate">미사금빛 부동산</p>
          </div>
        </div>
      </div>
    </aside>
  );
}
