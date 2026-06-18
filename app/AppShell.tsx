"use client";

/**
 * 앱 셸 — 경로별 레이아웃 분기
 *
 * - /login: 완전 풀스크린 (네비 없음)
 * - /dashboard: 자체 사이드바·헤더 (PC) + 모바일은 BottomNav 탭바 유지
 *   · md:pl-56 padding 없음 (자체 lg:pl-64로 처리)
 * - 그 외: 기존 BottomNav (PC 사이드바 + 모바일 탭바) + md:pl-56
 */

import { usePathname } from "next/navigation";
import BottomNav from "./BottomNav";

export default function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const isLogin = pathname === "/login";
  // Stitch 톤 적용된 페이지들 (자체 사이드바·헤더 보유 — StitchLayout)
  const isFullscreen =
    pathname.startsWith("/dashboard") ||
    pathname.startsWith("/properties") ||
    pathname.startsWith("/expiry") ||
    pathname.startsWith("/customers") ||
    pathname.startsWith("/schedule") ||
    pathname.startsWith("/sales") ||
    pathname.startsWith("/insights") ||
    pathname.startsWith("/ai-content") ||
    pathname.startsWith("/market-price") ||
    pathname.startsWith("/team");

  if (isLogin) {
    return <>{children}</>;
  }

  return (
    <>
      {/* 풀스크린(자체 사이드바·헤더) 페이지는 padding 없이, 일반 페이지는 sm:pl-56 */}
      <div className={isFullscreen ? "" : "sm:pl-56"}>
        {children}
      </div>
      {/* BottomNav 내부에서 PC 사이드바는 풀스크린 시 숨기지만, 모바일 탭바는 항상 표시 */}
      <BottomNav />
    </>
  );
}
