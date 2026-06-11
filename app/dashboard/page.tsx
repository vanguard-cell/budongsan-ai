"use client";

/**
 * 🏠 홈 — DealDone 리디자인 (2026-06, 블루 톤)
 *
 * 구성 (사용자 확정안):
 *  1) 인사 — "안녕하세요, OOO 대표님" (블루 강조) + 날짜 + 오늘 처리할 일 N건
 *  2) 상단 4카드 (순서 고정): 오늘 일정 / 잔금 관련 / 만기 임박 / 손님 관리
 *     — 상단 3px 색 띠 + 라벨·아이콘 + 큰 건수 + 대표 1건 미리보기
 *  3) 하단 박스 2개: 중요 알림 / 빠른 실행 (편집은 다음 단계)
 *
 * 카드·알림 클릭 → 우측 슬라이드 패널(SideDrawer, 밀어내기 방식)에서 바로 전화/문자/상세.
 */

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useAuth, roleTitle } from "@/lib/auth-context";
import { subscribeProperties, type Property } from "@/lib/properties-db";
import { subscribeContracts } from "@/lib/contracts-db";
import { subscribeCustomers } from "@/lib/customers-db";
import { subscribeSchedules, type Schedule } from "@/lib/schedules-db";
import type { Contract } from "@/app/expiry/contracts";
import type { Customer } from "@/app/customers/customer-types";
import { dDay } from "@/app/expiry/contracts";
import { followUpDDay, followUpSeverity } from "@/app/customers/customer-types";
import SideDrawer, { DrawerItem, DrawerEmpty, type ContactKind } from "@/app/components/SideDrawer";

/* 상태색 — 의미 고정 (메모리 확정안) */
const C = {
  orange: "#EF9F27",  // 오늘 일정
  green:  "#1D9E75",  // 잔금
  red:    "#E24B4A",  // 만기·긴급
  blue:   "#2563EB",  // 손님·브랜드
} as const;

function todayISO(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function dDayLabel(dd: number): string {
  if (dd === 0) return "오늘";
  if (dd > 0) return `D-${dd}`;
  return `${-dd}일 지남`;
}

/* D-day 긴급도 → 배지 색 */
function ddColor(dd: number): string {
  if (dd < 0) return C.red;
  if (dd === 0) return C.orange;
  if (dd <= 7) return C.orange;
  return "#9ca3af";
}

type DrawerType = "schedule" | "balance" | "expiry" | "customer" | null;

interface ExpiryItem {
  address: string;
  endDate: string;
  contacts: { label: string; phone?: string; kind?: ContactKind }[];
}

/* 연락 칩 라벨 — "역할 이름" (이름 없으면 역할만) */
function roleLabel(role: string, name?: string): string {
  return name ? `${role} ${name}` : role;
}

export default function DashboardPage() {
  const router = useRouter();
  const { user, loading: authLoading } = useAuth();
  const [properties, setProperties] = useState<Property[]>([]);
  const [contracts, setContracts]   = useState<Contract[]>([]);
  const [customers, setCustomers]   = useState<Customer[]>([]);
  const [schedules, setSchedules]   = useState<Schedule[]>([]);
  const [drawer, setDrawer]         = useState<DrawerType>(null);

  useEffect(() => {
    if (!authLoading && !user) router.replace("/login?redirect=/dashboard");
  }, [authLoading, user, router]);

  useEffect(() => {
    if (!user) return;
    const u1 = subscribeProperties(user.agencyId, setProperties);
    const u2 = subscribeContracts(user.agencyId, setContracts);
    const u3 = subscribeCustomers(user.agencyId, setCustomers);
    const u4 = subscribeSchedules(user.agencyId, setSchedules);
    return () => { u1(); u2(); u3(); u4(); };
  }, [user]);

  const todayStr = todayISO();
  const activeProps = useMemo(() => properties.filter(p => p.status === "active"), [properties]);

  /* ── ① 오늘 일정 ── */
  const todaySchedules = useMemo(() =>
    schedules
      .filter(s => s.date === todayStr && s.status === "scheduled")
      .sort((a, b) => a.time.localeCompare(b.time)),
    [schedules, todayStr],
  );

  /* ── ② 잔금 관련 — 잔금일이 30일 이내이거나 이미 지난 진행중 매물 ── */
  const balanceItems = useMemo(() =>
    activeProps
      .filter(p => p.balanceDate && dDay(p.balanceDate) <= 30)
      .sort((a, b) => (a.balanceDate || "").localeCompare(b.balanceDate || "")),
    [activeProps],
  );
  const overdueBalance = useMemo(
    () => balanceItems.filter(p => p.balanceDate! < todayStr),
    [balanceItems, todayStr],
  );

  /* ── ③ 만기 임박 — 만기관리 계약 + 내 매물 임대만기 (D-30 ~ 지난 7일) ── */
  const expiringSoon = useMemo(() => {
    const inRange = (d: string) => { const dd = dDay(d); return dd <= 30 && dd >= -7; };
    const items: ExpiryItem[] = [];
    for (const c of contracts) {
      if (c.status === "active" && c.endDate && inRange(c.endDate)) {
        items.push({
          address: c.address, endDate: c.endDate,
          contacts: [
            { label: roleLabel("임대인", c.landlordName), phone: c.landlordPhone || undefined, kind: "owner" },
            { label: roleLabel("임차인", c.tenantName), phone: c.tenantPhone || undefined, kind: "tenant" },
          ],
        });
      }
    }
    for (const p of activeProps) {
      if (p.leaseEndDate && inRange(p.leaseEndDate)) {
        items.push({
          address: p.address, endDate: p.leaseEndDate,
          contacts: [
            { label: roleLabel("집주인", p.ownerName), phone: p.ownerPhone || undefined, kind: "owner" },
            { label: roleLabel("임차인", p.tenantName), phone: p.tenantPhone || undefined, kind: "tenant" },
          ],
        });
      }
    }
    return items.sort((a, b) => a.endDate.localeCompare(b.endDate));
  }, [contracts, activeProps]);
  const urgentExpiring = useMemo(() => expiringSoon.filter(x => dDay(x.endDate) <= 7), [expiringSoon]);

  /* ── ④ 손님 관리 — 후속연락 임박·오늘·지남 ── */
  const followUpNeeded = useMemo(() =>
    customers
      .filter(c => {
        if (c.status !== "active") return false;
        const s = followUpSeverity(followUpDDay(c.nextFollowUp));
        return s === "overdue" || s === "today" || s === "soon";
      })
      .sort((a, b) => followUpDDay(a.nextFollowUp) - followUpDDay(b.nextFollowUp)),
    [customers],
  );
  const overdueFollowUp = useMemo(() =>
    followUpNeeded.filter(c => c.nextFollowUp && c.nextFollowUp < todayStr),
    [followUpNeeded, todayStr],
  );

  /* 오늘 처리할 일 = 오늘 일정 + 잔금 지남 + 만기 D-7 + 후속 오늘·지남 */
  const todayTaskCount =
    todaySchedules.length +
    overdueBalance.length +
    urgentExpiring.length +
    followUpNeeded.filter(c => followUpDDay(c.nextFollowUp) <= 0).length;

  if (authLoading || !user) {
    return <div className="min-h-screen flex items-center justify-center text-gray-400 text-sm">불러오는 중…</div>;
  }

  const userName = user.displayName || user.email?.split("@")[0] || "이용자";
  const title = roleTitle(user.role);   // "대표님" | "파트너님"
  const dateLabel = new Date().toLocaleDateString("ko-KR", {
    year: "numeric", month: "long", day: "numeric", weekday: "long",
  });

  /* 카드 미리보기 텍스트 */
  const s0 = todaySchedules[0];
  const previewSchedule = s0
    ? `${s0.time} ${s0.scheduleType} · ${s0.visitorName || s0.propertyAddress || "일정"}`
    : null;
  const b0 = balanceItems[0];
  const previewBalance = b0
    ? `${b0.address} · ${dDayLabel(dDay(b0.balanceDate!))}`
    : null;
  const e0 = expiringSoon[0];
  const previewExpiry = e0
    ? `${e0.address} · ${dDayLabel(dDay(e0.endDate))}`
    : null;
  const f0 = followUpNeeded[0];
  const previewCustomer = f0
    ? `${f0.name || "고객님"} · 연락 ${dDayLabel(followUpDDay(f0.nextFollowUp))}`
    : null;

  return (
    <div className={`p-5 lg:p-8 transition-[padding] duration-300 ease-out ${drawer ? "xl:pr-[400px]" : ""}`}>
      <div className="space-y-8">
        {/* ─── 1) 인사 ─── */}
        <header>
          <h2 className="text-2xl lg:text-3xl font-bold text-gray-900 dark:text-gray-100 tracking-tight">
            안녕하세요,{" "}
            <span className="text-[var(--brand-blue)] dark:text-blue-400">{userName} {title}</span>
          </h2>
          <p className="text-sm lg:text-base text-gray-500 dark:text-gray-400 mt-2">
            {dateLabel} · 오늘 처리할 일{" "}
            <span className={`font-bold ${todayTaskCount > 0 ? "text-[var(--brand-blue)] dark:text-blue-400" : "text-gray-400"}`}>
              {todayTaskCount}건
            </span>
          </p>
        </header>

        {/* ─── 2) 상단 4카드 (순서 고정) ─── */}
        <section className="grid grid-cols-2 lg:grid-cols-4 gap-3 lg:gap-4">
          <SummaryCard
            color={C.orange}
            icon="today"
            label="오늘 일정"
            count={todaySchedules.length}
            preview={previewSchedule}
            emptyText="오늘 일정 없음"
            onClick={() => setDrawer("schedule")}
          />
          <SummaryCard
            color={C.green}
            icon="account_balance_wallet"
            label="잔금 관련"
            count={balanceItems.length}
            preview={previewBalance}
            emptyText="예정된 잔금 없음"
            badge={overdueBalance.length > 0 ? `지남 ${overdueBalance.length}` : undefined}
            onClick={() => setDrawer("balance")}
          />
          <SummaryCard
            color={C.red}
            icon="event_busy"
            label="만기 임박"
            count={expiringSoon.length}
            preview={previewExpiry}
            emptyText="30일 내 만기 없음"
            badge={urgentExpiring.length > 0 ? `D-7 ${urgentExpiring.length}` : undefined}
            onClick={() => setDrawer("expiry")}
          />
          <SummaryCard
            color={C.blue}
            icon="group"
            label="손님 관리"
            count={followUpNeeded.length}
            preview={previewCustomer}
            emptyText="연락할 손님 없음"
            badge={overdueFollowUp.length > 0 ? `지남 ${overdueFollowUp.length}` : undefined}
            onClick={() => setDrawer("customer")}
          />
        </section>

        {/* ─── 3) 하단 박스 2개: 중요 알림 + 빠른 실행 ─── */}
        <section className="grid grid-cols-1 lg:grid-cols-2 gap-4 lg:gap-6">
          {/* 중요 알림 */}
          <div className="bg-white dark:bg-slate-800 rounded-2xl border border-gray-200/80 dark:border-slate-700 shadow-sm p-5">
            <h4 className="flex items-center gap-2 text-base font-bold text-gray-900 dark:text-gray-100 mb-4">
              <span className="material-symbols-outlined text-[20px]" style={{ color: C.red }}>campaign</span>
              중요 알림
            </h4>

            {overdueBalance.length === 0 && urgentExpiring.length === 0 && overdueFollowUp.length === 0 ? (
              <div className="py-8 text-center text-sm text-gray-400 dark:text-gray-500">
                ✨ 지금은 긴급한 알림이 없습니다
              </div>
            ) : (
              <div className="space-y-2">
                {overdueBalance.slice(0, 2).map(p => (
                  <AlertRow
                    key={`bal-${p.id}`}
                    color={C.red}
                    icon="priority_high"
                    title={`잔금일 지남 · ${p.address}`}
                    desc={`잔금일 ${p.balanceDate}`}
                    onClick={() => setDrawer("balance")}
                  />
                ))}
                {urgentExpiring.slice(0, 2).map((x, i) => (
                  <AlertRow
                    key={`exp-${i}`}
                    color={C.red}
                    icon="schedule"
                    title={`만기 ${dDayLabel(dDay(x.endDate))} · ${x.address}`}
                    desc="연장 의사 확인 필요"
                    onClick={() => setDrawer("expiry")}
                  />
                ))}
                {overdueFollowUp.slice(0, 2).map(c => (
                  <AlertRow
                    key={`fu-${c.id}`}
                    color={C.orange}
                    icon="contact_phone"
                    title={`후속연락 지남 · ${c.name || "고객님"}`}
                    desc={`예정일 ${c.nextFollowUp}`}
                    onClick={() => setDrawer("customer")}
                  />
                ))}
              </div>
            )}
          </div>

          {/* 빠른 실행 */}
          <div className="bg-white dark:bg-slate-800 rounded-2xl border border-gray-200/80 dark:border-slate-700 shadow-sm p-5">
            <div className="flex items-center justify-between mb-4">
              <h4 className="flex items-center gap-2 text-base font-bold text-gray-900 dark:text-gray-100">
                <span className="material-symbols-outlined text-[20px] text-[var(--brand-blue)]">bolt</span>
                빠른 실행
              </h4>
              <button
                onClick={() => alert("빠른 실행 편집은 곧 지원됩니다. 원하는 기능을 직접 넣고 뺄 수 있어요!")}
                className="text-xs font-semibold text-gray-400 hover:text-[var(--brand-blue)] dark:hover:text-blue-400 flex items-center gap-1 transition-colors"
              >
                <span className="material-symbols-outlined text-[14px]">tune</span>
                편집
              </button>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <QuickAction icon="add_home"        label="매물 등록" href="/properties?new=1" />
              <QuickAction icon="post_add"        label="계약 추가" href="/expiry?new=1" />
              <QuickAction icon="person_add"      label="손님 추가" href="/customers?new=1" />
              <QuickAction icon="calendar_add_on" label="약속 추가" href="/schedule?new=1" />
            </div>
          </div>
        </section>
      </div>

      {/* ─── 슬라이드 패널 (방식 A: 밀어내기) ─── */}
      <SideDrawer
        open={drawer === "schedule"}
        onClose={() => setDrawer(null)}
        title="오늘 일정"
        icon="today"
        accent={C.orange}
        count={todaySchedules.length}
        moreHref="/schedule"
      >
        {todaySchedules.length === 0 ? (
          <DrawerEmpty text="오늘 잡힌 일정이 없습니다" />
        ) : (
          todaySchedules.map(s => (
            <DrawerItem
              key={s.id}
              title={`${s.time} · ${s.scheduleType}`}
              sub={[s.visitorName, s.propertyAddress, s.memo].filter(Boolean).join(" · ")}
              badge="오늘"
              badgeColor={C.orange}
              contacts={[{ label: s.visitorName || "방문자", phone: s.visitorPhone || undefined }]}
              detailHref="/schedule"
            />
          ))
        )}
      </SideDrawer>

      <SideDrawer
        open={drawer === "balance"}
        onClose={() => setDrawer(null)}
        title="잔금 관련"
        icon="account_balance_wallet"
        accent={C.green}
        count={balanceItems.length}
        moreHref="/properties"
      >
        {balanceItems.length === 0 ? (
          <DrawerEmpty text="30일 내 예정된 잔금이 없습니다" />
        ) : (
          balanceItems.map(p => (
            <DrawerItem
              key={p.id}
              title={p.address}
              sub={`잔금일 ${p.balanceDate} · ${p.dealType} ${p.price ? Number(p.price).toLocaleString() + "만" : ""}`}
              badge={dDayLabel(dDay(p.balanceDate!))}
              badgeColor={ddColor(dDay(p.balanceDate!))}
              contacts={[
                { label: roleLabel("집주인", p.ownerName), phone: p.ownerPhone || undefined, kind: "owner" },
                { label: roleLabel("임차인", p.tenantName), phone: p.tenantPhone || undefined, kind: "tenant" },
              ]}
              detailHref={`/properties?q=${encodeURIComponent(p.address)}`}
            />
          ))
        )}
      </SideDrawer>

      <SideDrawer
        open={drawer === "expiry"}
        onClose={() => setDrawer(null)}
        title="만기 임박"
        icon="event_busy"
        accent={C.red}
        count={expiringSoon.length}
        moreHref="/expiry"
      >
        {expiringSoon.length === 0 ? (
          <DrawerEmpty text="30일 내 만기가 없습니다" />
        ) : (
          expiringSoon.map((x, i) => (
            <DrawerItem
              key={`${x.address}-${x.endDate}-${i}`}
              title={x.address}
              sub={`만기일 ${x.endDate}`}
              badge={dDayLabel(dDay(x.endDate))}
              badgeColor={ddColor(dDay(x.endDate))}
              contacts={x.contacts}
              detailHref="/expiry"
            />
          ))
        )}
      </SideDrawer>

      <SideDrawer
        open={drawer === "customer"}
        onClose={() => setDrawer(null)}
        title="손님 관리"
        icon="group"
        accent={C.blue}
        count={followUpNeeded.length}
        moreHref="/customers"
      >
        {followUpNeeded.length === 0 ? (
          <DrawerEmpty text="연락이 필요한 손님이 없습니다" />
        ) : (
          followUpNeeded.map(c => (
            <DrawerItem
              key={c.id}
              title={c.name || "고객님"}
              sub={[`연락 예정 ${c.nextFollowUp}`, c.preferredArea, c.budget].filter(Boolean).join(" · ")}
              badge={dDayLabel(followUpDDay(c.nextFollowUp))}
              badgeColor={ddColor(followUpDDay(c.nextFollowUp))}
              contacts={[{ label: c.name || "고객", phone: c.phone || undefined }]}
              detailHref={`/customers?focus=${c.id}`}
            />
          ))
        )}
      </SideDrawer>
    </div>
  );
}

/* ─────────────── 컴포넌트 ─────────────── */

/** 상단 요약 카드 — 색 띠 + 라벨 + 큰 건수 + 대표 1건 미리보기. 클릭 → 슬라이드 패널 */
function SummaryCard({ color, icon, label, count, preview, emptyText, badge, onClick }: {
  color: string;
  icon: string;
  label: string;
  count: number;
  preview: string | null;
  emptyText: string;
  badge?: string;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className="block w-full text-left bg-white dark:bg-slate-800 rounded-2xl border border-gray-200/80 dark:border-slate-700 shadow-sm overflow-hidden hover:shadow-md hover:-translate-y-0.5 transition-all cursor-pointer"
      style={{ borderTop: `3px solid ${color}` }}
    >
      <div className="p-4 lg:p-5">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-1.5 text-[13px] font-semibold text-gray-500 dark:text-gray-400">
            <span className="material-symbols-outlined text-[18px]" style={{ color }}>{icon}</span>
            {label}
          </div>
          {badge && (
            <span
              className="text-[10px] px-1.5 py-0.5 rounded-full font-bold text-white"
              style={{ backgroundColor: color }}
            >
              {badge}
            </span>
          )}
        </div>
        <p className="text-3xl font-bold tracking-tight" style={{ color: count > 0 ? color : "#9ca3af" }}>
          {count}<span className="text-base font-semibold ml-0.5 text-gray-400">건</span>
        </p>
        <p className={`mt-2 text-xs truncate ${preview ? "text-gray-600 dark:text-gray-300" : "text-gray-400 dark:text-gray-500"}`}>
          {preview || emptyText}
        </p>
      </div>
    </button>
  );
}

/** 중요 알림 한 줄 — 클릭 → 슬라이드 패널 */
function AlertRow({ color, icon, title, desc, onClick }: {
  color: string;
  icon: string;
  title: string;
  desc: string;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className="flex w-full text-left items-center gap-3 p-3 rounded-xl bg-gray-50/80 dark:bg-slate-900/50 hover:bg-gray-100 dark:hover:bg-slate-900 transition-colors cursor-pointer"
    >
      <span
        className="w-8 h-8 rounded-full flex items-center justify-center shrink-0 text-white"
        style={{ backgroundColor: color }}
      >
        <span className="material-symbols-outlined text-[18px] leading-none">{icon}</span>
      </span>
      <div className="min-w-0 flex-1">
        <p className="font-bold text-[13px] text-gray-900 dark:text-gray-100 truncate">{title}</p>
        <p className="text-xs text-gray-500 dark:text-gray-400 truncate">{desc}</p>
      </div>
      <span className="material-symbols-outlined text-gray-300 dark:text-gray-600 text-[18px] shrink-0">chevron_right</span>
    </button>
  );
}

/** 빠른 실행 타일 */
function QuickAction({ icon, label, href }: { icon: string; label: string; href: string }) {
  return (
    <Link
      href={href}
      className="flex items-center gap-3 p-3.5 rounded-xl border border-gray-200/80 dark:border-slate-700 hover:border-[var(--brand-blue)]/40 hover:bg-[var(--brand-blue-soft)] dark:hover:bg-blue-950/30 transition-all group"
    >
      <span className="w-9 h-9 rounded-lg flex items-center justify-center bg-[var(--brand-blue-soft)] dark:bg-blue-950/50 text-[var(--brand-blue)] dark:text-blue-400 group-hover:scale-105 transition-transform shrink-0">
        <span className="material-symbols-outlined text-[20px] leading-none">{icon}</span>
      </span>
      <span className="font-bold text-sm text-gray-800 dark:text-gray-200">{label}</span>
    </Link>
  );
}
