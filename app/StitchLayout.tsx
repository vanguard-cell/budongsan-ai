"use client";

/**
 * 공통 셸 — 벤치마킹(Stripe/Linear/Notion/Toss) 스타일
 *
 * PC(sm+): 상단바 없음. 좌측 풀하이트 사이드바가 로고·검색·메뉴·사용자·다크모드 전부 담당.
 *  - 사이드바 상단 토글 버튼으로 접기 (localStorage 기억)
 *  - 접힌 상태: 좌측 상단 플로팅 버튼 or 좌측 가장자리 hover(peek)로 다시 열기
 * 폰(sm 미만): 슬림 상단바(로고+검색+다크모드) + 하단 탭바
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
    <div className="min-h-screen bg-white dark:bg-slate-950">
      {/* 폰 전용 슬림 상단바 */}
      <DashboardHeader />

      <DashboardSidebar open={open} peek={peek} onPeekEnd={() => setPeek(false)} onToggle={toggle} />

      {/* 접힌 상태 — 좌측 상단 플로팅 펼침 버튼 */}
      {!open && !peek && (
        <button
          onClick={toggle}
          title="사이드바 펼치기"
          className="hidden sm:flex fixed top-3 left-3 z-40 w-9 h-9 items-center justify-center rounded-lg bg-white dark:bg-slate-800 border border-gray-200 dark:border-slate-700 shadow-md text-gray-600 dark:text-gray-300 hover:text-[var(--brand-blue)] transition-colors"
        >
          <span className="material-symbols-outlined text-xl">menu</span>
        </button>
      )}

      {/* 접힌 상태 — 좌측 가장자리 핫존 (12px): 마우스 올리면 사이드바 peek */}
      {!open && (
        <div
          className="hidden sm:block fixed left-0 top-0 bottom-0 w-3 z-40"
          onMouseEnter={() => setPeek(true)}
        />
      )}

      {/* 본문 — 폰은 상단바(56px)+탭바, PC는 사이드바 패딩만 */}
      <main
        className={`pt-14 sm:pt-0 pb-20 sm:pb-0 transition-[padding] duration-200 ease-out ${
          open ? "sm:pl-56 lg:pl-64" : "sm:pl-0"
        }`}
      >
        {children}
      </main>
    </div>
  );
}
