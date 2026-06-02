"use client";

/**
 * 대시보드 전용 상단 헤더 — Stitch 시안 그대로
 * - 고정 상단 (sticky / fixed)
 * - 좌측: 로고 + 큰 글로벌 검색바
 * - 우측: 알림 / 다크모드 토글 / 사용자 카드
 */

import { useState, useEffect } from "react";
import { useAuth } from "@/lib/auth-context";

interface Props {
  alertCount?: number;
}

export default function DashboardHeader({ alertCount = 0 }: Props) {
  const { user, signOut } = useAuth();
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

  const userName = user?.displayName || user?.email?.split("@")[0] || "사용자";

  return (
    <header className="fixed top-0 left-0 right-0 z-40 h-16 bg-white/95 dark:bg-slate-900/95 backdrop-blur border-b border-gray-200 dark:border-slate-700">
      <div className="h-full px-6 flex items-center gap-8">
        {/* 로고 */}
        <h1 className="text-xl font-bold text-green-700 dark:text-green-400 shrink-0">
          미사금빛 매물 도우미
        </h1>

        {/* 글로벌 검색 — 큰 형태 */}
        <div className="flex-grow max-w-2xl relative">
          <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none">search</span>
          <input
            type="text"
            placeholder="단지명, 고객명, 또는 전화번호로 검색..."
            className="w-full pl-10 pr-4 py-2.5 text-sm bg-gray-100 dark:bg-slate-800 border-0 rounded-full focus:ring-2 focus:ring-green-500/30 text-gray-900 dark:text-gray-100 placeholder:text-gray-400"
          />
        </div>

        {/* 액션 */}
        <div className="flex items-center gap-2">
          <button
            title="알림"
            className="relative p-2 rounded-full hover:bg-gray-100 dark:hover:bg-slate-800 text-gray-700 dark:text-gray-300"
          >
            <span className="material-symbols-outlined">notifications</span>
            {alertCount > 0 && (
              <span className="absolute top-1 right-1 w-2 h-2 bg-red-500 rounded-full" />
            )}
          </button>
          <button
            onClick={toggleDark}
            title={isDark ? "라이트 모드" : "다크 모드"}
            className="p-2 rounded-full hover:bg-gray-100 dark:hover:bg-slate-800 text-gray-700 dark:text-gray-300"
          >
            <span className="material-symbols-outlined">{isDark ? "dark_mode" : "light_mode"}</span>
          </button>

          {/* 사용자 카드 */}
          <div className="hidden md:flex items-center gap-3 pl-4 ml-1 border-l border-gray-200 dark:border-slate-700">
            <div className="text-right">
              <p className="text-sm font-semibold text-gray-900 dark:text-gray-100 leading-tight">
                {userName} 사장님
              </p>
              <button
                onClick={() => { if (confirm("로그아웃?")) signOut(); }}
                className="text-[10px] text-gray-400 hover:text-green-700 dark:hover:text-green-400 uppercase tracking-wider"
              >
                Broker Manager · 로그아웃
              </button>
            </div>
            <div className="w-10 h-10 rounded-full bg-green-700 dark:bg-green-600 text-white font-bold flex items-center justify-center text-sm">
              {userName.charAt(0)}
            </div>
          </div>
        </div>
      </div>
    </header>
  );
}
