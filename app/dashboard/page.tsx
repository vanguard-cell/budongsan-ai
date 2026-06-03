"use client";

/**
 * 🏠 홈 대시보드 — Stitch 디자인 100% 적용
 *
 * 사이드바·헤더는 layout.tsx에서 처리.
 * 이 파일은 메인 컨텐츠 영역만 담당.
 *
 * 구성:
 *  1) 인사 (display-lg 32px)
 *  2) KPI 4종 (headline-md 24px + SVG 스파크라인)
 *  3) 중요 알림 3종 + 빠른 실행 4종 (7:5 그리드)
 *  4) 최근 업데이트 매물 테이블 (progress bar)
 */

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth-context";
import { subscribeProperties, type Property } from "@/lib/properties-db";
import { subscribeContracts } from "@/lib/contracts-db";
import { subscribeCustomers } from "@/lib/customers-db";
import type { Contract } from "@/app/expiry/contracts";
import type { Customer } from "@/app/customers/customer-types";
import { dDay } from "@/app/expiry/contracts";
import { followUpDDay, followUpSeverity } from "@/app/customers/customer-types";
import { computeSalesStats, fmtNum } from "@/lib/sales";
import SparklineChart from "./components/SparklineChart";

/* 시간대별 인사 */
function getGreeting(): string {
  const h = new Date().getHours();
  if (h < 5)  return "안녕하세요";
  if (h < 12) return "좋은 아침입니다";
  if (h < 18) return "좋은 오후입니다";
  return "좋은 저녁입니다";
}

export default function DashboardPage() {
  const router = useRouter();
  const { user, loading: authLoading } = useAuth();
  const [properties, setProperties] = useState<Property[]>([]);
  const [contracts, setContracts]   = useState<Contract[]>([]);
  const [customers, setCustomers]   = useState<Customer[]>([]);

  useEffect(() => {
    if (!authLoading && !user) router.replace("/login?redirect=/dashboard");
  }, [authLoading, user, router]);

  useEffect(() => {
    if (!user) return;
    const u1 = subscribeProperties(user.agencyId, setProperties);
    const u2 = subscribeContracts(user.agencyId, setContracts);
    const u3 = subscribeCustomers(user.agencyId, setCustomers);
    return () => { u1(); u2(); u3(); };
  }, [user]);

  const sales = useMemo(() => computeSalesStats(properties, contracts), [properties, contracts]);
  const activeProps = useMemo(() => properties.filter(p => p.status === "active"), [properties]);
  const contractingProps = useMemo(() =>
    activeProps.filter(p => p.contractDate || p.downPaymentDate || p.balanceDate),
    [activeProps],
  );

  const expiringContracts = useMemo(() =>
    contracts.filter(c => {
      if (c.status !== "active" || !c.endDate) return false;
      const dd = dDay(c.endDate);
      return dd <= 30 && dd >= -7;
    }),
    [contracts],
  );
  const urgentExpiring = expiringContracts.filter(c => dDay(c.endDate) <= 7);

  const followUpNeeded = useMemo(() =>
    customers.filter(c => {
      if (c.status !== "active") return false;
      const s = followUpSeverity(followUpDDay(c.nextFollowUp));
      return s === "overdue" || s === "today" || s === "soon";
    }),
    [customers],
  );
  const todayFollowUp = followUpNeeded.filter(c => followUpDDay(c.nextFollowUp) === 0).length;

  const todayStr = new Date().toISOString().slice(0, 10);
  const overdueBalance = useMemo(() =>
    activeProps.filter(p => p.balanceDate && p.balanceDate <= todayStr),
    [activeProps, todayStr],
  );
  const overdueFollowUp = useMemo(() =>
    customers.filter(c => c.status === "active" && c.nextFollowUp && c.nextFollowUp < todayStr),
    [customers, todayStr],
  );

  const recentProps = useMemo(() =>
    [...activeProps].sort((a, b) => b.createdAt - a.createdAt).slice(0, 5),
    [activeProps],
  );

  // 매출 12개월 시계열 (스파크라인용)
  const salesTrend = useMemo(() => {
    const today = new Date();
    const arr: number[] = [];
    for (let i = 11; i >= 0; i--) {
      const d = new Date(today.getFullYear(), today.getMonth() - i, 1);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
      arr.push(sales.byMonth[key] || 0);
    }
    return arr.length > 1 ? arr : [0, 0];
  }, [sales]);

  if (authLoading || !user) {
    return <div className="min-h-screen flex items-center justify-center text-gray-400 text-sm">불러오는 중…</div>;
  }

  const userName = user.displayName || user.email?.split("@")[0] || "사장";
  const greeting = getGreeting();

  return (
    <div className="p-6 lg:p-10">
      <div className="max-w-6xl mx-auto space-y-8">
        {/* ─── 1) 인사 ─── */}
        <header>
          <h2 className="text-3xl lg:text-4xl font-bold text-gray-900 dark:text-gray-100 tracking-tight">
            {greeting},{" "}
            <span className="text-green-700 dark:text-green-400">{userName} 사장님!</span>
          </h2>
          <p className="text-base text-gray-500 dark:text-gray-400 mt-2">
            오늘도 성공적인 계약을 위해 미사금빛이 도와드릴게요. 🏠
          </p>
        </header>

        {/* ─── 2) KPI 4종 ─── */}
        <section className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <KpiCard
            icon="payments"
            label="이번달 매출"
            value={`₩${fmtNum(sales.thisMonth)}만`}
            sub="전월 대비 +12% ↗"
            iconBg="bg-amber-50 dark:bg-amber-950/40"
            iconColor="text-amber-500 dark:text-amber-400"
            valueColor="text-amber-600 dark:text-amber-400"
            subColor="text-amber-600 dark:text-amber-400"
            trendIcon="trending_up"
            sparkData={salesTrend}
            sparkColor="stroke-amber-500 dark:stroke-amber-400"
            href="/sales"
          />
          <KpiCard
            icon="domain"
            label="진행중 매물"
            value={`${activeProps.length} 건`}
            sub={`계약 진행 ${contractingProps.length}건 포함`}
            iconBg="bg-emerald-50 dark:bg-emerald-950/40"
            iconColor="text-emerald-600 dark:text-emerald-400"
            valueColor="text-emerald-600 dark:text-emerald-400"
            subColor="text-emerald-600 dark:text-emerald-400"
            badge="진행 중"
            badgeColor="bg-emerald-100 text-emerald-700 dark:bg-emerald-900/50 dark:text-emerald-300"
            href="/properties"
          />
          <KpiCard
            icon="timer"
            label="만기 임박"
            value={`${expiringContracts.length} 건`}
            sub={urgentExpiring.length > 0 ? `D-7 이내 ${urgentExpiring.length}건` : "30일 이내 만기"}
            iconBg="bg-orange-50 dark:bg-orange-950/40"
            iconColor="text-orange-500 dark:text-orange-400"
            valueColor="text-orange-500 dark:text-orange-400"
            subColor="text-orange-600 dark:text-orange-400"
            badge={urgentExpiring.length > 0 ? `긴급 ${urgentExpiring.length}` : undefined}
            badgeColor="bg-orange-100 text-orange-700 dark:bg-orange-900/50 dark:text-orange-300"
            href="/expiry"
          />
          <KpiCard
            icon="phone_callback"
            label="후속연락 필요"
            value={`${followUpNeeded.length} 건`}
            sub={todayFollowUp > 0 ? `오늘 ${todayFollowUp}명 상담 예정` : "지난 연락 확인 필요"}
            iconBg="bg-blue-50 dark:bg-blue-950/40"
            iconColor="text-blue-600 dark:text-blue-400"
            valueColor="text-blue-600 dark:text-blue-400"
            subColor="text-blue-600 dark:text-blue-400"
            badge={todayFollowUp > 0 ? `오늘 ${todayFollowUp}` : "확인 요망"}
            badgeColor="bg-blue-100 text-blue-700 dark:bg-blue-900/50 dark:text-blue-300"
            href="/customers"
          />
        </section>

        {/* ─── 3) 중요 알림 + 빠른 실행 ─── */}
        <section className="grid grid-cols-1 lg:grid-cols-12 gap-8">
          {/* 알림 (7) */}
          <div className="lg:col-span-7 space-y-4">
            <h4 className="flex items-center gap-2 text-xl font-bold text-gray-900 dark:text-gray-100">
              <span className="material-symbols-outlined text-red-500">campaign</span>
              중요 알림
            </h4>

            {overdueBalance.length === 0 && urgentExpiring.length === 0 && overdueFollowUp.length === 0 ? (
              <div className="p-5 bg-white dark:bg-slate-800 rounded-xl border border-gray-200 dark:border-slate-700 text-sm text-gray-500 dark:text-gray-400">
                ✨ 오늘은 처리할 긴급 알림이 없습니다. 좋은 하루 보내세요!
              </div>
            ) : (
              <>
                {overdueBalance[0] && (
                  <AlertCard
                    color="red"
                    icon="priority_high"
                    title={`잔금일 지남: ${overdueBalance[0].address}`}
                    desc={`잔금일 ${overdueBalance[0].balanceDate}${overdueBalance.length > 1 ? ` (외 ${overdueBalance.length - 1}건)` : ""}`}
                    href="/properties"
                  />
                )}
                {urgentExpiring[0] && (
                  <AlertCard
                    color="orange"
                    icon="schedule"
                    title={`만기 임박: ${urgentExpiring[0].address}`}
                    desc={`D-${dDay(urgentExpiring[0].endDate)} 만기 도래, 연장 의사 확인 필요${urgentExpiring.length > 1 ? ` (외 ${urgentExpiring.length - 1}건)` : ""}`}
                    href="/expiry"
                  />
                )}
                {overdueFollowUp[0] && (
                  <AlertCard
                    color="purple"
                    icon="contact_phone"
                    title={`후속연락 지남: ${overdueFollowUp[0].name || "고객님"}`}
                    desc={`예정일 ${overdueFollowUp[0].nextFollowUp}${overdueFollowUp.length > 1 ? ` (외 ${overdueFollowUp.length - 1}건)` : ""}`}
                    href={`/customers?focus=${overdueFollowUp[0].id}`}
                  />
                )}
              </>
            )}
          </div>

          {/* 빠른 실행 (5) */}
          <div className="lg:col-span-5 space-y-4">
            <h4 className="text-xl font-bold text-gray-900 dark:text-gray-100">빠른 실행</h4>
            <div className="grid grid-cols-2 gap-4">
              <QuickAction
                icon="add_business"
                label="단지 빠른 등록"
                iconBg="bg-emerald-100 dark:bg-emerald-900/40"
                iconColor="text-emerald-600 dark:text-emerald-400"
                textColor="text-emerald-900 dark:text-emerald-300"
                borderColor="border-emerald-100 dark:border-emerald-900/50"
                hoverBg="hover:bg-emerald-50 dark:hover:bg-emerald-950/30"
                href="/properties"
              />
              <QuickAction
                icon="fact_check"
                label="잔금/만기 일괄"
                iconBg="bg-orange-100 dark:bg-orange-900/40"
                iconColor="text-orange-600 dark:text-orange-400"
                textColor="text-orange-900 dark:text-orange-300"
                borderColor="border-orange-100 dark:border-orange-900/50"
                hoverBg="hover:bg-orange-50 dark:hover:bg-orange-950/30"
                href="/properties"
              />
              <QuickAction
                icon="auto_awesome"
                label="AI 문구 생성"
                iconBg="bg-pink-100 dark:bg-pink-900/40"
                iconColor="text-pink-600 dark:text-pink-400"
                textColor="text-pink-900 dark:text-pink-300"
                borderColor="border-pink-100 dark:border-pink-900/50"
                hoverBg="hover:bg-pink-50 dark:hover:bg-pink-950/30"
                href="/ai-content"
              />
              <button
                onClick={() => alert("준비 중인 기능입니다. 곧 사용자 정의 액션 추가가 지원됩니다.")}
                className="flex flex-col items-center justify-center gap-2 p-6 bg-white dark:bg-slate-800/40 border-2 border-dashed border-gray-300 dark:border-slate-600 rounded-2xl hover:bg-gray-50 dark:hover:bg-slate-800 transition-colors text-gray-500 dark:text-gray-400"
              >
                <span className="p-3 bg-gray-100 dark:bg-slate-700 rounded-full material-symbols-outlined">add</span>
                <span className="font-bold text-sm">기능 추가</span>
              </button>
            </div>
          </div>
        </section>

        {/* ─── 4) 최근 업데이트 매물 ─── */}
        <section className="space-y-4">
          <div className="flex justify-between items-center">
            <h4 className="text-xl font-bold text-gray-900 dark:text-gray-100">최근 업데이트 매물</h4>
            <Link href="/properties" className="text-sm font-bold text-green-700 dark:text-green-400 hover:underline">
              전체 보기
            </Link>
          </div>

          {recentProps.length === 0 ? (
            <div className="bg-white dark:bg-slate-800 rounded-2xl border border-gray-200 dark:border-slate-700 p-10 text-center">
              <div className="text-5xl mb-3">🏘️</div>
              <p className="text-base text-gray-500 dark:text-gray-400 mb-4">아직 등록된 매물이 없습니다</p>
              <Link href="/properties" className="inline-block text-sm px-5 py-2.5 rounded-full bg-green-700 text-white font-semibold">
                + 첫 매물 등록
              </Link>
            </div>
          ) : (
            <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-sm border border-gray-200 dark:border-slate-700 overflow-hidden">
              {/* 데스크탑: 테이블 */}
              <div className="hidden md:block">
                <table className="w-full text-left">
                  <thead className="bg-gray-50 dark:bg-slate-900/50 border-b border-gray-200 dark:border-slate-700">
                    <tr>
                      <th className="px-6 py-4 text-sm font-bold text-gray-600 dark:text-gray-400">거래 유형</th>
                      <th className="px-6 py-4 text-sm font-bold text-gray-600 dark:text-gray-400">매물명 / 상세 정보</th>
                      <th className="px-6 py-4 text-sm font-bold text-gray-600 dark:text-gray-400">가격 (만원)</th>
                      <th className="px-6 py-4 text-sm font-bold text-gray-600 dark:text-gray-400">진행 단계</th>
                      <th className="px-6 py-4 text-sm font-bold text-gray-600 dark:text-gray-400">업데이트</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100 dark:divide-slate-700">
                    {recentProps.map(p => (
                      <PropertyRow key={p.id} property={p} />
                    ))}
                  </tbody>
                </table>
              </div>
              {/* 모바일: 카드 */}
              <div className="md:hidden divide-y divide-gray-100 dark:divide-slate-700">
                {recentProps.map(p => (
                  <PropertyCardMobile key={p.id} property={p} />
                ))}
              </div>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}

/* ─────────────── 컴포넌트 ─────────────── */

interface KpiCardProps {
  icon: string;
  label: string;
  value: string;
  sub: string;
  iconBg: string;
  iconColor: string;
  valueColor: string;
  subColor: string;
  href: string;
  badge?: string;
  badgeColor?: string;
  trendIcon?: string;
  sparkData?: number[];
  sparkColor?: string;
}

function KpiCard(p: KpiCardProps) {
  return (
    <Link
      href={p.href}
      className="block p-5 bg-white dark:bg-slate-800 rounded-2xl shadow-sm border border-gray-200 dark:border-slate-700 hover:shadow-md hover:-translate-y-0.5 transition-all group"
    >
      <div className="flex justify-between items-start mb-4">
        <span className={`p-2 rounded-lg material-symbols-outlined ${p.iconBg} ${p.iconColor}`}>
          {p.icon}
        </span>
        {p.sparkData ? (
          <SparklineChart data={p.sparkData} className={p.sparkColor || "stroke-amber-500"} />
        ) : p.badge ? (
          <span className={`text-[12px] px-2 py-0.5 rounded-full font-bold ${p.badgeColor}`}>
            {p.badge}
          </span>
        ) : null}
      </div>
      <p className="text-sm text-gray-500 dark:text-gray-400">{p.label}</p>
      <h3 className={`text-2xl font-bold ${p.valueColor}`}>
        {p.value}
      </h3>
      <p className={`text-xs font-medium mt-1 flex items-center gap-1 ${p.subColor}`}>
        {p.trendIcon && (
          <span className="material-symbols-outlined text-[14px]">{p.trendIcon}</span>
        )}
        {p.sub}
      </p>
    </Link>
  );
}

function AlertCard({ color, icon, title, desc, href }: {
  color: "red" | "orange" | "purple";
  icon: string;
  title: string;
  desc: string;
  href: string;
}) {
  const styles = {
    red:    { border: "border-red-500",    iconColor: "text-red-500",    dot: "bg-red-500" },
    orange: { border: "border-orange-500", iconColor: "text-orange-500", dot: "bg-orange-500" },
    purple: { border: "border-purple-500", iconColor: "text-purple-500", dot: "bg-purple-500" },
  };
  const s = styles[color];
  return (
    <Link
      href={href}
      className={`flex items-center justify-between p-4 bg-white dark:bg-slate-800 border-l-4 ${s.border} rounded-r-xl shadow-sm hover:translate-x-1 transition-transform`}
    >
      <div className="flex items-center gap-4 min-w-0">
        <span className={`material-symbols-outlined shrink-0 ${s.iconColor}`}>{icon}</span>
        <div className="min-w-0">
          <p className="font-bold text-sm text-gray-900 dark:text-gray-100 truncate">{title}</p>
          <p className="text-sm text-gray-500 dark:text-gray-400 truncate">{desc}</p>
        </div>
      </div>
      <div className="flex items-center gap-3 shrink-0 ml-3">
        <span className={`w-2 h-2 rounded-full ${s.dot}`} />
        <span className="material-symbols-outlined text-gray-400">chevron_right</span>
      </div>
    </Link>
  );
}

function QuickAction({ icon, label, iconBg, iconColor, textColor, borderColor, hoverBg, href }: {
  icon: string;
  label: string;
  iconBg: string;
  iconColor: string;
  textColor: string;
  borderColor: string;
  hoverBg: string;
  href: string;
}) {
  return (
    <Link
      href={href}
      className={`flex flex-col items-center justify-center gap-2 p-6 bg-white dark:bg-slate-800 border ${borderColor} rounded-2xl ${hoverBg} transition-all group`}
    >
      <span className={`p-3 rounded-full material-symbols-outlined ${iconBg} ${iconColor} group-hover:scale-110 transition-transform`}>
        {icon}
      </span>
      <span className={`font-bold text-sm ${textColor}`}>{label}</span>
    </Link>
  );
}

const DEAL_TYPE_STYLES = {
  "매매": { badge: "bg-red-500 text-white",     text: "text-red-700 dark:text-red-400",     bar: "bg-red-500" },
  "전세": { badge: "bg-blue-500 text-white",    text: "text-blue-700 dark:text-blue-400",   bar: "bg-blue-500" },
  "월세": { badge: "bg-amber-500 text-white",   text: "text-amber-700 dark:text-amber-400", bar: "bg-amber-500" },
} as const;

function priceStr(p: Property): string {
  if (p.dealType === "월세") return `${fmtNum(p.price)} / ${fmtNum(p.monthly)}`;
  return fmtNum(p.price);
}

function progressInfo(p: Property): { label: string; percent: number } {
  if (p.balanceDate) {
    const today = new Date().toISOString().slice(0, 10);
    if (p.balanceDate <= today) return { label: "잔금 완료", percent: 100 };
    if (p.downPaymentDate && p.downPaymentDate <= today) return { label: "중도금 완료", percent: 75 };
    if (p.contractDate && p.contractDate.slice(0, 10) <= today) return { label: "계약 체결", percent: 50 };
    return { label: "계약 조율", percent: 33 };
  }
  if (p.contractDate) return { label: "계약 조율", percent: 33 };
  return { label: "매물 등록", percent: 15 };
}

function timeAgo(ts: number): string {
  const diff = Date.now() - ts;
  const mins = Math.floor(diff / 60000);
  if (mins < 60) return `${mins}분 전`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}시간 전`;
  const days = Math.floor(hrs / 24);
  if (days === 1) return "어제";
  if (days < 7) return `${days}일 전`;
  return new Date(ts).toLocaleDateString("ko-KR", { month: "short", day: "numeric" });
}

function PropertyRow({ property: p }: { property: Property }) {
  const s = DEAL_TYPE_STYLES[p.dealType];
  const prog = progressInfo(p);
  return (
    <tr className="hover:bg-gray-50 dark:hover:bg-slate-900/50 transition-colors cursor-pointer group">
      <td className="px-6 py-4">
        <span className={`px-3 py-1 text-xs font-bold rounded-full ${s.badge}`}>
          {p.dealType}
        </span>
      </td>
      <td className="px-6 py-4 min-w-0">
        <p className="font-bold text-sm text-gray-900 dark:text-gray-100 group-hover:text-green-700 dark:group-hover:text-green-400 transition-colors truncate">
          {p.address}
        </p>
        <p className="text-xs text-gray-500 dark:text-gray-400 truncate">
          {[p.area && `${p.area}㎡`, p.rooms && `${p.rooms}룸`, p.direction].filter(Boolean).join(" / ")}
        </p>
      </td>
      <td className="px-6 py-4">
        <p className={`font-bold text-sm ${s.text}`}>{priceStr(p)}</p>
      </td>
      <td className="px-6 py-4">
        <div className="flex items-center gap-2">
          <span className="w-24 h-2 bg-gray-200 dark:bg-slate-700 rounded-full overflow-hidden">
            <span className={`block h-full ${s.bar} transition-all`} style={{ width: `${prog.percent}%` }} />
          </span>
          <span className="text-xs font-medium text-gray-600 dark:text-gray-300 whitespace-nowrap">{prog.label}</span>
        </div>
      </td>
      <td className="px-6 py-4 text-sm text-gray-500 dark:text-gray-400">{timeAgo(p.createdAt)}</td>
    </tr>
  );
}

function PropertyCardMobile({ property: p }: { property: Property }) {
  const s = DEAL_TYPE_STYLES[p.dealType];
  const prog = progressInfo(p);
  return (
    <div className="p-4 hover:bg-gray-50 dark:hover:bg-slate-900/50">
      <div className="flex items-start justify-between gap-2 mb-1">
        <span className={`px-2 py-0.5 text-[10px] font-bold rounded-full ${s.badge} shrink-0`}>{p.dealType}</span>
        <span className="text-[10px] text-gray-400">{timeAgo(p.createdAt)}</span>
      </div>
      <p className="font-bold text-sm text-gray-900 dark:text-gray-100 break-all">{p.address}</p>
      <p className="text-[11px] text-gray-500 dark:text-gray-400 mt-0.5">
        {[p.area && `${p.area}㎡`, p.rooms && `${p.rooms}룸`, p.direction].filter(Boolean).join(" / ")}
      </p>
      <div className="flex items-center justify-between mt-2">
        <p className={`font-bold text-sm ${s.text}`}>{priceStr(p)}만</p>
        <div className="flex items-center gap-2">
          <div className="w-14 h-1.5 bg-gray-200 dark:bg-slate-700 rounded-full overflow-hidden">
            <div className={`h-full ${s.bar}`} style={{ width: `${prog.percent}%` }} />
          </div>
          <span className="text-[10px] text-gray-500 dark:text-gray-400">{prog.label}</span>
        </div>
      </div>
    </div>
  );
}
