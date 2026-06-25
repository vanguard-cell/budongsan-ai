"use client";

/**
 * 인사이트 — Pipedrive식 영업 대시보드
 *  ① 수익(이번달/올해/누적 + 연도별)  ② 처리현황(진행/매칭/성사/실패)
 *  ③ 파이프라인 퍼널(문의→계약 전환율)  ④ 실패 사유 분포  ⑤ 이번 달 활동
 */

import { useState, useEffect, useMemo, Fragment } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useAuth, recordFeatureUse } from "@/lib/auth-context";
import { subscribeCustomers } from "@/lib/customers-db";
import { subscribeProperties, type Property } from "@/lib/properties-db";
import { subscribeContracts } from "@/lib/contracts-db";
import type { Contract } from "@/app/expiry/contracts";
import { computeSalesStats, fmtNum } from "@/lib/sales";
import { effectiveStage, STAGE_FLOW, STAGE_META, type Customer } from "@/app/customers/customer-types";
import PeriodPicker, { type Period, periodLabel } from "@/app/components/PeriodPicker";

export default function InsightsPage() {
  const router = useRouter();
  const { user, loading: authLoading } = useAuth();
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [properties, setProperties] = useState<Property[]>([]);
  const [contracts, setContracts] = useState<Contract[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [period, setPeriod] = useState<Period | null>(null);   // 활동·실패사유 기간

  useEffect(() => { if (!authLoading && !user) router.replace("/login?redirect=/insights"); }, [authLoading, user, router]);
  useEffect(() => {
    if (!user) return;
    const u1 = subscribeCustomers(user.agencyId, list => { setCustomers(list); setLoaded(true); });
    const u2 = subscribeProperties(user.agencyId, setProperties);
    const u3 = subscribeContracts(user.agencyId, setContracts);
    return () => { u1(); u2(); u3(); };
  }, [user]);

  const sales = useMemo(() => computeSalesStats(properties, contracts), [properties, contracts]);

  // 기간 칩 — 매출 월 + 고객 활동 이벤트가 있는 월
  const months = useMemo(() => {
    const set = new Set<string>(sales.allMonths);
    for (const c of customers) for (const e of c.history || []) set.add(new Date(e.at).toISOString().slice(0, 7));
    return [...set].sort().reverse();
  }, [customers, sales.allMonths]);

  useEffect(() => {
    if (period || !loaded) return;
    setPeriod({ mode: "month", key: months[0] || new Date().toISOString().slice(0, 7) });
  }, [loaded, months, period]);

  // 처리현황 — "현재" 스냅샷
  const status = useMemo(() => ({
    active: customers.filter(c => c.status === "active").length,
    matched: customers.filter(c => c.status === "matched").length,
    closed: customers.filter(c => c.status === "closed").length,
    lost: customers.filter(c => c.status === "lost").length,
  }), [customers]);

  // 퍼널 — "현재" 단계별 도달 수 (실패 제외)
  const funnel = useMemo(() => {
    const nonLost = customers.filter(c => effectiveStage(c) !== "lost");
    const idxOf = (c: Customer) => STAGE_FLOW.indexOf(effectiveStage(c));
    return STAGE_FLOW.map((st, i) => ({ stage: st, count: nonLost.filter(c => idxOf(c) >= i).length }));
  }, [customers]);

  // 선택 기간 집계 — 활동·성과·실패사유 (이벤트 날짜 기준)
  const agg = useMemo(() => {
    const res = { call: 0, visit: 0, shown: 0, won: 0, lost: 0, fail: {} as Record<string, number>, failTotal: 0 };
    if (!period) return res;
    const inPeriod = (at: number) => {
      const ym = new Date(at).toISOString().slice(0, 7);
      return period.mode === "year" ? ym.slice(0, 4) === period.key : ym === period.key;
    };
    for (const c of customers) for (const e of c.history || []) {
      if (!inPeriod(e.at)) continue;
      if (e.kind === "call" || e.kind === "sms") res.call++;
      else if (e.kind === "visit") res.visit++;
      else if (e.kind === "shown") res.shown++;
      else if (e.kind === "drop") { res.lost++; res.failTotal++; const r = (e.reason || "기타").trim() || "기타"; res.fail[r] = (res.fail[r] || 0) + 1; }
      else if (e.kind === "status" && /(거래 완료|계약 성사)/.test(e.text || "")) res.won++;
    }
    return res;
  }, [customers, period]);
  const failList = useMemo(() => Object.entries(agg.fail).sort((a, b) => b[1] - a[1]), [agg]);

  if (authLoading || !user) return <div className="min-h-screen flex items-center justify-center text-gray-400 text-sm">불러오는 중…</div>;

  const periodTitle = period ? periodLabel(period) : "";
  const today = new Date().toISOString().slice(0, 10);
  const upcoming = customers.filter(c => c.nextFollowUp && c.nextFollowUp >= today && c.status !== "closed" && c.status !== "lost").length;
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
          <Link href="/customers" className="text-xs px-3 py-2 rounded-lg border border-gray-200 dark:border-slate-700 hover:border-blue-400 hover:text-blue-600 transition-colors">고객 관리</Link>
          <Link href="/sales" className="text-xs px-3 py-2 rounded-lg border border-gray-200 dark:border-slate-700 hover:border-blue-400 hover:text-blue-600 transition-colors">매출 상세</Link>
        </div>
      </section>

      {!loaded ? (
        <div className="text-center text-gray-400 py-16">불러오는 중…</div>
      ) : (
        <div className="space-y-5">

          {/* 수익 요약 (간단) — 상세·기간별은 매출 페이지 */}
          <Link href="/sales" className="block group">
            <div className="bg-white dark:bg-slate-900 rounded-2xl border border-gray-200 dark:border-slate-700 shadow-sm p-4 flex items-center justify-between gap-4 hover:shadow-md transition-all">
              <div className="flex flex-wrap items-baseline gap-x-5 gap-y-1 min-w-0">
                <span className="text-sm font-bold text-gray-800 dark:text-gray-100 shrink-0">💰 수익</span>
                <SumInline label="이번 달" v={sales.thisMonth} />
                <SumInline label="올해" v={sales.thisYear} />
                <SumInline label="누적" v={sales.grand} />
              </div>
              <span className="text-xs text-[var(--brand-blue)] dark:text-blue-400 flex items-center gap-0.5 shrink-0 whitespace-nowrap">
                매출 상세<span className="material-symbols-outlined text-[16px] group-hover:translate-x-0.5 transition-transform">chevron_right</span>
              </span>
            </div>
          </Link>

          {/* 기간 선택 — 활동·성과·실패사유가 이 기간으로 */}
          <div className="bg-white dark:bg-slate-900 rounded-2xl border border-gray-200 dark:border-slate-700 shadow-sm px-4 py-3">
            {period && <PeriodPicker months={months} value={period} onChange={p => { setPeriod(p); recordFeatureUse(user?.uid, "insights_period"); }} accent="#2383E2" />}
          </div>

          {/* ② 처리 현황 (현재) */}
          <div className="bg-white dark:bg-slate-900 rounded-2xl border border-gray-200 dark:border-slate-700 shadow-sm p-5 sm:p-6">
            <div className="flex items-baseline gap-2 mb-3">
              <div className="text-base font-bold text-gray-800 dark:text-gray-100">처리 현황</div>
              <span className="text-[11px] px-1.5 py-0.5 rounded bg-gray-100 dark:bg-slate-800 text-gray-500">현재</span>
            </div>
            {(() => {
              const inProg = status.active + status.matched;
              const total = inProg + status.closed + status.lost;
              const seg = [
                { label: "진행 중", n: inProg, c: "#2383E2" },
                { label: "계약 성사", n: status.closed, c: "#1D9E75" },
                { label: "실패·이탈", n: status.lost, c: "#A32D2D" },
              ];
              return (
                <>
                  <div className="flex h-6 rounded-lg overflow-hidden bg-gray-100 dark:bg-slate-800 mb-2">
                    {total === 0 ? <div className="flex-1" /> : seg.map(s => s.n > 0 && (
                      <div key={s.label} style={{ width: `${(s.n / total) * 100}%`, background: s.c }} className="flex items-center justify-center" title={`${s.label} ${s.n}`}>
                        {s.n / total > 0.08 && <span className="text-white text-[11px] font-bold">{s.n}</span>}
                      </div>
                    ))}
                  </div>
                  <div className="flex flex-wrap gap-x-4 gap-y-1 text-[12px]">
                    {seg.map(s => (
                      <span key={s.label} className="inline-flex items-center gap-1.5">
                        <span className="w-2.5 h-2.5 rounded-sm" style={{ background: s.c }} />
                        <span className="text-gray-600 dark:text-gray-300">{s.label}</span>
                        <span className="font-bold tabular-nums" style={{ color: s.c }}>{s.n}</span>
                      </span>
                    ))}
                    <span className="ml-auto text-gray-400">전체 {total}명</span>
                  </div>
                </>
              );
            })()}
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-[1.5fr_1fr] gap-5">
            {/* ③ 퍼널 — 가로 진행 (문의 →%→ 연락 →%→ …) */}
            <div className="bg-white dark:bg-slate-900 rounded-2xl border border-gray-200 dark:border-slate-700 shadow-sm p-5 sm:p-6">
              <div className="flex items-baseline gap-2 mb-4">
                <div className="text-base font-bold text-gray-800 dark:text-gray-100">파이프라인 퍼널 (문의 → 계약)</div>
                <span className="text-[11px] px-1.5 py-0.5 rounded bg-gray-100 dark:bg-slate-800 text-gray-500">현재</span>
              </div>
              <div className="overflow-x-auto">
                <div className="flex items-stretch min-w-[460px]">
                  {funnel.map((f, i) => {
                    const meta = STAGE_META[f.stage];
                    const barH = Math.max(10, (f.count / maxFunnel) * 130);
                    const next = i < funnel.length - 1 ? funnel[i + 1] : null;
                    const conv = next && f.count > 0 ? Math.round((next.count / f.count) * 100) : null;
                    return (
                      <Fragment key={f.stage}>
                        <div className="flex-1 flex flex-col items-center min-w-0">
                          <div className="flex flex-col items-center justify-end w-full" style={{ height: 150 }}>
                            <span className="text-[12px] font-bold tabular-nums mb-1" style={{ color: meta.fg }}>{f.count}</span>
                            <div className="w-full max-w-[56px] rounded-t-md" style={{ height: `${barH}px`, background: meta.fg }} />
                          </div>
                          <div className="text-[10.5px] mt-1.5 text-center leading-tight" style={{ color: meta.fg }}>{meta.label}</div>
                        </div>
                        {conv !== null && (
                          <div className="flex flex-col items-center justify-center w-11 shrink-0" style={{ height: 150 }}>
                            <span className="material-symbols-outlined text-gray-300 dark:text-slate-600 text-[18px]">arrow_forward</span>
                            <span className="text-[11px] font-bold text-gray-600 dark:text-gray-300 bg-gray-100 dark:bg-slate-800 rounded-full px-1.5 py-0.5 mt-0.5">{conv}%</span>
                          </div>
                        )}
                      </Fragment>
                    );
                  })}
                </div>
              </div>
              <p className="text-[10.5px] text-gray-400 mt-3">막대 = 해당 단계까지 도달한 손님 수 · 화살표 = 다음 단계 전환율</p>
            </div>

            {/* ④ 실패 사유 — 선택 기간 */}
            <div className="bg-white dark:bg-slate-900 rounded-2xl border border-gray-200 dark:border-slate-700 shadow-sm p-5 sm:p-6">
              <div className="text-base font-bold text-gray-800 dark:text-gray-100 mb-1">실패 사유</div>
              <div className="text-xs text-gray-400 mb-3">{periodTitle} · 총 {agg.failTotal}건 이탈</div>
              {failList.length === 0 ? (
                <p className="text-[12px] text-gray-400 py-4">이 기간엔 이탈 기록이 없어요.</p>
              ) : (
                <div className="space-y-2.5">
                  {failList.map(([reason, n]) => {
                    const pct = agg.failTotal > 0 ? Math.round((n / agg.failTotal) * 100) : 0;
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

          {/* ⑤ 활동 + 성과 — 선택 기간 */}
          <div className="bg-white dark:bg-slate-900 rounded-2xl border border-gray-200 dark:border-slate-700 shadow-sm p-5 sm:p-6">
            <div className="flex items-baseline justify-between mb-3">
              <div className="text-base font-bold text-gray-800 dark:text-gray-100">{periodTitle} 활동</div>
              <div className="text-xs text-gray-500">성과 · 성사 <span className="font-bold text-emerald-600">{agg.won}</span> · 실패 <span className="font-bold text-red-500">{agg.lost}</span></div>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
              <ActivityCard icon="call" label="전화·문자" value={agg.call} />
              <ActivityCard icon="directions_walk" label="집보기 동행" value={agg.visit} />
              <ActivityCard icon="visibility" label="매물 보여줌" value={agg.shown} />
              <ActivityCard icon="event_upcoming" label="예정 후속연락" value={upcoming} accent />
            </div>
          </div>

          <p className="text-center text-[11px] text-gray-400 leading-relaxed">
            📊 처리현황·퍼널은 <b>현재</b> 상태 · 활동·성과·실패사유는 <b>선택 기간</b> 기준 (고객 활동 기록 기반 — 기능 추가 시점부터 누적)
          </p>
        </div>
      )}
    </div>
  );
}

function SumInline({ label, v }: { label: string; v: number }) {
  return (
    <span className="text-sm whitespace-nowrap">
      <span className="text-gray-400">{label} </span>
      <span className="font-bold text-gray-800 dark:text-gray-100 tabular-nums">{fmtNum(v)}만</span>
    </span>
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
