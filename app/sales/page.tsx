"use client";

/**
 * 매출 관리 페이지
 *
 * - 매물 잔금일 + 수수료로 월별 매출 집계
 * - 이번 달 / 올해 / 예정 / 누적 카드
 * - 거래종류별 합계 (매매·전세·월세)
 * - 월별 막대 그래프 (단순 SVG)
 * - 월별 매출 명세 (펼침)
 * - 향후 홈 대시보드에서 SalesStats 재활용
 */

import { useState, useEffect, useMemo } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useAuth } from "@/lib/auth-context";
import { subscribeProperties, type Property } from "@/lib/properties-db";
import { subscribeContracts } from "@/lib/contracts-db";
import type { Contract } from "@/app/expiry/contracts";
import { computeSalesStats, fmtNum, formatMonthKo, formatManToKorean } from "@/lib/sales";

export default function SalesPage() {
  const router = useRouter();
  const { user, loading: authLoading, signOut } = useAuth();
  const [properties, setProperties] = useState<Property[]>([]);
  const [contracts, setContracts] = useState<Contract[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [openMonth, setOpenMonth] = useState<string | null>(null);

  useEffect(() => {
    if (!authLoading && !user) router.replace("/login?redirect=/sales");
  }, [authLoading, user, router]);

  useEffect(() => {
    if (!user) return;
    const u1 = subscribeProperties(user.agencyId, list => {
      setProperties(list);
      setLoaded(true);
    });
    const u2 = subscribeContracts(user.agencyId, setContracts);
    return () => { u1(); u2(); };
  }, [user]);

  const stats = useMemo(() => computeSalesStats(properties, contracts), [properties, contracts]);

  // 최근 12개월 막대 그래프 데이터
  const chartData = useMemo(() => {
    const months: { key: string; label: string; value: number; isFuture: boolean }[] = [];
    const today = new Date();
    const todayMonth = today.toISOString().slice(0, 7);
    for (let i = 11; i >= 0; i--) {
      const d = new Date(today.getFullYear(), today.getMonth() - i, 1);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
      months.push({
        key,
        label: `${d.getMonth() + 1}월`,
        value: stats.byMonth[key] || 0,
        isFuture: key > todayMonth,
      });
    }
    return months;
  }, [stats]);

  const maxValue = useMemo(() => Math.max(1, ...chartData.map(d => d.value)), [chartData]);

  if (authLoading || !user) {
    return <div className="min-h-screen flex items-center justify-center text-gray-400 text-sm">불러오는 중…</div>;
  }

  const thisMonthLabel = `${new Date().getMonth() + 1}월`;

  return (
    <div className="p-4 sm:p-6 lg:p-8">
      <div className="max-w-3xl mx-auto">

        {/* Stitch 톤 페이지 헤더 */}
        <section className="mb-6">
          <h2 className="flex items-center gap-2 text-2xl sm:text-3xl font-bold text-gray-900 dark:text-gray-100">
            <span className="material-symbols-outlined text-emerald-600 dark:text-emerald-400" style={{ fontSize: "2rem" }}>payments</span>
            매출 관리
          </h2>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-1.5">
            잔금일 기준으로 월별 중개 수수료 매출이 자동 집계됩니다
          </p>
        </section>

        {!loaded ? (
          <div className="text-center text-gray-400 py-12">불러오는 중…</div>
        ) : stats.count === 0 ? (
          <EmptyState />
        ) : (
          <>
            {/* 핵심 KPI 4종 */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mb-4">
              <KpiCard
                label={`이번 달 (${thisMonthLabel})`}
                value={stats.thisMonth}
                accent="emerald"
                primary
              />
              <KpiCard
                label="올해 누적"
                value={stats.thisYear}
                accent="blue"
              />
              <KpiCard
                label="예정 매출"
                value={stats.pending}
                accent="orange"
                hint="잔금일이 아직 미래인 매물"
              />
              <KpiCard
                label="전체 누적"
                value={stats.grand}
                accent="purple"
                hint={`평균 ${fmtNum(stats.avgPerDeal)}만원 / 건`}
              />
            </div>

            {/* 거래종류별 합계 */}
            <div className="bg-white rounded-3xl border border-gray-200 shadow-sm p-4 mb-4">
              <div className="text-sm font-bold text-gray-800 mb-3">🏷️ 거래종류별 매출 (누적)</div>
              <div className="grid grid-cols-3 gap-2">
                <DealCard label="매매" value={stats.byDealType.매매} accent="red" />
                <DealCard label="전세" value={stats.byDealType.전세} accent="blue" />
                <DealCard label="월세" value={stats.byDealType.월세} accent="emerald" />
              </div>
            </div>

            {/* 월별 막대 그래프 (최근 12개월) */}
            <div className="bg-white rounded-3xl border border-gray-200 shadow-sm p-4 mb-4">
              <div className="flex items-baseline justify-between mb-3">
                <div className="text-sm font-bold text-gray-800">📊 최근 12개월 매출 추이</div>
                <div className="text-[10px] text-gray-400">단위: 만원</div>
              </div>
              <div className="flex items-end gap-1 h-32 px-1">
                {chartData.map(d => (
                  <div key={d.key} className="flex-1 flex flex-col items-center justify-end h-full">
                    <div
                      className={`w-full rounded-t-md transition-all ${d.isFuture ? "bg-orange-300" : d.value === stats.thisMonth && d.value > 0 ? "bg-emerald-600" : "bg-emerald-400"}`}
                      style={{ height: `${(d.value / maxValue) * 100}%`, minHeight: d.value > 0 ? "8px" : "1px" }}
                      title={`${d.key}: ${fmtNum(d.value)}만원`}
                    />
                    <div className={`text-[9px] mt-1 ${d.isFuture ? "text-orange-500" : "text-gray-500"}`}>{d.label}</div>
                    {d.value > 0 && (
                      <div className="text-[8px] text-gray-400">{Math.round(d.value)}</div>
                    )}
                  </div>
                ))}
              </div>
              <div className="flex items-center gap-3 mt-3 pt-3 border-t border-gray-100 text-[10px]">
                <span className="inline-flex items-center gap-1">
                  <span className="w-2.5 h-2.5 rounded-sm bg-emerald-400"></span>
                  <span className="text-gray-600">실현 매출</span>
                </span>
                <span className="inline-flex items-center gap-1">
                  <span className="w-2.5 h-2.5 rounded-sm bg-emerald-600"></span>
                  <span className="text-gray-600">이번 달</span>
                </span>
                <span className="inline-flex items-center gap-1">
                  <span className="w-2.5 h-2.5 rounded-sm bg-orange-300"></span>
                  <span className="text-gray-600">예정 (미래 잔금)</span>
                </span>
              </div>
            </div>

            {/* 월별 명세 — 펼침 */}
            <div className="bg-white rounded-3xl border border-gray-200 shadow-sm p-4 mb-4">
              <div className="text-sm font-bold text-gray-800 mb-3">📋 월별 매출 명세</div>
              <div className="space-y-2">
                {stats.allMonths.map(m => {
                  const isOpen = openMonth === m;
                  const items = stats.itemsByMonth[m] || [];
                  return (
                    <div key={m} className="border border-gray-200 rounded-xl overflow-hidden">
                      <button
                        onClick={() => setOpenMonth(isOpen ? null : m)}
                        className="w-full px-3 py-2.5 flex items-center justify-between hover:bg-gray-50 transition-colors"
                      >
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-medium text-gray-500">{isOpen ? "▼" : "▶"}</span>
                          <span className="text-sm font-semibold text-gray-800">{formatMonthKo(m)}</span>
                          <span className="text-[10px] text-gray-400">({items.length}건)</span>
                        </div>
                        <span className="text-sm font-bold text-emerald-700">{fmtNum(stats.byMonth[m])}만원</span>
                      </button>
                      {isOpen && (
                        <div className="bg-gray-50 border-t border-gray-200 px-3 py-2 space-y-1.5">
                          {items.map(p => (
                            <div key={p.id} className="flex items-center gap-2 text-xs">
                              <span className="text-[10px] px-1.5 py-0.5 rounded bg-white border border-gray-200 text-gray-600 shrink-0">{p.dealType}</span>
                              <span className="text-gray-700 truncate flex-1">{p.address}</span>
                              <span className="text-[10px] text-gray-400 shrink-0">{p.balanceDate}</span>
                              <span className="text-xs font-semibold text-emerald-700 shrink-0">{fmtNum(p.commission)}만</span>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>

            {/* 향후 계획 안내 */}
            <div className="bg-blue-50 border border-blue-200 rounded-2xl px-4 py-3 text-[11px] text-blue-700">
              💡 <strong>향후 계획</strong>: 홈 대시보드에 이번 달 매출 카드 추가, 연간 목표 설정, 손익 계산, 세금 신고 자료 PDF 생성
            </div>
          </>
        )}
      </div>
    </div>
  );
}

/* ─────── 컴포넌트 ─────── */

function KpiCard({ label, value, accent, hint, primary }: {
  label: string;
  value: number;
  accent: "emerald" | "blue" | "orange" | "purple";
  hint?: string;
  primary?: boolean;
}) {
  const ACCENTS: Record<typeof accent, { bg: string; text: string; border: string }> = {
    emerald: { bg: "bg-emerald-50", text: "text-emerald-700", border: "border-emerald-200" },
    blue:    { bg: "bg-blue-50",    text: "text-blue-700",    border: "border-blue-200" },
    orange:  { bg: "bg-orange-50",  text: "text-orange-700",  border: "border-orange-200" },
    purple:  { bg: "bg-purple-50",  text: "text-purple-700",  border: "border-purple-200" },
  };
  const c = ACCENTS[accent];
  return (
    <div className={`rounded-2xl border ${primary ? "border-2" : ""} ${c.border} ${c.bg} p-3`}>
      <div className={`text-[10px] font-medium ${c.text} opacity-80`}>{label}</div>
      <div className={`text-lg sm:text-xl font-bold ${c.text} mt-1`}>
        {fmtNum(value)}<span className="text-[10px] font-normal ml-0.5 opacity-70">만</span>
      </div>
      <div className={`text-[9px] mt-0.5 ${c.text} opacity-60`}>≈ {formatManToKorean(value)}</div>
      {hint && <div className="text-[9px] text-gray-500 mt-1 leading-tight">{hint}</div>}
    </div>
  );
}

function DealCard({ label, value, accent }: { label: string; value: number; accent: "red" | "blue" | "emerald" }) {
  const ACCENTS: Record<typeof accent, { dot: string; text: string }> = {
    red:     { dot: "bg-red-400",     text: "text-red-700" },
    blue:    { dot: "bg-blue-400",    text: "text-blue-700" },
    emerald: { dot: "bg-emerald-400", text: "text-emerald-700" },
  };
  const c = ACCENTS[accent];
  return (
    <div className="border border-gray-200 rounded-xl p-2.5 text-center">
      <div className="flex items-center justify-center gap-1 mb-1">
        <span className={`w-1.5 h-1.5 rounded-full ${c.dot}`}></span>
        <span className="text-[10px] font-medium text-gray-600">{label}</span>
      </div>
      <div className={`text-base font-bold ${c.text}`}>
        {fmtNum(value)}<span className="text-[9px] font-normal text-gray-400 ml-0.5">만</span>
      </div>
    </div>
  );
}

function EmptyState() {
  return (
    <div className="bg-white rounded-3xl border border-gray-200 p-8 text-center">
      <div className="text-5xl mb-3">📊</div>
      <div className="text-base font-semibold text-gray-900 mb-1">아직 집계된 매출이 없습니다</div>
      <div className="text-xs text-gray-500 mb-4 leading-relaxed">
        내 매물 관리에서 <strong>[계약 진행]</strong> 모달을 열어<br />
        <strong>잔금일</strong>과 <strong>중개 수수료</strong>를 입력하면 여기에 자동 집계됩니다.
      </div>
      <Link href="/properties" className="inline-block text-sm px-4 py-2 rounded-full border-2 border-emerald-500 bg-emerald-50 text-emerald-700 font-semibold">
        🏘️ 매물 관리로 이동
      </Link>
    </div>
  );
}
