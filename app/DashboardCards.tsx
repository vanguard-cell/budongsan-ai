"use client";

/**
 * 메인 페이지 상단 대시보드 카드
 *
 * - 로그인된 경우: 만기 임박 / 후속 연락 필요 건수를 실시간 표시
 * - 비로그인: 로그인 유도 + 기능 소개
 *
 * 어머니 우선순위 (인터뷰 BEST 1·2 반영):
 *   1) 만기 관리 — 4989 공백
 *   2) 손님 사후관리 — BEST 1 pain point
 *   3) 매물 문구 — 기존 기능
 */

import { useEffect, useState } from "react";
import Link from "next/link";
import { useAuth } from "@/lib/auth-context";
import { subscribeContracts } from "@/lib/contracts-db";
import { subscribeCustomers } from "@/lib/customers-db";
import { dDay, severityOf } from "./expiry/contracts";
import { followUpDDay, followUpSeverity } from "./customers/customer-types";

interface Counts {
  expiryUrgent: number;     // D-30 이내
  expiryWarning: number;    // D-60 이내
  followupUrgent: number;   // 후속 연락 오늘·지남
  followupSoon: number;     // 3일 이내
}

export default function DashboardCards() {
  const { user, loading } = useAuth();
  const [counts, setCounts] = useState<Counts | null>(null);

  useEffect(() => {
    if (!user) {
      setCounts(null);
      return;
    }

    const next: Counts = { expiryUrgent: 0, expiryWarning: 0, followupUrgent: 0, followupSoon: 0 };

    const unsubContracts = subscribeContracts(user.agencyId, (list) => {
      let urgent = 0, warning = 0;
      for (const c of list) {
        if (c.status !== "active") continue;
        const s = severityOf(dDay(c.endDate));
        if (s === "danger") urgent++;
        else if (s === "warning") warning++;
      }
      next.expiryUrgent = urgent;
      next.expiryWarning = warning;
      setCounts({ ...next });
    });

    const unsubCustomers = subscribeCustomers(user.agencyId, (list) => {
      let urgent = 0, soon = 0;
      for (const c of list) {
        if (c.status !== "active") continue;
        const s = followUpSeverity(followUpDDay(c.nextFollowUp));
        if (s === "overdue" || s === "today") urgent++;
        else if (s === "soon") soon++;
      }
      next.followupUrgent = urgent;
      next.followupSoon = soon;
      setCounts({ ...next });
    });

    return () => {
      unsubContracts();
      unsubCustomers();
    };
  }, [user]);

  if (loading) {
    return (
      <div className="mb-5 text-center text-gray-400 text-sm py-6">불러오는 중…</div>
    );
  }

  if (!user) {
    return (
      <div className="mb-5">
        <div className="bg-gradient-to-br from-blue-50 to-blue-100 border border-blue-200 rounded-xl p-5 text-center">
          <div className="text-3xl mb-2">☁️</div>
          <div className="text-sm font-semibold text-gray-900 mb-1">
            로그인하시면 PC·폰 자동 동기화됩니다
          </div>
          <div className="text-[11px] text-gray-600 mb-3">
            만기 관리 · 손님 관리는 로그인이 필요해요
          </div>
          <Link
            href="/login"
            className="inline-block text-xs sm:text-sm px-5 py-2 rounded-full bg-blue-600 text-white font-semibold hover:bg-blue-700 transition-colors"
          >
            로그인 / 회원가입
          </Link>
        </div>
      </div>
    );
  }

  const showUrgentAlert =
    (counts?.expiryUrgent ?? 0) > 0 ||
    (counts?.followupUrgent ?? 0) > 0;

  return (
    <div className="mb-5 space-y-3">
      {/* 긴급 알림 배너 */}
      {showUrgentAlert && (
        <div className="bg-gradient-to-r from-red-50 to-orange-50 border-2 border-red-200 rounded-2xl p-4">
          <div className="flex items-center gap-2 mb-2">
            <div className="w-2 h-2 bg-red-500 rounded-full animate-pulse"></div>
            <span className="text-xs font-bold text-red-700 tracking-wider">오늘 처리 권장</span>
          </div>
          <div className="space-y-1.5 text-sm">
            {(counts?.expiryUrgent ?? 0) > 0 && (
              <Link
                href="/expiry"
                className="flex items-center justify-between gap-2 group"
              >
                <span className="text-gray-800">
                  🔴 만기 D-30 이내 <b className="text-red-600">{counts!.expiryUrgent}건</b>
                </span>
                <span className="text-xs text-gray-500 group-hover:text-blue-600">바로 가기 →</span>
              </Link>
            )}
            {(counts?.followupUrgent ?? 0) > 0 && (
              <Link
                href="/customers"
                className="flex items-center justify-between gap-2 group"
              >
                <span className="text-gray-800">
                  🟠 후속 연락 필요 <b className="text-red-600">{counts!.followupUrgent}명</b>
                </span>
                <span className="text-xs text-gray-500 group-hover:text-blue-600">바로 가기 →</span>
              </Link>
            )}
          </div>
        </div>
      )}

      {/* 3개 진입 카드 */}
      <div className="grid grid-cols-3 gap-2 sm:gap-3">
        <Card
          href="/expiry"
          icon="⏰"
          title="만기 관리"
          count={counts ? (counts.expiryUrgent + counts.expiryWarning) : null}
          countLabel="긴급+주의"
          accent={counts && counts.expiryUrgent > 0 ? "red" : "blue"}
        />
        <Card
          href="/customers"
          icon="👥"
          title="손님 관리"
          count={counts ? (counts.followupUrgent + counts.followupSoon) : null}
          countLabel="후속 필요"
          accent={counts && counts.followupUrgent > 0 ? "red" : "blue"}
        />
        <Card
          href="#매물도우미"
          icon="🏠"
          title="매물 문구"
          count={null}
          countLabel="AI 자동생성"
          accent="blue"
          scrollTo={true}
        />
      </div>
    </div>
  );
}

function Card({
  href, icon, title, count, countLabel, accent, scrollTo,
}: {
  href: string;
  icon: string;
  title: string;
  count: number | null;
  countLabel: string;
  accent: "red" | "blue";
  scrollTo?: boolean;
}) {
  const baseCls =
    "block rounded-2xl border p-3 sm:p-4 text-center transition-colors hover:border-blue-400 hover:shadow-sm";
  const cls = accent === "red"
    ? `${baseCls} bg-red-50/60 border-red-200`
    : `${baseCls} bg-white border-gray-200`;

  const handleClick = (e: React.MouseEvent) => {
    if (scrollTo) {
      e.preventDefault();
      const target = document.getElementById("매물도우미");
      if (target) target.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  };

  const content = (
    <>
      <div className="text-2xl sm:text-3xl mb-1">{icon}</div>
      <div className="text-xs sm:text-sm font-bold text-gray-900 mb-0.5">{title}</div>
      {count !== null ? (
        <div className="text-[10px] sm:text-[11px] text-gray-500">
          <span className={accent === "red" ? "text-red-600 font-bold" : "text-blue-600 font-bold"}>
            {count}
          </span>{" "}
          {countLabel}
        </div>
      ) : (
        <div className="text-[10px] sm:text-[11px] text-gray-500">{countLabel}</div>
      )}
    </>
  );

  if (scrollTo) {
    return (
      <a href={href} onClick={handleClick} className={cls}>
        {content}
      </a>
    );
  }

  return (
    <Link href={href} className={cls}>
      {content}
    </Link>
  );
}
