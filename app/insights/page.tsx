"use client";

/**
 * 인사이트 — Pipedrive식 영업 대시보드
 *  ① 수익(이번달/올해/누적 + 연도별)  ② 처리현황(진행/매칭/성사/실패)
 *  ③ 파이프라인 퍼널(문의→계약 전환율)  ④ 실패 사유 분포  ⑤ 이번 달 활동
 */

import { useState, useEffect, useMemo } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth-context";
import { subscribeCustomers } from "@/lib/customers-db";
import { subscribeProperties, type Property } from "@/lib/properties-db";
import { subscribeContracts } from "@/lib/contracts-db";
import type { Contract } from "@/app/expiry/contracts";
import { computeSalesStats, fmtNum, formatManToKorean } from "@/lib/sales";
import { effectiveStage, STAGE_FLOW, STAGE_META, type Customer } from "@/app/customers/customer-types";

export default function InsightsPage() {
  const router = useRouter();
  const { user, loading: authLoading } = useAuth();
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [properties, setProperties] = useState<Property[]>([]);
  const [contracts, setContracts] = useState<Contract[]>([]);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => { if (!authLoading && !user) router.replace("/login?redirect=/insights"); }, [authLoading, user, router]);
  useEffect(() => {
    if (!user) return;
    const u1 = subscribeCustomers(user.agencyId, list => { setCustomers(list); setLoaded(true); });
    const u2 = subscribeProperties(user.agencyId, setProperties);
    const u3 = subscribeContracts(user.agencyId, setContracts);
    return () => { u1(); u2(); u3(); };
  }, [user]);

  const sales = useMemo(() => computeSalesStats(properties, contracts), [properties, contracts]);

  const byYear = useMemo(() => {
    const m: Record<string, number> = {};
    for (const [ym, v] of Object.entries(sales.byMonth)) { const y = ym.slice(0, 4); m[y] = (m[y] || 0) + v; }
    return Object.entries(m).sort((a, b) => b[0].localeCompare(a[0]));
  }, [sales]);

  // 처리현황
  const status = useMemo(() => ({
    active: customers.filter(c => c.status === "active").length,
    matched: customers.filter(c => c.status === "matched").length,
    closed: customers.filter(c => c.status === "closed").length,
    lost: customers.filter(c => c.status === "lost").length,
  }), [customers]);

  // 퍼널 — 단계별 "도달" 수 (실패 제외)
  const funnel = useMemo(() => {
    const nonLost = customers.filter(c => effectiveStage(c) !== "lost");
    const idxOf = (c: Customer) => STAGE_FLOW.indexOf(effectiveStage(c));
    return STAGE_FLOW.map((st, i) => ({ stage: st, count: nonLost.filter(c => idxOf(c) >= i).length }));
  }, [customers]);

  // 실패 사유 분포
  const failReasons = useMemo(() => {
    const m: Record<string, number> = {};
    let total = 0;
    for (const c of customers) {
      if (c.status !== "lost") continue;
      total++;
      const drops = (c.history || []).filter(e => e.kind === "drop");
      const last = drops[drops.length - 1];
      const reason = (last?.reason || "기타").trim() || "기타";
      m[reason] = (m[reason] || 0) + 1;
    }
    return { total, list: Object.entries(m).sort((a, b) => b[1] - a[1]) };
  }, [customers]);

  // 이번 달 활동
  const activity = useMemo(() => {
    const ym = new Date().toISOString().slice(0, 7);
    let call = 0, visit = 0, shown = 0;
    for (const c of customers) for (const e of c.history || []) {
      if (new Date(e.at).toISOString().slice(0, 7) !== ym) continue;
      if (e.kind === "call" || e.kind === "sms") call++;
      else if (e.kind === "visit") visit++;
      else if (e.kind === "shown") shown++;
    }
    const today = new Date().toISOString().slice(0, 10);
    const upcoming = customers.filter(c => c.nextFollowUp && c.nextFollowUp >= today && c.status !== "closed" && c.status !== "lost").length;
    return { call, visit, shown, upcoming };
  }, [customers]);

  if (authLoading || !user) return <div className="min-h-screen flex items-center justify-center text-gray-400 text-sm">불러오는 중…</div>;

  const thisMonthLabel = `${new Date().getMonth() + 1}월`;
  const maxFunnel = Math.max(1, funnel[0]?.count || 1);

  return (
    <div>
      <section className="flex flex-col sm:flex-row sm:justify-between sm:items-end gap-3 mb-6">
        <div>
          <h2 className="flex items-center gap-2 text-2xl sm:text-3xl font-bold text-gray-900 dark:text-gray-100">
            <span className="material-symbols-outlined text-[var(--brand-blue)] dark:text-blue-400" style={{ fontSize: "2rem" }}>insights</span>
            인사이트
          </h2>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-1.5">문의부터 계약까지 — 처리현황 · 전환율 · 수익 한눈에</p>
        </div>
        <div className="flex gap-1.5 self-start sm:self-auto">
          <Link href="/customers" className="text-xs px-3 py-2 rounded-lg border border-gray-200 dark:border-slate-700 hover:border-blue-400 hover:text-blue-600 transition-colors">손님 관리</Link>
          <Link href="/sales" className="text-xs px-3 py-2 rounded-lg border border-gray-200 dark:border-slate-700 hover:border-blue-400 hover:text-blue-600 transition-colors">매출 상세</Link>
        </div>
      </section>

      {!loaded ? (
        <div className="text-center text-gray-400 py-16">불러오는 중…</div>
      ) : (
        <div className="space-y-5">

          {/* ① 수익 */}
          <div className="bg-white dark:bg-slate-900 rounded-2xl border border-gray-200 dark:border-slate-700 shadow-sm p-5 sm:p-6">
            <div className="flex flex-col lg:flex-row lg:items-end lg:justify-between gap-5">
              <div>
                <div className="text-sm text-gray-500 dark:text-gray-400">이번 달 매출 · {thisMonthLabel}</div>
                <div className="flex items-baseline gap-2 mt-1">
                  <span className="text-4xl font-bold text-gray-900 dark:text-gray-100 tabular-nums">{fmtNum(sales.thisMonth)}</span>
                  <span className="text-base text-gray-500">만원</span>
                </div>
                <div className="text-xs text-gray-400 mt-0.5">≈ {formatManToKorean(sales.thisMonth)}</div>
              </div>
              <div className="grid grid-cols-3 gap-5 sm:gap-8 shrink-0">
                <Mini label="올해 누적" value={sales.thisYear} />
                <Mini label="예정 매출" value={sales.pending} accent="#BA7517" />
                <Mini label="전체 누적" value={sales.grand} />
              </div>
            </div>
            {byYear.length > 0 && (
              <div className="mt-4 pt-4 border-t border-gray-100 dark:border-slate-800 flex flex-wrap gap-x-6 gap-y-2">
                {byYear.map(([y, v]) => (
                  <div key={y} className="text-sm"><span className="text-gray-400">{y}년</span> <span className="font-bold text-gray-800 dark:text-gray-200 tabular-nums">{fmtNum(v)}만</span></div>
                ))}
              </div>
            )}
          </div>

          {/* ② 처리현황 */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
            <StatusCard label="진행 중" value={status.active} color="#2383E2" />
            <StatusCard label="협상·매칭" value={status.matched} color="#BA7517" />
            <StatusCard label="계약 성사" value={status.closed} color="#1D9E75" />
            <StatusCard label="실패·이탈" value={status.lost} color="#A32D2D" />
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-[1.4fr_1fr] gap-5">
            {/* ③ 퍼널 */}
            <div className="bg-white dark:bg-slate-900 rounded-2xl border border-gray-200 dark:border-slate-700 shadow-sm p-5 sm:p-6">
              <div className="text-base font-bold text-gray-800 dark:text-gray-100 mb-4">파이프라인 퍼널 (문의 → 계약)</div>
              <div className="space-y-2.5">
                {funnel.map((f, i) => {
                  const meta = STAGE_META[f.stage];
                  const prev = i > 0 ? funnel[i - 1].count : null;
                  const conv = prev && prev > 0 ? Math.round((f.count / prev) * 100) : null;
                  return (
                    <div key={f.stage}>
                      <div className="flex items-center justify-between text-[12px] mb-1">
                        <span className="font-medium" style={{ color: meta.fg }}>{meta.label}</span>
                        <span className="text-gray-500">{f.count}명{conv !== null && <span className="text-gray-400"> · 전환 {conv}%</span>}</span>
                      </div>
                      <div className="h-5 rounded-lg bg-gray-100 dark:bg-slate-800 overflow-hidden">
                        <div className="h-5 rounded-lg transition-all" style={{ width: `${Math.max(3, (f.count / maxFunnel) * 100)}%`, background: meta.fg }} />
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* ④ 실패 사유 */}
            <div className="bg-white dark:bg-slate-900 rounded-2xl border border-gray-200 dark:border-slate-700 shadow-sm p-5 sm:p-6">
              <div className="text-base font-bold text-gray-800 dark:text-gray-100 mb-1">실패 사유</div>
              <div className="text-xs text-gray-400 mb-3">총 {failReasons.total}건 이탈</div>
              {failReasons.list.length === 0 ? (
                <p className="text-[12px] text-gray-400 py-4">아직 이탈 사유 데이터가 없습니다.</p>
              ) : (
                <div className="space-y-2.5">
                  {failReasons.list.map(([reason, n]) => {
                    const pct = failReasons.total > 0 ? Math.round((n / failReasons.total) * 100) : 0;
                    return (
                      <div key={reason}>
                        <div className="flex justify-between text-[12px] mb-1"><span className="text-gray-700 dark:text-gray-300 truncate">{reason}</span><span className="text-gray-400 shrink-0 ml-2">{n}건 · {pct}%</span></div>
                        <div className="h-2 rounded-full bg-gray-100 dark:bg-slate-800 overflow-hidden"><div className="h-2 rounded-full bg-red-400" style={{ width: `${pct}%` }} /></div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>

          {/* ⑤ 이번 달 활동 */}
          <div className="bg-white dark:bg-slate-900 rounded-2xl border border-gray-200 dark:border-slate-700 shadow-sm p-5 sm:p-6">
            <div className="text-base font-bold text-gray-800 dark:text-gray-100 mb-3">이번 달 활동</div>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
              <ActivityCard icon="call" label="전화·문자" value={activity.call} />
              <ActivityCard icon="directions_walk" label="집보기 동행" value={activity.visit} />
              <ActivityCard icon="visibility" label="매물 보여줌" value={activity.shown} />
              <ActivityCard icon="event_upcoming" label="예정 후속연락" value={activity.upcoming} accent />
            </div>
          </div>

          <p className="text-center text-[11px] text-gray-400 leading-relaxed">
            📊 퍼널·활동·실패사유는 손님 활동 기록 기반 — 기능 추가 시점부터 누적됩니다 · 매출은 실시간 집계
          </p>
        </div>
      )}
    </div>
  );
}

function Mini({ label, value, accent }: { label: string; value: number; accent?: string }) {
  return (
    <div>
      <div className="text-xs text-gray-400 whitespace-nowrap">{label}</div>
      <div className="text-lg font-bold tabular-nums mt-0.5" style={{ color: accent || undefined }}>{fmtNum(value)}<span className="text-[11px] font-normal text-gray-400 ml-0.5">만</span></div>
    </div>
  );
}
function StatusCard({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <div className="bg-white dark:bg-slate-900 rounded-2xl border border-gray-200 dark:border-slate-700 p-3 text-center">
      <div className="text-2xl font-bold tabular-nums" style={{ color }}>{value}</div>
      <div className="text-[11px] text-gray-500 mt-0.5">{label}</div>
    </div>
  );
}
function ActivityCard({ icon, label, value, accent }: { icon: string; label: string; value: number; accent?: boolean }) {
  return (
    <div className={`rounded-xl border p-3 ${accent ? "border-indigo-200 bg-indigo-50 dark:bg-indigo-950/30 dark:border-indigo-900/40" : "border-gray-200 dark:border-slate-700"}`}>
      <div className="flex items-center gap-1.5 text-[11px] text-gray-500 dark:text-gray-400 mb-1">
        <span className="material-symbols-outlined text-[15px]">{icon}</span>{label}
      </div>
      <div className={`text-xl font-bold tabular-nums ${accent ? "text-indigo-700 dark:text-indigo-300" : "text-gray-900 dark:text-gray-100"}`}>{value}</div>
    </div>
  );
}
