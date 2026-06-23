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
import {
  subscribeProperties, savePropertiesBatch, deleteProperty, sampleSalesProperties,
  type Property,
} from "@/lib/properties-db";
import { subscribeContracts } from "@/lib/contracts-db";
import type { Contract } from "@/app/expiry/contracts";
import { computeSalesStats, slicePeriodStats, fmtNum, formatManToKorean } from "@/lib/sales";
import PeriodPicker, { type Period, periodLabel } from "@/app/components/PeriodPicker";

export default function SalesPage() {
  const router = useRouter();
  const { user, loading: authLoading, signOut } = useAuth();
  const [properties, setProperties] = useState<Property[]>([]);
  const [contracts, setContracts] = useState<Contract[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [period, setPeriod] = useState<Period | null>(null);   // 선택 기간 (월/년)

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

  // 선택 기간 기본값 — 데이터 있는 최신 월 (없으면 이번 달)
  useEffect(() => {
    if (period || !loaded) return;
    const latest = stats.allMonths[0] || new Date().toISOString().slice(0, 7);
    setPeriod({ mode: "month", key: latest });
  }, [loaded, stats.allMonths, period]);

  // 선택 기간 슬라이스 — hero·거래종류·명세가 이걸로 바뀜
  const slice = useMemo(
    () => period ? slicePeriodStats(stats, period.mode, period.key) : null,
    [stats, period],
  );

  // 예시 매출 = "[예시 매출]" 태그가 달린 거래완료 매물
  const sampleProps = useMemo(() => properties.filter(p => (p.memo || "").startsWith("[예시 매출]")), [properties]);

  const loadSamples = async () => {
    if (!user) return;
    if (sampleProps.length > 0 && !confirm("이미 예시 매출이 있습니다. 더 추가할까요?")) return;
    await savePropertiesBatch(user.agencyId, sampleSalesProperties());
  };
  const clearSamples = async () => {
    if (!user || sampleProps.length === 0) return;
    if (!confirm(`예시 매출 ${sampleProps.length}건(거래완료 예시 매물)을 삭제합니다.\n실제 매물은 영향받지 않습니다. 진행할까요?`)) return;
    for (const p of sampleProps) await deleteProperty(user.agencyId, p.id);
  };

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

  const sliceTotal = slice?.total ?? 0;
  const periodTitle = period ? periodLabel(period) : "";

  // 전월 대비 증감률 — 월 모드 + 이전 달 실적 있을 때만
  const momPct = (() => {
    if (!period || period.mode !== "month") return null;
    const [y, m] = period.key.split("-").map(Number);
    const d = new Date(y, m - 2, 1);
    const prevKey = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    const prev = stats.byMonth[prevKey] || 0;
    return prev > 0 ? Math.round((sliceTotal - prev) / prev * 100) : null;
  })();

  return (
    <div>
      <div className="w-full">

        {/* Stitch 톤 페이지 헤더 */}
        <section className="flex flex-col sm:flex-row sm:justify-between sm:items-end gap-3 mb-6">
          <div>
            <h2 className="flex items-center gap-2 text-2xl sm:text-3xl font-bold text-gray-900 dark:text-gray-100">
              <span className="material-symbols-outlined text-[var(--brand-blue)] dark:text-blue-400" style={{ fontSize: "2rem" }}>payments</span>
              매출 관리
            </h2>
            <p className="text-sm text-gray-500 dark:text-gray-400 mt-1.5">
              잔금일 기준으로 월별 중개 수수료 매출이 자동 집계됩니다
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-1.5 self-start sm:self-auto">
            <button
              onClick={loadSamples}
              title="예시 매출(거래완료 매물) 5건 추가"
              className="px-3 py-2 rounded-xl border border-gray-200 dark:border-slate-700 text-gray-600 dark:text-gray-300 text-xs font-semibold hover:bg-gray-50 dark:hover:bg-slate-800 transition-colors flex items-center gap-1"
            >
              <span className="material-symbols-outlined text-base">science</span>
              <span className="hidden sm:inline">예시</span>
            </button>
            {sampleProps.length > 0 && (
              <button
                onClick={clearSamples}
                title="예시 매출만 삭제 (실제 매물 제외)"
                className="px-3 py-2 rounded-xl border border-gray-200 dark:border-slate-700 text-gray-500 hover:text-red-600 text-xs font-semibold hover:bg-gray-50 dark:hover:bg-slate-800 transition-colors flex items-center gap-1"
              >
                <span className="material-symbols-outlined text-base">delete_sweep</span>
                <span className="hidden sm:inline">예시 삭제</span>
              </button>
            )}
          </div>
        </section>

        {!loaded ? (
          <div className="text-center text-gray-400 py-12">불러오는 중…</div>
        ) : stats.count === 0 ? (
          <EmptyState onLoadSample={loadSamples} />
        ) : (
          <div className="space-y-5">
            {/* 기간 선택 — hero·거래종류·명세를 이 기간으로 */}
            <div className="bg-white dark:bg-slate-900 rounded-2xl border border-gray-200 dark:border-slate-700 shadow-sm px-4 py-3">
              {period && <PeriodPicker months={stats.allMonths} value={period} onChange={setPeriod} accent="#1D9E75" />}
            </div>

            {/* ① 히어로 — 선택 기간 매출 강조 + 보조 지표 */}
            <div className="bg-white dark:bg-slate-900 rounded-2xl border border-gray-200 dark:border-slate-700 shadow-sm p-5 sm:p-6">
              <div className="flex flex-col lg:flex-row lg:items-end lg:justify-between gap-6">
                <div>
                  <div className="text-sm text-gray-500 dark:text-gray-400">{periodTitle} 매출 <span className="text-gray-400">· {slice?.count ?? 0}건</span></div>
                  <div className="flex items-baseline gap-2 mt-1.5 flex-wrap">
                    <span className="text-4xl font-bold text-gray-900 dark:text-gray-100 tabular-nums">{fmtNum(sliceTotal)}</span>
                    <span className="text-base text-gray-500 dark:text-gray-400">만원</span>
                    {momPct !== null && (
                      <span className={`text-xs font-semibold px-2 py-1 rounded-lg ${momPct >= 0 ? "bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300" : "bg-red-50 text-red-600 dark:bg-red-950/40 dark:text-red-300"}`}>
                        {momPct >= 0 ? "▲" : "▼"} 전월 대비 {momPct >= 0 ? "+" : ""}{momPct}%
                      </span>
                    )}
                  </div>
                  <div className="text-xs text-gray-400 mt-1">≈ {formatManToKorean(sliceTotal)}</div>
                </div>
                <div className="grid grid-cols-3 gap-5 sm:gap-8 shrink-0">
                  <MiniStat label="올해 누적" value={stats.thisYear} />
                  <MiniStat label="예정 매출" value={stats.pending} accent="orange" />
                  <MiniStat label="전체 누적" value={stats.grand} sub={`총 ${stats.count}건`} />
                </div>
              </div>
            </div>

            {/* ② 월별 추이 그래프 (크게) */}
            <div className="bg-white dark:bg-slate-900 rounded-2xl border border-gray-200 dark:border-slate-700 shadow-sm p-5 sm:p-6">
              <div className="flex items-baseline justify-between mb-4">
                <div className="text-base font-bold text-gray-800 dark:text-gray-100">월별 매출 추이</div>
                <div className="text-xs text-gray-400">최근 12개월 · 단위 만원</div>
              </div>
              <div className="flex items-end gap-1.5 h-44">
                {chartData.map(d => (
                  <div key={d.key} className="flex-1 flex flex-col items-center justify-end h-full group">
                    {d.value > 0 && (
                      <div className="text-[10px] text-gray-400 mb-1 tabular-nums">{Math.round(d.value)}</div>
                    )}
                    <div
                      className={`w-full rounded-t-md transition-all ${d.isFuture ? "bg-orange-300" : d.value === stats.thisMonth && d.value > 0 ? "bg-emerald-600" : "bg-emerald-400"}`}
                      style={{ height: `${(d.value / maxValue) * 100}%`, minHeight: d.value > 0 ? "10px" : "2px" }}
                      title={`${d.key}: ${fmtNum(d.value)}만원`}
                    />
                  </div>
                ))}
              </div>
              <div className="flex gap-1.5 mt-2 border-t border-gray-100 dark:border-slate-800 pt-2">
                {chartData.map(d => (
                  <div key={d.key} className={`flex-1 text-center text-[11px] ${d.isFuture ? "text-orange-500 font-medium" : d.value === stats.thisMonth && d.value > 0 ? "text-emerald-600 font-semibold" : "text-gray-400"}`}>{d.label}</div>
                ))}
              </div>
              <div className="flex items-center gap-4 mt-3 text-xs text-gray-600 dark:text-gray-300">
                <span className="inline-flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-sm bg-emerald-400"></span>실현</span>
                <span className="inline-flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-sm bg-emerald-600"></span>이번 달</span>
                <span className="inline-flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-sm bg-orange-300"></span>예정 (미래 잔금)</span>
              </div>
            </div>

            {/* ③ 거래종류 비중(기간) + 기간 명세 */}
            <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)] gap-5">
              {/* 거래종류 비중 — 선택 기간 */}
              <div className="bg-white dark:bg-slate-900 rounded-2xl border border-gray-200 dark:border-slate-700 shadow-sm p-5 sm:p-6">
                <div className="text-base font-bold text-gray-800 dark:text-gray-100 mb-1">거래종류 비중</div>
                <div className="text-xs text-gray-400 mb-4">{periodTitle} 기준</div>
                {slice && slice.total > 0 ? (
                  <div className="space-y-3.5">
                    <DealBar label="매매" value={slice.byDealType.매매} total={slice.total} color="#E24B4A" />
                    <DealBar label="전세" value={slice.byDealType.전세} total={slice.total} color="#378ADD" />
                    <DealBar label="월세" value={slice.byDealType.월세} total={slice.total} color="#1D9E75" />
                  </div>
                ) : (
                  <div className="text-center text-xs text-gray-400 py-8">이 기간엔 매출이 없어요</div>
                )}
              </div>

              {/* 기간 명세 — 선택 기간의 거래 목록 */}
              <div className="bg-white dark:bg-slate-900 rounded-2xl border border-gray-200 dark:border-slate-700 shadow-sm p-5 sm:p-6">
                <div className="flex items-baseline justify-between mb-3">
                  <div className="text-base font-bold text-gray-800 dark:text-gray-100">명세 · {periodTitle}</div>
                  <div className="text-xs text-gray-400">{slice?.count ?? 0}건 · {fmtNum(sliceTotal)}만</div>
                </div>
                {slice && slice.items.length > 0 ? (
                  <div className="divide-y divide-gray-100 dark:divide-slate-800 max-h-[360px] overflow-y-auto">
                    {slice.items.map(p => (
                      <div key={p.id} className="flex items-center gap-2 text-xs py-2.5">
                        <span className="text-[10px] px-1.5 py-0.5 rounded bg-gray-50 dark:bg-slate-800 border border-gray-200 dark:border-slate-700 text-gray-600 dark:text-gray-300 shrink-0">{p.dealType}</span>
                        <span className="text-gray-700 dark:text-gray-300 truncate flex-1">{p.address}</span>
                        <span className="text-[10px] text-gray-400 shrink-0">{p.balanceDate}</span>
                        <span className="text-xs font-semibold text-emerald-700 dark:text-emerald-400 shrink-0 tabular-nums">{fmtNum(p.commission)}만</span>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="text-center text-xs text-gray-400 py-8">이 기간엔 거래가 없어요 — 위에서 다른 기간을 눌러보세요</div>
                )}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

/* ─────── 컴포넌트 ─────── */

/* 히어로 옆 보조 지표 */
function MiniStat({ label, value, sub, accent }: {
  label: string;
  value: number;
  sub?: string;
  accent?: "orange";
}) {
  const valColor = accent === "orange" ? "text-orange-600 dark:text-orange-400" : "text-gray-900 dark:text-gray-100";
  return (
    <div>
      <div className="text-xs text-gray-400 dark:text-gray-500 whitespace-nowrap">{label}</div>
      <div className={`text-lg font-bold tabular-nums mt-0.5 ${valColor}`}>
        {fmtNum(value)}<span className="text-[11px] font-normal text-gray-400 ml-0.5">만</span>
      </div>
      {sub && <div className="text-[10px] text-gray-400 mt-0.5">{sub}</div>}
    </div>
  );
}

/* 거래종류 비중 — 가로 막대 */
function DealBar({ label, value, total, color }: { label: string; value: number; total: number; color: string }) {
  const pct = total > 0 ? Math.round((value / total) * 100) : 0;
  return (
    <div>
      <div className="flex justify-between items-baseline text-sm mb-1.5">
        <span className="text-gray-700 dark:text-gray-300 font-medium">{label}</span>
        <span className="text-gray-500 dark:text-gray-400 tabular-nums">{fmtNum(value)}만 · {pct}%</span>
      </div>
      <div className="h-2 rounded-full bg-gray-100 dark:bg-slate-800 overflow-hidden">
        <div className="h-2 rounded-full transition-all" style={{ width: `${pct}%`, background: color }} />
      </div>
    </div>
  );
}

function EmptyState({ onLoadSample }: { onLoadSample: () => void }) {
  return (
    <div className="bg-white rounded-xl border border-gray-200 p-8 text-center">
      <div className="text-5xl mb-3">📊</div>
      <div className="text-base font-semibold text-gray-900 mb-1">아직 집계된 매출이 없습니다</div>
      <div className="text-xs text-gray-500 mb-4 leading-relaxed">
        내 매물 관리에서 <strong>[계약 진행]</strong> 모달을 열어<br />
        <strong>잔금일</strong>과 <strong>중개 수수료</strong>를 입력하면 여기에 자동 집계됩니다.
      </div>
      <div className="flex flex-wrap items-center justify-center gap-2">
        <Link href="/properties" className="inline-block text-sm px-4 py-2 rounded-full border-2 border-emerald-500 bg-emerald-50 text-emerald-700 font-semibold">
          🏘️ 매물 관리로 이동
        </Link>
        <button onClick={onLoadSample} className="text-sm px-4 py-2 rounded-full border border-gray-300 text-gray-600 font-semibold flex items-center gap-1">
          <span className="material-symbols-outlined text-base">science</span>
          예시 데이터 넣기
        </button>
      </div>
    </div>
  );
}
