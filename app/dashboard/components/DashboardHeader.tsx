"use client";

/**
 * 모바일 전용 상단바 (sm 미만)
 *
 * PC(sm+)는 벤치마킹(Stripe/Linear)처럼 상단바 없이 사이드바가 로고·검색·다크모드를 전부 담당.
 * 폰은 사이드바가 없으므로 (하단 탭바 사용) 로고 + 검색 + 다크모드만 남긴 슬림 바 유지.
 */

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";

export default function DashboardHeader() {
  const router = useRouter();
  const [isDark, setIsDark] = useState(false);
  const [search, setSearch] = useState("");

  const doSearch = () => {
    const q = search.trim();
    if (!q) return;
    // 매물 페이지로 이동하며 검색어 전달 (주소·집주인·임차인·전화 통합 검색)
    router.push(`/properties?q=${encodeURIComponent(q)}`);
  };

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

  return (
    <header className="sm:hidden fixed top-0 left-0 right-0 z-40 h-14 bg-white/95 dark:bg-slate-900/95 backdrop-blur border-b border-gray-200 dark:border-slate-700">
      <div className="h-full px-4 flex items-center gap-3">
        {/* 로고 */}
        <h1 className="text-lg font-bold text-[var(--brand-blue)] dark:text-blue-400 shrink-0">
          DealDone
        </h1>

        {/* 통합 검색 */}
        <div className="flex-grow relative">
          <span onClick={doSearch} className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-[18px] text-gray-400 cursor-pointer hover:text-blue-600">search</span>
          <input
            type="text"
            value={search}
            onChange={e => setSearch(e.target.value)}
            onKeyDown={e => { if (e.key === "Enter") doSearch(); }}
            placeholder="단지·이름·전화 검색"
            className="w-full pl-9 pr-3 py-2 text-sm bg-gray-100 dark:bg-slate-800 border-0 rounded-full focus:ring-2 focus:ring-blue-500/30 text-gray-900 dark:text-gray-100 placeholder:text-gray-400"
          />
        </div>

        {/* 다크모드 */}
        <button
          onClick={toggleDark}
          title={isDark ? "라이트 모드" : "다크 모드"}
          className="p-2 rounded-full hover:bg-gray-100 dark:hover:bg-slate-800 text-gray-700 dark:text-gray-300 shrink-0"
        >
          <span className="material-symbols-outlined text-xl">{isDark ? "dark_mode" : "light_mode"}</span>
        </button>
      </div>
    </header>
  );
}
