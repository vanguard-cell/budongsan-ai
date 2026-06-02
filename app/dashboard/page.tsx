"use client";

/**
 * 🏠 홈 대시보드
 *
 * Stitch 디자인(데스크탑 라이트 - 컬러 시스템 반영) + 우리 Firebase 실시간 데이터
 *
 * 구조:
 *  1) 상단 헤더 — 검색·알림·다크모드·아바타
 *  2) 인사 — "{이름} 사장님"
 *  3) KPI 4종 — 매출/매물/만기/후속
 *  4) 중요 알림 3개 — 잔금 경과·만기 임박·후속연락
 *  5) 빠른 실행 4개 — 페이지별 색
 *  6) 최근 업데이트 매물 테이블
 */

import { useState, useEffect, useMemo } from "react";
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
import { PAGE_THEMES } from "@/lib/theme";

/* ── 인사말 — 시간대별 자동 ── */
function getGreeting(): string {
  const h = new Date().getHours();
  if (h < 5)  return "안녕하세요";
  if (h < 12) return "좋은 아침입니다";
  if (h < 18) return "좋은 오후입니다";
  return "좋은 저녁입니다";
}

/* ── 다크모드 토글 ── */
function useDarkMode() {
  const [isDark, setIsDark] = useState(false);
  useEffect(() => {
    const stored = localStorage.getItem("theme");
    const dark = stored === "dark" || (!stored && window.matchMedia("(prefers-color-scheme: dark)").matches);
    setIsDark(dark);
  }, []);
  const toggle = () => {
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
  return { isDark, toggle };
}

export default function DashboardPage() {
  const router = useRouter();
  const { user, loading: authLoading, signOut } = useAuth();
  const { isDark, toggle: toggleDark } = useDarkMode();

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

  // ─── 매출 통계 ───
  const sales = useMemo(() => computeSalesStats(properties), [properties]);

  // ─── 진행중 매물 ───
  const activeProps = useMemo(() => properties.filter(p => p.status === "active"), [properties]);
  const contractingProps = useMemo(() =>
    activeProps.filter(p => p.contractDate || p.downPaymentDate || p.balanceDate),
    [activeProps],
  );

  // ─── 만기 임박 (D-30 이내 활성 계약) ───
  const expiringContracts = useMemo(() => {
    return contracts.filter(c => {
      if (c.status !== "active" || !c.endDate) return false;
      const dd = dDay(c.endDate);
      return dd <= 30 && dd >= -7; // D-30 ~ -7일 지남까지
    });
  }, [contracts]);

  const urgentExpiring = useMemo(() =>
    expiringContracts.filter(c => dDay(c.endDate) <= 7),
    [expiringContracts],
  );

  // ─── 후속연락 필요 (오늘 + 지남) ───
  const followUpNeeded = useMemo(() => {
    return customers.filter(c => {
      if (c.status !== "active") return false;
      const d = followUpDDay(c.nextFollowUp);
      const s = followUpSeverity(d);
      return s === "overdue" || s === "today" || s === "soon";
    });
  }, [customers]);

  const todayFollowUp = followUpNeeded.filter(c => followUpDDay(c.nextFollowUp) === 0).length;

  // ─── 중요 알림 — 카테고리별 최우선 1건씩 ───
  const todayStr = new Date().toISOString().slice(0, 10);
  const overdueBalance = useMemo(() =>
    activeProps.filter(p => p.balanceDate && p.balanceDate <= todayStr),
    [activeProps, todayStr],
  );
  const overdueFollowUp = useMemo(() =>
    customers.filter(c => c.status === "active" && c.nextFollowUp && c.nextFollowUp < todayStr),
    [customers, todayStr],
  );

  // ─── 최근 업데이트 매물 (createdAt desc, 5개) ───
  const recentProps = useMemo(() =>
    [...activeProps].sort((a, b) => b.createdAt - a.createdAt).slice(0, 5),
    [activeProps],
  );

  if (authLoading || !user) {
    return <div className="min-h-screen flex items-center justify-center text-gray-400 text-sm">불러오는 중…</div>;
  }

  const userName = user.displayName || user.email?.split("@")[0] || "사장";
  const greeting = getGreeting();

  return (
    <div className="min-h-screen bg-gradient-to-br from-white to-emerald-50/40 dark:from-slate-900 dark:to-emerald-950/30">
      {/* ─── 상단 헤더 ─── */}
      <header className="sticky top-0 z-40 bg-white/90 dark:bg-slate-900/90 backdrop-blur border-b border-gray-200 dark:border-slate-700">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center gap-4">
          <h1 className="hidden sm:block text-base sm:text-lg font-bold text-emerald-700 dark:text-emerald-400 shrink-0">
            미사금빛 매물 도우미
          </h1>

          {/* 글로벌 검색 */}
          <div className="flex-1 max-w-xl relative">
            <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-xl pointer-events-none">search</span>
            <input
              type="text"
              placeholder="단지명·고객명·전화번호 검색"
              className="w-full pl-10 pr-4 py-2 text-sm bg-gray-100 dark:bg-slate-800 border-0 rounded-full focus:ring-2 focus:ring-emerald-500 text-gray-900 dark:text-gray-100 placeholder:text-gray-400"
            />
          </div>

          {/* 액션 */}
          <div className="flex items-center gap-1">
            <button title="알림" className="relative p-2 rounded-full hover:bg-gray-100 dark:hover:bg-slate-800 text-gray-700 dark:text-gray-300">
              <span className="material-symbols-outlined">notifications</span>
              {(overdueBalance.length + urgentExpiring.length + overdueFollowUp.length) > 0 && (
                <span className="absolute top-1 right-1 w-2 h-2 bg-red-500 rounded-full" />
              )}
            </button>
            <button onClick={toggleDark} title={isDark ? "라이트 모드" : "다크 모드"} className="p-2 rounded-full hover:bg-gray-100 dark:hover:bg-slate-800 text-gray-700 dark:text-gray-300">
              <span className="material-symbols-outlined">{isDark ? "dark_mode" : "light_mode"}</span>
            </button>
            <div className="hidden sm:flex items-center gap-2 pl-3 ml-1 border-l border-gray-200 dark:border-slate-700">
              <div className="text-right">
                <p className="text-xs font-semibold text-gray-900 dark:text-gray-100 leading-tight">{userName} 사장님</p>
                <button onClick={() => { if (confirm("로그아웃?")) signOut(); }} className="text-[10px] text-gray-400 hover:text-emerald-600">로그아웃</button>
              </div>
              <div className="w-9 h-9 rounded-full bg-emerald-600 text-white font-bold flex items-center justify-center text-sm">
                {userName.charAt(0)}
              </div>
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-6 sm:py-8 space-y-6 sm:space-y-8">
        {/* ─── 1) 인사 ─── */}
        <section>
          <h2 className="text-2xl sm:text-3xl font-bold text-gray-900 dark:text-gray-100">
            {greeting},{" "}
            <span className="text-emerald-700 dark:text-emerald-400">{userName} 사장님!</span>
          </h2>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
            오늘도 성공적인 계약을 위해 미사금빛이 도와드릴게요. 🏠
          </p>
        </section>

        {/* ─── 2) KPI 4종 ─── */}
        <section className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
          <KpiCard
            icon="payments"
            label="이번달 매출"
            value={`₩${fmtNum(sales.thisMonth)}만`}
            sub="전월 대비 +12% ↗"
            colorPage="sales"
            href="/sales"
          />
          <KpiCard
            icon="domain"
            label="진행중 매물"
            value={`${activeProps.length}건`}
            sub={`계약 진행 ${contractingProps.length}건 포함`}
            colorPage="properties"
            href="/properties"
            badge="진행 중"
          />
          <KpiCard
            icon="timer"
            label="만기 임박"
            value={`${expiringContracts.length}건`}
            sub={urgentExpiring.length > 0 ? `D-7 위급 ${urgentExpiring.length}건` : "7일 이내 만기 도래"}
            colorPage="expiry"
            href="/expiry"
            badge={urgentExpiring.length > 0 ? `긴급 ${urgentExpiring.length}` : undefined}
          />
          <KpiCard
            icon="phone_callback"
            label="후속연락 필요"
            value={`${followUpNeeded.length}건`}
            sub={todayFollowUp > 0 ? `오늘 ${todayFollowUp}명 상담 예정` : "지난 연락 확인 필요"}
            colorPage="customers"
            href="/customers"
            badge={todayFollowUp > 0 ? `오늘 ${todayFollowUp}` : undefined}
          />
        </section>

        {/* ─── 3) 중요 알림 + 빠른 실행 ─── */}
        <section className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          {/* 알림 3개 */}
          <div className="lg:col-span-7 space-y-3">
            <h4 className="flex items-center gap-2 text-base font-bold text-gray-900 dark:text-gray-100">
              <span className="material-symbols-outlined text-red-500">campaign</span>
              중요 알림
            </h4>

            {overdueBalance.length === 0 && urgentExpiring.length === 0 && overdueFollowUp.length === 0 ? (
              <div className="p-4 bg-white dark:bg-slate-800 rounded-xl border border-gray-200 dark:border-slate-700 text-sm text-gray-500 dark:text-gray-400">
                ✨ 오늘은 처리할 긴급 알림이 없습니다. 좋은 하루 보내세요!
              </div>
            ) : (
              <>
                {overdueBalance[0] && (
                  <AlertCard
                    color="red"
                    icon="priority_high"
                    title={`잔금일 지남: ${overdueBalance[0].address}`}
                    desc={`잔금일 ${overdueBalance[0].balanceDate} (${overdueBalance.length > 1 ? `외 ${overdueBalance.length - 1}건` : ""})`}
                    href="/properties"
                  />
                )}
                {urgentExpiring[0] && (
                  <AlertCard
                    color="orange"
                    icon="schedule"
                    title={`만기 임박: ${urgentExpiring[0].address}`}
                    desc={`D-${dDay(urgentExpiring[0].endDate)} 만기 도래, 연장 의사 확인 필요 (외 ${urgentExpiring.length - 1}건)`}
                    href="/expiry"
                  />
                )}
                {overdueFollowUp[0] && (
                  <AlertCard
                    color="purple"
                    icon="contact_phone"
                    title={`후속연락 지남: ${overdueFollowUp[0].name || "고객님"}`}
                    desc={`예정일 ${overdueFollowUp[0].nextFollowUp} (외 ${overdueFollowUp.length - 1}건)`}
                    href={`/customers?focus=${overdueFollowUp[0].id}`}
                  />
                )}
              </>
            )}
          </div>

          {/* 빠른 실행 4개 — 페이지별 색 */}
          <div className="lg:col-span-5 space-y-3">
            <h4 className="text-base font-bold text-gray-900 dark:text-gray-100">빠른 실행</h4>
            <div className="grid grid-cols-2 gap-3">
              <QuickActionCard
                icon="add_business"
                label="단지 빠른 등록"
                colorPage="properties"
                href="/properties"
              />
              <QuickActionCard
                icon="fact_check"
                label="잔금/만기 일괄"
                colorPage="expiry"
                href="/properties"
              />
              <QuickActionCard
                icon="auto_awesome"
                label="AI 문구 생성"
                colorPage="ai-content"
                href="/"
              />
              <button
                onClick={() => alert("준비 중인 기능입니다. 곧 사용자 정의 액션 추가가 지원됩니다.")}
                className="flex flex-col items-center justify-center gap-2 p-5 bg-white dark:bg-slate-800/40 border-2 border-dashed border-gray-300 dark:border-slate-600 rounded-2xl hover:bg-gray-50 dark:hover:bg-slate-800 transition-colors text-gray-500 dark:text-gray-400"
              >
                <span className="material-symbols-outlined">add</span>
                <span className="text-xs font-semibold">기능 추가</span>
              </button>
            </div>
          </div>
        </section>

        {/* ─── 4) 최근 업데이트 매물 ─── */}
        <section className="space-y-3">
          <div className="flex justify-between items-center">
            <h4 className="text-base font-bold text-gray-900 dark:text-gray-100">최근 업데이트 매물</h4>
            <Link href="/properties" className="text-xs font-bold text-emerald-700 dark:text-emerald-400 hover:underline">
              전체 보기 →
            </Link>
          </div>

          {recentProps.length === 0 ? (
            <div className="bg-white dark:bg-slate-800 rounded-2xl border border-gray-200 dark:border-slate-700 p-8 text-center">
              <div className="text-4xl mb-2">🏘️</div>
              <p className="text-sm text-gray-500 dark:text-gray-400 mb-3">아직 등록된 매물이 없습니다</p>
              <Link href="/properties" className="inline-block text-xs px-4 py-2 rounded-full bg-emerald-600 text-white font-semibold">
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
                      <th className="px-4 py-3 text-xs font-bold text-gray-600 dark:text-gray-400">거래 유형</th>
                      <th className="px-4 py-3 text-xs font-bold text-gray-600 dark:text-gray-400">매물명 / 상세</th>
                      <th className="px-4 py-3 text-xs font-bold text-gray-600 dark:text-gray-400">가격 (만원)</th>
                      <th className="px-4 py-3 text-xs font-bold text-gray-600 dark:text-gray-400">진행 단계</th>
                      <th className="px-4 py-3 text-xs font-bold text-gray-600 dark:text-gray-400">업데이트</th>
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
      </main>
    </div>
  );
}

/* ───────────────── 컴포넌트 ───────────────── */

function KpiCard({ icon, label, value, sub, colorPage, href, badge }: {
  icon: string;
  label: string;
  value: string;
  sub: string;
  colorPage: keyof typeof PAGE_THEMES;
  href: string;
  badge?: string;
}) {
  const t = PAGE_THEMES[colorPage];
  return (
    <Link
      href={href}
      className={`block p-4 bg-white dark:bg-slate-800 rounded-2xl shadow-sm border border-gray-200 dark:border-slate-700 hover:shadow-md hover:-translate-y-0.5 transition-all group`}
    >
      <div className="flex justify-between items-start mb-3">
        <span className={`p-2 rounded-lg material-symbols-outlined text-xl ${t.light.iconBg} ${t.light.icon} ${t.dark.iconBg} ${t.dark.icon}`}>
          {icon}
        </span>
        {badge && (
          <span className={`text-[10px] px-2 py-0.5 rounded-full font-bold ${t.light.badge} ${t.dark.badge}`}>
            {badge}
          </span>
        )}
      </div>
      <p className="text-xs text-gray-500 dark:text-gray-400">{label}</p>
      <h3 className={`text-xl sm:text-2xl font-bold mt-1 ${t.light.text} ${t.dark.text}`}>
        {value}
      </h3>
      <p className={`text-[11px] font-medium mt-1 ${t.light.icon} ${t.dark.icon}`}>{sub}</p>
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
      <div className="flex items-center gap-3 min-w-0">
        <span className={`material-symbols-outlined shrink-0 ${s.iconColor}`}>{icon}</span>
        <div className="min-w-0">
          <p className="font-bold text-sm text-gray-900 dark:text-gray-100 truncate">{title}</p>
          <p className="text-xs text-gray-500 dark:text-gray-400 truncate">{desc}</p>
        </div>
      </div>
      <div className="flex items-center gap-2 shrink-0 ml-2">
        <span className={`w-2 h-2 rounded-full ${s.dot}`} />
        <span className="material-symbols-outlined text-gray-400">chevron_right</span>
      </div>
    </Link>
  );
}

function QuickActionCard({ icon, label, colorPage, href }: {
  icon: string;
  label: string;
  colorPage: keyof typeof PAGE_THEMES;
  href: string;
}) {
  const t = PAGE_THEMES[colorPage];
  return (
    <Link
      href={href}
      className={`flex flex-col items-center justify-center gap-2 p-5 bg-white dark:bg-slate-800 border ${t.light.border} ${t.dark.border} rounded-2xl ${t.light.bg.replace("bg-", "hover:bg-")} ${t.dark.bg.replace("dark:bg-", "dark:hover:bg-")} transition-all group`}
    >
      <span className={`p-3 rounded-full material-symbols-outlined ${t.light.iconBg} ${t.light.icon} ${t.dark.iconBg} ${t.dark.icon} group-hover:scale-110 transition-transform`}>
        {icon}
      </span>
      <span className={`text-xs font-bold ${t.light.text} ${t.dark.text}`}>{label}</span>
    </Link>
  );
}

/* ── 매물 행 (데스크탑) ── */
const DEAL_TYPE_STYLES = {
  "매매": { badge: "bg-red-500 text-white",     text: "text-red-700 dark:text-red-400",     bar: "bg-red-500" },
  "전세": { badge: "bg-blue-500 text-white",    text: "text-blue-700 dark:text-blue-400",   bar: "bg-blue-500" },
  "월세": { badge: "bg-amber-500 text-white",   text: "text-amber-700 dark:text-amber-400", bar: "bg-amber-500" },
} as const;

function priceStr(p: Property): string {
  if (p.dealType === "월세") {
    return `${fmtNum(p.price)} / ${fmtNum(p.monthly)}`;
  }
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
      <td className="px-4 py-3">
        <span className={`px-3 py-1 text-[10px] font-bold rounded-full ${s.badge}`}>
          {p.dealType}
        </span>
      </td>
      <td className="px-4 py-3 min-w-0">
        <p className="font-bold text-sm text-gray-900 dark:text-gray-100 group-hover:text-emerald-700 dark:group-hover:text-emerald-400 transition-colors truncate">
          {p.address}
        </p>
        <p className="text-[11px] text-gray-500 dark:text-gray-400 truncate">
          {[p.area && `${p.area}㎡`, p.rooms && `${p.rooms}룸`, p.direction].filter(Boolean).join(" · ")}
        </p>
      </td>
      <td className="px-4 py-3">
        <p className={`font-bold text-sm ${s.text}`}>{priceStr(p)}</p>
      </td>
      <td className="px-4 py-3">
        <div className="flex items-center gap-2">
          <div className="w-20 h-1.5 bg-gray-200 dark:bg-slate-700 rounded-full overflow-hidden">
            <div className={`h-full ${s.bar} transition-all`} style={{ width: `${prog.percent}%` }} />
          </div>
          <span className="text-[11px] font-medium text-gray-600 dark:text-gray-300 whitespace-nowrap">{prog.label}</span>
        </div>
      </td>
      <td className="px-4 py-3 text-[11px] text-gray-500 dark:text-gray-400">{timeAgo(p.createdAt)}</td>
    </tr>
  );
}

function PropertyCardMobile({ property: p }: { property: Property }) {
  const s = DEAL_TYPE_STYLES[p.dealType];
  const prog = progressInfo(p);
  return (
    <div className="p-3 hover:bg-gray-50 dark:hover:bg-slate-900/50">
      <div className="flex items-start justify-between gap-2 mb-1">
        <span className={`px-2 py-0.5 text-[10px] font-bold rounded-full ${s.badge} shrink-0`}>
          {p.dealType}
        </span>
        <span className="text-[10px] text-gray-400">{timeAgo(p.createdAt)}</span>
      </div>
      <p className="font-bold text-sm text-gray-900 dark:text-gray-100 break-all">{p.address}</p>
      <p className="text-[11px] text-gray-500 dark:text-gray-400 mt-0.5">
        {[p.area && `${p.area}㎡`, p.rooms && `${p.rooms}룸`, p.direction].filter(Boolean).join(" · ")}
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
