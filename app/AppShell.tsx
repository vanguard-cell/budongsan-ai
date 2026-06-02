"use client";

/**
 * 앱 셸 — 경로별 레이아웃 분기
 * - 일반 페이지: 기존 BottomNav(모바일 탭바·PC 사이드바) + md:pl-56 padding
 * - 풀스크린 페이지(/dashboard, /login): 자체 레이아웃 유지, BottomNav 숨김
 */

import { usePathname } from "next/navigation";
import BottomNav from "./BottomNav";

const FULLSCREEN_PATTERNS = ["/dashboard", "/login"];

export default function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const isFullscreen = FULLSCREEN_PATTERNS.some(p => pathname === p || pathname.startsWith(p + "/"));

  if (isFullscreen) {
    // 자체 사이드바·헤더가 있는 페이지 — wrapper padding 없이 그대로
    return <>{children}</>;
  }

  return (
    <>
      <div className="md:pl-56">{children}</div>
      <BottomNav />
    </>
  );
}
