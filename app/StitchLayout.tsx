"use client";

/**
 * 공통 Stitch 셸 — dashboard와 동일한 사이드바·헤더 공유
 *
 * 사이드바 (v0 스타일):
 *  - 헤더 토글 버튼으로 켜고 끄기 (localStorage 기억)
 *  - 접힌 상태에서 좌측 가장자리에 마우스 → 자동으로 튀어나옴 (peek)
 *  - sm(640px) 미만 모바일은 사이드바 없이 하단 탭바
 */

import { useState, useEffect } from "react";
import DashboardSidebar from "./dashboard/components/DashboardSidebar";
import DashboardHeader from "./dashboard/components/DashboardHeader";

const STORAGE_KEY = "dealdone_sidebar_open";

export default function StitchLayout({ children }: { children: React.ReactNode }) {
  const [open, setOpen] = useState(true);     // 고정 열림 (토글)
  const [peek, setPeek] = useState(false);    // 가장자리 hover 임시 표시

  // 저장된 상태 복원 (hydration mismatch 방지 위해 effect에서)
  useEffect(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved === "0") setOpen(false);
    } catch {}
  }, []);

  const toggle = () => {
    setOpen(prev => {
      const next = !prev;
      try { localStorage.setItem(STORAGE_KEY, next ? "1" : "0"); } catch {}
      return next;
    });
    setPeek(false);
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-white to-emerald-50/40 dark:from-slate-900 dark:to-emerald-950/30">
      <DashboardHeader sidebarOpen={open} onToggleSidebar={toggle} />
      <DashboardSidebar open={open} peek={peek} onPeekEnd={() => setPeek(false)} />

      {/* 접힌 상태 — 좌측 가장자리 핫존 (12px): 마우스 올리면 사이드바 peek */}
      {!open && (
        <div
          className="hidden sm:block fixed left-0 top-16 bottom-0 w-3 z-40"
          onMouseEnter={() => setPeek(true)}
        />
      )}

      {/* 본문 — 사이드바 열림 여부에 따라 좌측 패딩 (부드럽게 전환) */}
      <main
        className={`pt-16 pb-20 sm:pb-0 transition-[padding] duration-200 ease-out ${
          open ? "sm:pl-56 lg:pl-64" : "sm:pl-0"
        }`}
      >
        {children}
      </main>
    </div>
  );
}
