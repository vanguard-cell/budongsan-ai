"use client";

/**
 * 진입 페이지 (/) — 사용자가 앱 열면 가장 먼저 도착하는 곳
 *
 * - 로그인 OK → /dashboard 로 자동 이동
 * - 로그인 X  → /login?redirect=/dashboard
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
      router.replace("/dashboard");
    } else {
      router.replace("/login?redirect=/dashboard");
    }
  }, [user, loading, router]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-white to-emerald-50 dark:from-slate-900 dark:to-emerald-950/30">
      <div className="text-center">
        <div className="inline-block w-10 h-10 border-3 border-emerald-200 border-t-emerald-600 rounded-full animate-spin mb-3" />
        <p className="text-sm text-gray-500 dark:text-gray-400">미사금빛 매물 도우미 불러오는 중…</p>
      </div>
    </div>
  );
}
