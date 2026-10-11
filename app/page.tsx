"use client";

/**
 * 진입 페이지 (/) — 사용자가 앱 열면 가장 먼저 도착하는 곳
 *
 * - 로그인 OK → 마지막으로 본 페이지로 이동 (없으면 /properties 내 매물)
 * - 로그인 X  → /login?redirect=/properties
 *
 * AI 문구 생성 페이지는 /ai-content 로 이동됨.
 */

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth-context";

export default function RootRedirect() {
  const router = useRouter();
  const { user, loading } = useAuth();

  useEffect(() => {
    if (loading) return;
    if (user) {
      let target = "/properties";
      try {
        const last = localStorage.getItem("lastPage");
        if (last && last.startsWith("/") && last !== "/" && last !== "/login") target = last;
      } catch {}
      router.replace(target);
    } else {
      router.replace("/login?redirect=/properties");
    }
  }, [user, loading, router]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-white dark:bg-slate-900">
      <div className="text-center">
        <div className="inline-block w-10 h-10 border-3 border-blue-200 border-t-[#2383E2] rounded-full animate-spin mb-3" />
        <p className="text-sm text-gray-500 dark:text-gray-400">DealDone 불러오는 중…</p>
      </div>
    </div>
  );
}
