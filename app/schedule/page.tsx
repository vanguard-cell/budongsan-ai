"use client";

import { useState, useEffect, useMemo } from "react";
import { useRouter } from "next/navigation";
import { useAuth, recordFeatureUse } from "@/lib/auth-context";
import {
  subscribeSchedules, saveSchedule, deleteSchedule, emptySchedule,
  saveSchedulesBatch, sampleSchedules,
  type Schedule, type ScheduleType,
} from "@/lib/schedules-db";
import { subscribeProperties, emptyProperty, type Property } from "@/lib/properties-db";
import { subscribeCustomers } from "@/lib/customers-db";
import { subscribeContracts } from "@/lib/contracts-db";
import { dDay, type Contract } from "@/app/expiry/contracts";
import type { Customer } from "@/app/customers/customer-types";
import MonthCalendar, { type CalendarItem } from "./MonthCalendar";
import SideDrawer from "@/app/components/SideDrawer";
import { downloadIcs } from "@/lib/ics";
import { PROPERTY_TYPES } from "@/app/properties/helpers";

/* ── 타입 ── */
type SourceFilter = "all" | "appointment" | "visit" | "contractDate" | "downPaymentDate" | "balanceDate" | "renewal";
type ItemSource   = Exclude<SourceFilter, "all">;
type PropertyDateKind = "contractDate" | "downPaymentDate" | "balanceDate" | "renewal";
const KIND_LABEL: Record<PropertyDateKind, string> = {
  contractDate: "계약일", downPaymentDate: "중도금일", balanceDate: "잔금일", renewal: "재계약",
};

interface UnifiedItem {
  key: string;
  source: ItemSource;
  date: string;       // YYYY-MM-DD (정렬 기준)
  time: string;
  schedule?: Schedule;
  customer?: Customer;
  property?: Property;
  propertyKind?: PropertyDateKind;  // Property에서 어느 날짜인지
  contract?: Contract;              // 만기로 이전된 계약(있으면 매물 대신 만기로 연결)
}

const SCHEDULE_TYPES: ScheduleType[] = ["집보기", "방문", "계약일", "중도금일", "잔금일", "재계약일", "기타"];
const TYPE_COLORS: Record<ScheduleType, string> = {
  "집보기":   "bg-blue-100 text-blue-700",
  "방문":     "bg-sky-100 text-sky-700",
  "계약일":   "bg-purple-100 text-purple-700",
  "중도금일": "bg-pink-100 text-pink-700",
  "잔금일":   "bg-amber-100 text-amber-700",
  "재계약일": "bg-emerald-100 text-emerald-700",
  "기타":     "bg-gray-100 text-gray-600",
};

/** 목록 한 줄 — 종류색 막대 + 짧은 라벨 (시안 A) */
const SOURCE_BAR: Record<ItemSource, string> = {
  appointment:     "#2383E2",
  visit:           "#0EA5E9",
  contractDate:    "#7F77DD",
  downPaymentDate: "#D4537E",
  balanceDate:     "#EF9F27",
  renewal:         "#10B981",
};
const SCHEDULE_SHORT: Record<ScheduleType, string> = {
  "집보기": "집보기", "방문": "방문", "계약일": "계약", "중도금일": "중도금", "잔금일": "잔금", "재계약일": "재계약", "기타": "기타",
};

/** schedule.scheduleType → 필터 분류 (계약/중도금/잔금/재계약은 별도, 집보기/기타는 약속) */
function scheduleTypeToSource(t: ScheduleType): ItemSource {
  if (t === "계약일")   return "contractDate";
  if (t === "중도금일") return "downPaymentDate";
  if (t === "잔금일")   return "balanceDate";
  if (t === "재계약일") return "renewal";
  if (t === "방문" || t === "집보기") return "visit"; // 예전 '집보기'도 방문으로 표시 (저장된 데이터는 그대로)
  return "appointment"; // 기타
}

/** 만기 계약을 스케줄 표시용 Property 형태로 변환 (계약일·중도금·잔금 날짜 + 연락처) */
function contractToDisplayProp(ct: Contract): Property {
  return {
    ...emptyProperty(),
    id: ct.fromPropertyId || ct.id,
    address: ct.address,
    dealType: ct.type,
    price: ct.deposit || "",
    monthly: ct.monthly || "",
    dong: ct.dong || "",
    ho: ct.ho || "",
    ownerName: ct.landlordName, ownerPhone: ct.landlordPhone,
    tenantName: ct.tenantName, tenantPhone: ct.tenantPhone,
    contractDate: ct.contractDate || "",
    downPaymentDate: ct.downPaymentDate || "",
    balanceDate: ct.balanceDate || "",
    status: "active",
  };
}

function formatPhone(raw: string): string {
  const d = raw.replace(/\D/g, "");
  if (d.length === 11) return `${d.slice(0,3)}-${d.slice(3,7)}-${d.slice(7)}`;
  if (d.length === 10) return `${d.slice(0,3)}-${d.slice(3,6)}-${d.slice(6)}`;
  return raw;
}
function isToday(date: string) { return date === new Date().toISOString().slice(0, 10); }
function isFuture(date: string) { return date >= new Date().toISOString().slice(0, 10); }
function fmtDate(date: string) {
  if (!date) return "";
  const d = new Date(date + "T00:00:00");
  if (isNaN(d.getTime())) return date;   // 잘못된 날짜는 원문 그대로 (크래시 방지)
  return d.toLocaleDateString("ko-KR", { month: "long", day: "numeric", weekday: "short" });
}

/* ── 메인 ── */
export default function SchedulePage() {
  const router = useRouter();
  const { user, loading: authLoading } = useAuth();

  const [schedules,  setSchedules]  = useState<Schedule[]>([]);
  const [customers,  setCustomers]  = useState<Customer[]>([]);
  const [properties, setProperties] = useState<Property[]>([]);
  const [contracts,  setContracts]  = useState<Contract[]>([]);   // 만기로 이전된 계약(잔금 등 날짜 보존)
  const [loaded,     setLoaded]     = useState(false);
  const [editing,    setEditing]    = useState<Schedule | null>(null);
  const [filter,     setFilter]     = useState<SourceFilter>("all");
  const [showPast,   setShowPast]   = useState(false);
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [panelItem,  setPanelItem]  = useState<UnifiedItem | null>(null);   // 우측 상세 패널

  useEffect(() => {
    if (!authLoading && !user) router.replace("/login?redirect=/schedule");
  }, [authLoading, user, router]);

  // 홈 빠른 실행 "약속 추가" 진입 (?new=1) → 추가 모달 바로 열기
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (new URLSearchParams(window.location.search).get("new") === "1") {
      setEditing({ ...emptySchedule(), scheduleType: "기타" });
    }
  }, []);

  useEffect(() => {
    if (!user) return;
    const u1 = subscribeSchedules(user.agencyId,  list => { setSchedules(list);  setLoaded(true); });
    const u2 = subscribeCustomers(user.agencyId,  setCustomers);
    const u3 = subscribeProperties(user.agencyId, setProperties);
    const u4 = subscribeContracts(user.agencyId,  setContracts);
    return () => { u1(); u2(); u3(); u4(); };
  }, [user]);

  /* 베이스 아이템 — 만기일 제거, Property의 4개 날짜 추가.
     filter·selectedDate는 적용하지 않음(탭/달력 카운트가 흔들리지 않게). showPast만 적용. */
  const baseItems = useMemo<UnifiedItem[]>(() => {
    const items: UnifiedItem[] = [];

    // ① 사용자가 등록한 일정 (집보기·계약일·중도금일·잔금일·기타)
    for (const s of schedules) {
      if (s.status === "cancelled") continue;
      if (!showPast && s.status === "done") continue;
      if (!showPast && !isFuture(s.date)) continue;
      const src = scheduleTypeToSource(s.scheduleType);
      items.push({ key: `s-${s.id}`, source: src, date: s.date, time: s.time, schedule: s });
    }

    // ② 내 매물의 계약 진행 날짜 (계약일·중도금일·잔금일)
    // ⚠️ 계약일은 시간 포함("YYYY-MM-DDTHH:MM")일 수 있다 — 그대로 쓰면 달력 칸("YYYY-MM-DD")과
    // 문자열이 안 맞아 계약일만 달력에 안 찍혔다 (#35 어머니 버그). 날짜·시간을 분리한다.
    for (const p of properties) {
      if (p.status !== "active") continue;
      const dates: { kind: PropertyDateKind; date: string; source: ItemSource }[] = [
        { kind: "contractDate",    date: p.contractDate,    source: "contractDate" },
        { kind: "downPaymentDate", date: p.downPaymentDate, source: "downPaymentDate" },
        { kind: "balanceDate",     date: p.balanceDate,     source: "balanceDate" },
      ];
      for (const { kind, date, source } of dates) {
        if (!date) continue;
        if (!showPast && !isFuture(date)) continue;
        items.push({
          key: `p-${p.id}-${kind}`, source,
          date: date.slice(0, 10),
          time: date.length > 10 ? date.slice(11, 16) : "",
          property: p, propertyKind: kind,
        });
      }
    }

    // ③ 고객 후속연락 — "약속" 카테고리로 통합
    for (const cu of customers) {
      if (!cu.nextFollowUp) continue;
      if (cu.status === "closed" || cu.status === "lost") continue;
      if (!showPast && !isFuture(cu.nextFollowUp)) continue;
      items.push({ key: `f-${cu.id}`, source: "appointment", date: cu.nextFollowUp, time: "", customer: cu });
    }

    // ④ 만기로 이전된 계약의 계약일·중도금일·잔금일
    //   (매물을 만기로 보내도 잔금 등 일정이 사라지지 않게 — 어머니 피드백 버그픽스)
    for (const ct of contracts) {
      if (ct.status !== "active") continue;
      const dp = contractToDisplayProp(ct);
      // 재계약(연장)으로 생긴 계약 — 계약일·잔금일이 둘 다 재계약일이라 "재계약" 한 건으로 표시 (#39)
      if (ct.renewedFromId) {
        const date = ct.contractDate || ct.startDate;
        if (date && (showPast || isFuture(date))) {
          items.push({
            key: `c-${ct.id}-renewal`, source: "renewal",
            date: date.slice(0, 10),
            time: date.length > 10 ? date.slice(11, 16) : "",
            property: dp, propertyKind: "renewal", contract: ct,
          });
        }
        continue;
      }
      const dates: { kind: PropertyDateKind; date?: string; source: ItemSource }[] = [
        { kind: "contractDate",    date: ct.contractDate,    source: "contractDate" },
        { kind: "downPaymentDate", date: ct.downPaymentDate, source: "downPaymentDate" },
        { kind: "balanceDate",     date: ct.balanceDate,     source: "balanceDate" },
      ];
      for (const { kind, date, source } of dates) {
        if (!date) continue;
        if (!showPast && !isFuture(date)) continue;
        // 만기 계약의 계약일도 시간 포함일 수 있다 — ②와 같은 이유로 분리
        items.push({
          key: `c-${ct.id}-${kind}`, source,
          date: date.slice(0, 10),
          time: date.length > 10 ? date.slice(11, 16) : "",
          property: dp, propertyKind: kind, contract: ct,
        });
      }
    }

    return items;
  }, [schedules, customers, properties, contracts, showPast]);

  /* 우측 목록 — baseItems에 filter + 선택 날짜 적용 */
  const unified = useMemo<UnifiedItem[]>(() => {
    return baseItems
      .filter(i => filter === "all" || i.source === filter)
      .filter(i => !selectedDate || i.date === selectedDate)
      .sort((a, b) => {
        const d = a.date.localeCompare(b.date);
        if (d !== 0) return d;
        return a.time.localeCompare(b.time);
      });
  }, [baseItems, filter, selectedDate]);

  /* 캘린더 점 — baseItems와 동일 집합(필터·선택 무시), 달력은 dot+카운트 표시 */
  const calendarItems = useMemo<CalendarItem[]>(
    () => baseItems.map(i => ({ date: i.date, source: i.source, time: i.time || undefined, title: itemText(i).title || undefined })),
    [baseItems],
  );

  /* 날짜별 그룹 */
  const grouped = useMemo(() => {
    const map: Record<string, UnifiedItem[]> = {};
    for (const i of unified) {
      if (!map[i.date]) map[i.date] = [];
      map[i.date].push(i);
    }
    return Object.entries(map);
  }, [unified]);

  const todayCount = baseItems.filter(i => isToday(i.date)).length;

  /* 필터별 카운트 — baseItems 기준(현재 선택한 필터와 무관하게 고정) */
  const counts = useMemo(() => ({
    all:             baseItems.length,
    appointment:     baseItems.filter(i => i.source === "appointment").length,
    visit:           baseItems.filter(i => i.source === "visit").length,
    contractDate:    baseItems.filter(i => i.source === "contractDate").length,
    downPaymentDate: baseItems.filter(i => i.source === "downPaymentDate").length,
    balanceDate:     baseItems.filter(i => i.source === "balanceDate").length,
    renewal:         baseItems.filter(i => i.source === "renewal").length,
  }), [baseItems]);

  /* 네이버·구글 캘린더용 .ics — 오늘 이후 일정 전체 (탭·날짜 선택과 무관) */
  const exportIcs = () => {
    const today = new Date().toISOString().slice(0, 10);
    const events = baseItems
      .filter(i => i.date >= today && i.schedule?.status !== "done")
      .map(i => {
        const { label, title } = itemText(i);
        return {
          uid: i.key, date: i.date, time: i.time || undefined,
          title: `[${label}] ${title}`,
          description: i.schedule?.memo || undefined,
        };
      });
    if (events.length === 0) { alert("내보낼 앞으로의 일정이 없습니다."); return; }
    downloadIcs(events, `딜던_스케줄_${today}.ics`);
    recordFeatureUse(user?.uid, "sched_ics");
  };

  const upsert = async (s: Schedule) => {
    if (!user) return;
    const isNew = !schedules.some(x => x.id === s.id);
    await saveSchedule(user.agencyId, s);
    if (isNew) recordFeatureUse(user.uid, "sched_add");
  };
  const remove = async (id: string) => {
    if (!user || !confirm("이 일정을 삭제할까요?")) return;
    await deleteSchedule(user.agencyId, id);
  };
  const done = async (s: Schedule) => {
    if (!user) return;
    const markingDone = s.status !== "done";
    await saveSchedule(user.agencyId, { ...s, status: markingDone ? "done" : "scheduled" });
    if (markingDone) recordFeatureUse(user.uid, "sched_done");
  };
  const loadSamples = async () => {
    if (!user) return;
    if (schedules.length > 0 && !confirm("기존 일정이 있습니다. 예시 일정을 추가할까요?")) return;
    await saveSchedulesBatch(user.agencyId, sampleSchedules());
  };
  const clearAll = async () => {
    if (!user) return;
    if (!confirm("⚠️ 등록한 모든 일정(약속·계약일·중도금일·잔금일)을 삭제합니다.\n매물·고객에서 자동으로 따라오는 날짜는 영향받지 않습니다. 진행할까요?")) return;
    for (const s of schedules) await deleteSchedule(user.agencyId, s.id);
  };

  if (authLoading || !user) return (
    <div className="min-h-screen flex items-center justify-center text-gray-400 text-sm">불러오는 중…</div>
  );

  return (
    <div className={`transition-[padding] duration-300 ease-out ${panelItem ? "xl:pr-[400px]" : ""}`}>
      <div className="w-full">

        {/* Stitch 톤 페이지 헤더 — 좌측 제목 + 우측 빠른 등록 */}
        <section className="flex flex-col md:flex-row md:justify-between md:items-end gap-4 mb-5">
          <div>
            <h2 className="flex items-center gap-2 text-2xl sm:text-3xl font-bold text-gray-900 dark:text-gray-100">
              <span className="material-symbols-outlined text-blue-600 dark:text-blue-400" style={{ fontSize: "2rem" }}>calendar_month</span>
              스케줄
            </h2>
            <p className="text-sm text-gray-500 dark:text-gray-400 mt-1.5">
              약속·계약일·중도금일·잔금일·재계약 한눈에 (만기일은 만기관리)
            </p>
          </div>
          <div className="flex flex-wrap gap-1.5">
            <button
              onClick={() => setEditing({ ...emptySchedule(), scheduleType: "기타" })}
              className="text-sm px-3.5 py-2 rounded-xl border border-sky-300 bg-sky-100 text-sky-900 font-normal hover:bg-sky-200 transition-colors whitespace-nowrap"
            >
              + 약속
            </button>
            <button
              onClick={() => setEditing({ ...emptySchedule(), scheduleType: "방문" })}
              className="text-sm px-3.5 py-2 rounded-xl border border-sky-300 bg-sky-100 text-sky-900 font-normal hover:bg-sky-200 transition-colors whitespace-nowrap"
            >
              + 방문
            </button>
            <button
              onClick={() => setEditing({ ...emptySchedule(), scheduleType: "계약일" })}
              className="text-sm px-3.5 py-2 rounded-xl border border-sky-300 bg-sky-100 text-sky-900 font-normal hover:bg-sky-200 transition-colors whitespace-nowrap"
            >
              + 계약일
            </button>
            <button
              onClick={() => setEditing({ ...emptySchedule(), scheduleType: "중도금일" })}
              className="text-sm px-3.5 py-2 rounded-xl border border-sky-300 bg-sky-100 text-sky-900 font-normal hover:bg-sky-200 transition-colors whitespace-nowrap"
            >
              + 중도금일
            </button>
            <button
              onClick={() => setEditing({ ...emptySchedule(), scheduleType: "잔금일" })}
              className="text-sm px-3.5 py-2 rounded-xl border border-sky-300 bg-sky-100 text-sky-900 font-normal hover:bg-sky-200 transition-colors whitespace-nowrap"
            >
              + 잔금일
            </button>
            <button
              onClick={() => setEditing({ ...emptySchedule(), scheduleType: "재계약일" })}
              className="text-sm px-3.5 py-2 rounded-xl border border-sky-300 bg-sky-100 text-sky-900 font-normal hover:bg-sky-200 transition-colors whitespace-nowrap"
            >
              + 재계약
            </button>
            <button
              onClick={loadSamples}
              title="예시 일정 5건 추가"
              className="text-xs px-3 py-2 rounded-xl border border-gray-200 dark:border-slate-700 text-gray-600 dark:text-gray-300 font-semibold hover:bg-gray-50 dark:hover:bg-slate-800 transition-colors flex items-center gap-1"
            >
              <span className="material-symbols-outlined text-base">science</span>
              <span className="hidden sm:inline">예시</span>
            </button>
            {schedules.length > 0 && (
              <button
                onClick={clearAll}
                title="등록한 모든 일정 삭제"
                className="text-xs px-3 py-2 rounded-xl border border-gray-200 dark:border-slate-700 text-gray-500 hover:text-red-600 hover:bg-gray-50 dark:hover:bg-slate-800 transition-colors flex items-center gap-1"
              >
                <span className="material-symbols-outlined text-base">delete_sweep</span>
                <span className="hidden sm:inline">전체 삭제</span>
              </button>
            )}
          </div>
        </section>

        <div className="rounded-2xl border border-[var(--sidebar-bd)] bg-white dark:bg-slate-900 shadow-sm flex flex-col lg:flex-row">
          {/* ── 좌측: 월별 캘린더 (통합 카드 좌측, 넓은 화면에선 고정) ── */}
          <div className="w-full lg:w-[340px] lg:shrink-0 p-3 sm:p-4 lg:border-r border-gray-100 dark:border-slate-800 self-start">
            <MonthCalendar
              flat
              items={calendarItems}
              onSelectDate={d => { if (d) recordFeatureUse(user?.uid, "sched_date"); setSelectedDate(d); }}
              selectedDate={selectedDate}
            />
          </div>

          {/* ── 우측: 필터 + 목록 (통합 카드 우측) ── */}
          <div className="flex-1 min-w-0 w-full p-3 sm:p-4 lg:border-t-0 border-t border-gray-100 dark:border-slate-800">

        {/* 오늘 알림 */}
        {todayCount > 0 && !selectedDate && (
          <div className="bg-blue-50 border border-blue-200 rounded-2xl px-4 py-3 mb-4 text-sm text-blue-800 font-medium">
            📌 오늘 일정 {todayCount}건
          </div>
        )}

        {/* 선택된 날짜 표시 */}
        {selectedDate && (
          <div className="bg-blue-50 border border-blue-200 rounded-2xl px-4 py-3 mb-4 flex items-center justify-between">
            <span className="text-sm text-blue-800 font-medium">
              📅 {new Date(selectedDate + "T00:00:00").toLocaleDateString("ko-KR", { month: "long", day: "numeric", weekday: "long" })} 일정
            </span>
            <button onClick={() => setSelectedDate(null)} className="text-sm px-3.5 py-2 rounded-xl border border-sky-300 bg-sky-100 text-sky-900 font-normal hover:bg-sky-200 transition-colors whitespace-nowrap">
              전체 보기
            </button>
          </div>
        )}

        {/* 필터 탭 — 7개 */}
        <div className="grid grid-cols-7 gap-1.5 mb-4">
          {([
            { key: "all",             icon: "📋", label: "전체",     activeColor: "bg-sky-500", inactiveColor: "bg-sky-100 border-sky-300 text-sky-900" },
            { key: "appointment",     icon: "👥", label: "약속",     activeColor: "bg-sky-500", inactiveColor: "bg-sky-100 border-sky-300 text-sky-900" },
            { key: "visit",           icon: "🚪", label: "방문",     activeColor: "bg-sky-500", inactiveColor: "bg-sky-100 border-sky-300 text-sky-900" },
            { key: "contractDate",    icon: "📝", label: "계약일",   activeColor: "bg-sky-500", inactiveColor: "bg-sky-100 border-sky-300 text-sky-900" },
            { key: "downPaymentDate", icon: "💰", label: "중도금", activeColor: "bg-sky-500", inactiveColor: "bg-sky-100 border-sky-300 text-sky-900" },
            { key: "balanceDate",     icon: "🔑", label: "잔금",   activeColor: "bg-sky-500", inactiveColor: "bg-sky-100 border-sky-300 text-sky-900" },
            { key: "renewal",         icon: "🔁", label: "재계약", activeColor: "bg-sky-500", inactiveColor: "bg-sky-100 border-sky-300 text-sky-900" },
          ] as const).map(tab => (
            <button
              key={tab.key}
              onClick={() => { setFilter(tab.key); if (tab.key !== "all") recordFeatureUse(user?.uid, "sched_filter"); }}
              className={`rounded-2xl border py-2.5 text-center transition-colors font-normal ${
                filter === tab.key
                  ? `${tab.activeColor} text-white border-transparent font-normal`
                  : `${tab.inactiveColor} hover:opacity-80`
              }`}
            >
              <div className="text-base leading-none">{tab.icon}</div>
              <div className="text-xs mt-1 whitespace-nowrap">{tab.label}</div>
              <div className="text-xs font-normal">{counts[tab.key]}</div>
            </button>
          ))}
        </div>

        {/* 캘린더 내보내기 + 지난 일정 토글 */}
        <div className="flex items-center justify-between gap-2 mb-3">
          <button
            onClick={exportIcs}
            title="네이버·구글·아이폰 캘린더에서 '가져오기'로 넣을 수 있는 파일(.ics)을 받습니다"
            className="flex items-center gap-1 text-sm px-3.5 py-2 rounded-xl border border-sky-300 bg-sky-100 text-sky-900 font-normal hover:bg-sky-200 transition-colors whitespace-nowrap"
          >
            <span className="material-symbols-outlined text-[16px]">ios_share</span>
            캘린더로 내보내기
          </button>
          <label className="flex items-center gap-1.5 text-xs text-gray-600 cursor-pointer">
            <input type="checkbox" checked={showPast} onChange={e => setShowPast(e.target.checked)} className="accent-blue-600" />
            지난 일정 포함
          </label>
        </div>

        {/* 목록 */}
        {!loaded ? (
          <div className="text-center text-gray-400 py-12">불러오는 중…</div>
        ) : grouped.length === 0 ? (
          <div className="bg-white rounded-xl border border-gray-200 p-8 text-center">
            <div className="text-5xl mb-3">📅</div>
            <div className="text-base font-semibold text-gray-900 mb-1">일정이 없습니다</div>
            <div className="text-xs text-gray-500 mb-4">약속을 추가하거나 만기·고객 탭을 확인해보세요</div>
            <button onClick={() => setEditing({ ...emptySchedule(), scheduleType: "기타" })} className="text-sm px-4 py-2 rounded-full border-2 border-blue-500 bg-blue-50 text-blue-700 font-semibold">
              + 약속 추가
            </button>
          </div>
        ) : (
          <div className="space-y-5 lg:max-h-[480px] lg:overflow-y-auto lg:pr-1.5">
            {grouped.map(([date, items]) => (
              <div key={date}>
                {/* 날짜 헤더 */}
                <div className={`flex items-center gap-2 mb-2 ${isToday(date) ? "text-blue-700" : "text-gray-500"}`}>
                  <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${isToday(date) ? "bg-blue-100" : "bg-gray-100"}`}>
                    {isToday(date) ? "오늘" : fmtDate(date)}
                  </span>
                  <div className="flex-1 h-px bg-gray-200" />
                  <span className="text-[11px]">{items.length}건</span>
                </div>

                <div className="space-y-1.5">
                  {groupByVisitor(items).map(g => g.items.length > 1 ? (
                    <div key={g.key} className="rounded-xl border border-emerald-200 dark:border-emerald-900 bg-emerald-50/40 dark:bg-emerald-950/20 p-1.5 space-y-1.5">
                      <div className="flex items-center gap-1.5 px-1.5 pt-0.5 text-[12px] font-bold text-emerald-700 dark:text-emerald-400">
                        <span className="material-symbols-outlined text-[14px]">person</span>
                        <span className="whitespace-nowrap">{g.name || "방문자"}</span>
                        {g.phone && <span className="whitespace-nowrap font-semibold">{formatPhone(g.phone)}</span>}
                        <span className="ml-auto whitespace-nowrap text-[11px] font-semibold">매물 {g.items.length}건</span>
                      </div>
                      {g.items.map(item => (
                        <div key={item.key} onClick={() => setPanelItem(item)}>
                          <CompactRow item={item} />
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div key={g.items[0].key} onClick={() => setPanelItem(g.items[0])}>
                      <CompactRow item={g.items[0]} />
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
          </div>{/* 우측 끝 */}
        </div>{/* 2단 끝 */}
      </div>

      {/* ── 우측 상세 패널 (항목 클릭 시) ── */}
      {panelItem && (() => {
        const it = panelItem;
        const s = it.schedule, p = it.property, c = it.customer;
        const accent = SOURCE_BAR[it.source];
        const phoneChip = (label: string, name: string | undefined, phone: string | undefined, kind: "owner" | "tenant" | "visitor") => {
          if (!phone) return null;
          const cls = kind === "owner" ? "bg-amber-50 text-amber-700 hover:bg-amber-100"
            : kind === "tenant" ? "bg-blue-50 text-blue-700 hover:bg-blue-100"
            : "bg-emerald-50 text-emerald-700 hover:bg-emerald-100";
          const tag = name ? `${label} ${name}` : label;
          return (
            <span className="inline-flex max-w-full items-center rounded-full overflow-hidden border border-gray-200 dark:border-slate-600">
              <a href={`tel:${phone.replace(/\D/g, "")}`} className={`inline-flex items-center gap-1 pl-2 pr-1.5 py-1 text-[11px] font-bold transition-colors ${cls}`}>
                <span className="material-symbols-outlined text-[13px]">call</span><span className="whitespace-nowrap">{tag}</span><span className="whitespace-nowrap font-semibold">{formatPhone(phone)}</span>
              </a>
              <a href={`sms:${phone.replace(/\D/g, "")}`} className={`inline-flex items-center px-1.5 py-1 border-l border-gray-200 dark:border-slate-600 transition-colors ${cls}`}>
                <span className="material-symbols-outlined text-[13px]">sms</span>
              </a>
            </span>
          );
        };
        return (
          <SideDrawer open onClose={() => setPanelItem(null)} title="일정 상세" icon="event" accent={accent}>
            {s && (
              <div className="px-1 space-y-3">
                <div>
                  <div className="flex flex-wrap gap-1.5 mb-1.5">
                    <span className={`px-2 py-0.5 rounded-md text-[11px] font-bold ${TYPE_COLORS[s.scheduleType]}`}>{s.scheduleType}</span>
                    <span className="px-2 py-0.5 rounded-md text-[11px] font-bold bg-gray-100 dark:bg-slate-800 text-gray-600 dark:text-gray-300">{s.date} {s.time}</span>
                    {s.status === "done" && <span className="px-2 py-0.5 rounded-md text-[11px] font-bold bg-green-100 text-green-700">완료</span>}
                  </div>
                  <p className="font-bold text-[15px] text-gray-900 dark:text-gray-100 break-all">{s.propertyAddress || "주소 미입력"}</p>
                </div>
                <div className="flex flex-wrap gap-1.5">{phoneChip("방문자", s.visitorName, s.visitorPhone, "visitor")}</div>
                {(() => {
                  const norm = (v: string) => v.replace(/\s+/g, "");
                  const sAddr = norm(s.propertyAddress || "");
                  const linked = (s.propertyId ? properties.find(x => x.id === s.propertyId) : undefined)
                    || (sAddr ? properties.find(x => norm(propertyFullLabel(x)) === sAddr) || properties.find(x => x.address && norm(x.address) === sAddr) : undefined);
                  if (!linked) return null;
                  return (
                    <button onClick={() => router.push(`/properties?pid=${encodeURIComponent(linked.id)}`)} className="w-full flex items-center justify-center gap-1.5 py-2.5 rounded-lg bg-emerald-600 text-white text-[12px] font-bold whitespace-nowrap hover:bg-emerald-700"><span className="material-symbols-outlined text-[15px]">domain</span>내 매물 보기</button>
                  );
                })()}
                {s.memo && <p className="text-[12px] text-gray-600 dark:text-gray-300 bg-gray-50 dark:bg-slate-800 rounded-lg px-2.5 py-2">💬 {s.memo}</p>}
                <div className="grid grid-cols-2 gap-1.5 pt-1">
                  <button onClick={() => { setEditing({ ...s }); setPanelItem(null); }} className="flex items-center justify-center gap-1.5 py-2.5 rounded-lg bg-[var(--brand-blue)] text-white text-[12px] font-bold hover:bg-[var(--brand-blue-dark)]"><span className="material-symbols-outlined text-[15px]">edit</span>수정</button>
                  <button onClick={() => { done(s); }} className="flex items-center justify-center gap-1.5 py-2.5 rounded-lg border border-gray-200 dark:border-slate-600 text-gray-700 dark:text-gray-300 text-[12px] font-bold hover:bg-gray-50 dark:hover:bg-slate-800"><span className="material-symbols-outlined text-[15px] text-emerald-600">{s.status === "done" ? "undo" : "task_alt"}</span>{s.status === "done" ? "미완료로" : "완료 처리"}</button>
                </div>
                <button onClick={() => { remove(s.id); setPanelItem(null); }} className="w-full py-2 rounded-lg text-[11px] font-semibold text-gray-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-950/30 transition-colors">삭제</button>
              </div>
            )}
            {p && it.propertyKind && (
              <div className="px-1 space-y-3">
                <div>
                  <div className="flex flex-wrap gap-1.5 mb-1.5">
                    <span className="px-2 py-0.5 rounded-md text-[11px] font-bold text-white" style={{ backgroundColor: accent }}>
                      {KIND_LABEL[it.propertyKind]}
                    </span>
                    <span className="px-2 py-0.5 rounded-md text-[11px] font-bold bg-gray-100 dark:bg-slate-800 text-gray-600 dark:text-gray-300">{p.dealType} · {it.date}{it.time ? ` ${it.time}` : ""}</span>
                  </div>
                  <p className="font-bold text-[15px] text-gray-900 dark:text-gray-100 break-all">{p.address}</p>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {phoneChip("집주인", p.ownerName, p.ownerPhone, "owner")}
                  {phoneChip("임차인", p.tenantName, p.tenantPhone, "tenant")}
                </div>
                {it.contract ? (
                  <button onClick={() => router.push(`/expiry?q=${encodeURIComponent(p.address)}`)} className="w-full flex items-center justify-center gap-1.5 py-2.5 rounded-lg bg-[var(--brand-blue)] text-white text-[12px] font-bold hover:bg-[var(--brand-blue-dark)]"><span className="material-symbols-outlined text-[15px]">event_repeat</span>만기 계약 보기</button>
                ) : (
                  <button onClick={() => router.push(`/properties?q=${encodeURIComponent(p.address)}`)} className="w-full flex items-center justify-center gap-1.5 py-2.5 rounded-lg bg-[var(--brand-blue)] text-white text-[12px] font-bold hover:bg-[var(--brand-blue-dark)]"><span className="material-symbols-outlined text-[15px]">domain</span>매물 상세 보기</button>
                )}
              </div>
            )}
            {c && (
              <div className="px-1 space-y-3">
                <p className="font-bold text-[15px] text-gray-900 dark:text-gray-100">{c.name || "고객님"}</p>
                <div className="text-[12px] text-gray-600 dark:text-gray-300">다음 연락 예정 · {c.nextFollowUp}</div>
                {phoneChip("고객", c.name, c.phone, "visitor")}
                <button onClick={() => router.push(`/customers?focus=${c.id}`)} className="w-full flex items-center justify-center gap-1.5 py-2.5 rounded-lg bg-[var(--brand-blue)] text-white text-[12px] font-bold hover:bg-[var(--brand-blue-dark)]"><span className="material-symbols-outlined text-[15px]">group</span>고객 상세 보기</button>
              </div>
            )}
          </SideDrawer>
        );
      })()}

      {editing && (
        <ScheduleModal
          schedule={editing}
          properties={properties}
          customers={customers}
          onClose={() => setEditing(null)}
          onSave={async list => { for (const s of list) await upsert(s); setEditing(null); }}
        />
      )}
    </div>
  );
}

/** 같은 날 같은 방문자(이름+전화번호)의 일정을 한 묶음으로 — 그날 어디를 봤는지 한눈에 */
function groupByVisitor(items: UnifiedItem[]) {
  const groups: { key: string; name: string; phone: string; items: UnifiedItem[] }[] = [];
  const byKey = new Map<string, (typeof groups)[number]>();
  for (const item of items) {
    const s = item.schedule;
    const name = s?.visitorName?.trim() || "";
    const phone = (s?.visitorPhone || "").replace(/\D/g, "");
    if (!s || (!name && !phone)) { groups.push({ key: item.key, name: "", phone: "", items: [item] }); continue; }
    const k = `${name}|${phone}`;
    const g = byKey.get(k);
    if (g) g.items.push(item);
    else { const ng = { key: `v:${k}`, name, phone: s.visitorPhone || "", items: [item] }; byKey.set(k, ng); groups.push(ng); }
  }
  return groups;
}

/* ── 목록 한 줄 (시안 A): 시간/D-day · 종류색 막대 · 단지명 · › ── */
/** 목록·캘린더 내보내기 공용 — 종류 라벨 + 제목 */
function itemText(item: UnifiedItem): { label: string; title: string } {
  if (item.schedule) {
    const s = item.schedule;
    return { label: SCHEDULE_SHORT[s.scheduleType] || s.scheduleType, title: s.propertyAddress || "주소 미입력" };
  }
  if (item.property && item.propertyKind) {
    return { label: KIND_LABEL[item.propertyKind].replace(/일$/, ""), title: item.property.address };
  }
  if (item.customer) {
    return { label: "후속", title: item.customer.name + (item.customer.preferredArea ? ` · ${item.customer.preferredArea}` : "") };
  }
  return { label: "", title: "" };
}

function CompactRow({ item }: { item: UnifiedItem }) {
  const { label, title } = itemText(item);
  let lead = "", done = false;
  if (item.schedule) {
    lead = item.schedule.time || "";
    done = item.schedule.status === "done";
  } else if (item.property && item.propertyKind) {
    lead = item.time || "";   // 계약일에 시간을 넣었으면 목록에도 그 시간이 보인다
  }
  if (!lead) {
    const dd = dDay(item.date);
    lead = dd === Infinity ? "" : dd < 0 ? `${-dd}일전` : dd === 0 ? "오늘" : `D-${dd}`;
  }
  const bar = SOURCE_BAR[item.source];
  return (
    <div className={`flex items-center gap-2.5 px-3 py-2 rounded-xl border bg-white dark:bg-slate-900 border-gray-200 dark:border-slate-700 cursor-pointer hover:bg-gray-50 dark:hover:bg-slate-800/50 transition-colors ${done ? "opacity-50" : ""}`}>
      <span className="w-11 shrink-0 text-center text-[12px] font-bold tabular-nums text-gray-700 dark:text-gray-200">{lead || "—"}</span>
      <span className="w-[3px] h-4 rounded-sm shrink-0" style={{ background: bar }} />
      <span className="w-10 shrink-0 text-[11px] font-semibold" style={{ color: bar }}>{label}</span>
      <span className="flex-1 min-w-0 line-clamp-2 break-words text-[13px] leading-snug text-gray-800 dark:text-gray-100">{title}</span>
      {done && <span className="shrink-0 text-[10px] text-green-600 font-medium">완료</span>}
      <span className="material-symbols-outlined text-gray-300 dark:text-slate-600 text-[18px] shrink-0">chevron_right</span>
    </div>
  );
}

/* 매물 주소 + 동·호 (이미 주소에 들어 있으면 중복 안 붙임) */
function propertyFullLabel(p: Property) {
  const parts: string[] = [];
  if (p.dong && !p.address.includes(p.dong)) parts.push(/동$/.test(p.dong) ? p.dong : `${p.dong}동`);
  if (p.ho && !p.address.includes(p.ho)) parts.push(/호$/.test(p.ho) ? p.ho : `${p.ho}호`);
  return parts.length ? `${p.address} ${parts.join(" ")}` : p.address;
}

/* ── 약속 등록/수정 모달 ── */
function ScheduleModal({ schedule, properties, customers, onClose, onSave }: {
  schedule: Schedule; properties: Property[]; customers: Customer[];
  onClose: () => void; onSave: (list: Schedule[]) => Promise<void>;
}) {
  const [form, setForm] = useState<Schedule>(schedule);
  const [saving, setSaving] = useState(false);
  // 같은 방문에 매물 여러 개 (건의 #64) — 저장 구조는 그대로, 매물마다 일정을 하나씩 만든다. 새 일정에서만.
  const isNew = !schedule.propertyAddress;
  const [extraProps, setExtraProps] = useState<Property[]>([]);
  const [addingExtra, setAddingExtra] = useState(false);
  const [propQuery, setPropQuery] = useState("");
  const [showPropList, setShowPropList] = useState(false);
  const [propTypeFilter, setPropTypeFilter] = useState("");
  const [propDealFilter, setPropDealFilter] = useState("");

  const set = <K extends keyof Schedule>(k: K, v: Schedule[K]) => setForm(p => ({ ...p, [k]: v }));

  const filteredProps = useMemo(() => {
    const base = properties.filter(p => p.status === "active" && (!propTypeFilter || p.propertyType === propTypeFilter) && (!propDealFilter || p.dealType === propDealFilter));
    if (!propQuery.trim()) return base.slice(0, propTypeFilter || propDealFilter ? 30 : 8);
    const q = propQuery.toLowerCase();
    return base.filter(p => propertyFullLabel(p).toLowerCase().includes(q)).slice(0, 30);
  }, [propQuery, propTypeFilter, propDealFilter, properties]);

  const propTypeOptions = useMemo(() => {
    const seen = new Set<string>(PROPERTY_TYPES);
    properties.forEach(p => { if (p.status === "active" && p.propertyType) seen.add(p.propertyType); });
    return Array.from(seen);
  }, [properties]);

  const selectProperty = (p: Property) => {
    if (addingExtra) {
      if (p.id !== form.propertyId && !extraProps.some(x => x.id === p.id)) setExtraProps(xs => [...xs, p]);
      setAddingExtra(false); setPropQuery(""); setShowPropList(false);
      return;
    }
    set("propertyAddress", propertyFullLabel(p)); set("propertyId", p.id);
    setPropQuery(propertyFullLabel(p)); setShowPropList(false);
  };
  const save = async () => {
    if (!form.propertyAddress.trim()) { alert("매물 주소를 입력해주세요"); return; }
    if (!form.date) { alert("날짜를 선택해주세요"); return; }
    setSaving(true);
    const extras = extraProps.map(p => ({ ...form, id: emptySchedule().id, propertyAddress: propertyFullLabel(p), propertyId: p.id, createdAt: Date.now() }));
    try { await onSave([{ ...form }, ...extras]); }
    catch { alert("저장 중 오류가 발생했습니다."); }
    finally { setSaving(false); }
  };

  return (
    <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-[60] flex items-end sm:items-center justify-center p-0 sm:p-4" onClick={onClose}>
      <div className="bg-white rounded-t-2xl sm:rounded-xl w-full sm:max-w-md max-h-[92vh] overflow-y-auto shadow-2xl" onClick={e => e.stopPropagation()}>
        <div className="sticky top-0 bg-white border-b border-gray-100 px-5 py-3 flex items-center justify-between rounded-t-2xl">
          <h2 className="text-base font-semibold">{!schedule.propertyAddress ? "약속 추가" : "약속 수정"}</h2>
          <button onClick={onClose} className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-gray-100 text-gray-500 text-lg">✕</button>
        </div>
        <div className="p-5 space-y-4">

          {/* 종류 */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">일정 종류</label>
            <div className="grid grid-cols-3 gap-1.5">
              {SCHEDULE_TYPES.filter(t => t !== "집보기" || schedule.scheduleType === "집보기").map(t => (
                <button key={t} type="button" onClick={() => set("scheduleType", t)}
                  className={`py-2 rounded-xl text-[11px] font-medium border transition-colors ${form.scheduleType === t ? "bg-blue-600 text-white border-blue-600" : "bg-gray-50 text-gray-600 border-gray-200 hover:border-blue-400"}`}>{t}</button>
              ))}
            </div>
          </div>

          {/* 날짜·시간 */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">날짜 <span className="text-red-400">*</span></label>
              <input type="date" value={form.date} onChange={e => set("date", e.target.value)}
                className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm bg-gray-50 focus:outline-none focus:ring-2 focus:ring-blue-500" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">시간</label>
              <input type="text" inputMode="numeric" maxLength={5} placeholder="예: 14:30" value={form.time}
                onChange={e => {
                  const d = e.target.value.replace(/\D/g, "").slice(0, 4);
                  set("time", d.length > 2 ? `${d.slice(0, 2)}:${d.slice(2)}` : d);
                }}
                onBlur={() => {
                  const m = /^(\d{1,2}):?(\d{2})$/.exec(form.time);
                  if (m && +m[1] < 24 && +m[2] < 60) set("time", `${m[1].padStart(2, "0")}:${m[2]}`);
                  else if (form.time) set("time", "");
                }}
                className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm bg-gray-50 focus:outline-none focus:ring-2 focus:ring-blue-500" />
            </div>
          </div>

          {/* 방문자 */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              방문자
              {form.customerId && <span className="ml-2 text-[11px] text-blue-600 font-normal">👥 고객연결</span>}
            </label>
            <div className="grid grid-cols-2 gap-2">
              <input value={form.visitorName} onChange={e => { set("visitorName", e.target.value); set("customerId", undefined); }}
                placeholder="이름" className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm bg-gray-50 focus:outline-none focus:ring-2 focus:ring-blue-500" />
              <input type="tel" value={form.visitorPhone} onChange={e => { set("visitorPhone", e.target.value); set("customerId", undefined); }}
                placeholder="010-0000-0000" className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm bg-gray-50 focus:outline-none focus:ring-2 focus:ring-blue-500" />
            </div>
          </div>

          {/* 매물 연결 */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              매물 연결 <span className="text-red-400">*</span>
              {form.propertyId && <span className="ml-2 text-[11px] text-emerald-600 font-normal">🏘️ 연결됨</span>}
            </label>
            {properties.length > 0 && (
              <div className="flex gap-1.5 overflow-x-auto pb-2 -mx-0.5 px-0.5">
                {["", ...propTypeOptions].map(t => (
                  <button key={t || "all"} type="button"
                    onClick={() => { setPropTypeFilter(t); setShowPropList(true); }}
                    className={`shrink-0 whitespace-nowrap px-3 py-1 rounded-full text-xs border transition-colors ${propTypeFilter === t ? "bg-emerald-600 text-white border-emerald-600" : "bg-white text-gray-600 border-gray-200 hover:border-emerald-400"}`}>
                    {t || "전체"}
                  </button>
                ))}
              </div>
            )}
            {properties.length > 0 && (
              <div className="flex gap-1.5 overflow-x-auto pb-2 -mx-0.5 px-0.5">
                {["", "매매", "전세", "월세"].map(t => (
                  <button key={t || "all"} type="button"
                    onClick={() => { setPropDealFilter(t); setShowPropList(true); }}
                    className={`shrink-0 whitespace-nowrap px-3 py-1 rounded-full text-xs border transition-colors ${propDealFilter === t ? "bg-emerald-600 text-white border-emerald-600" : "bg-white text-gray-600 border-gray-200 hover:border-emerald-400"}`}>
                    {t || "전체"}
                  </button>
                ))}
              </div>
            )}
            {properties.length > 0 && (
              <div className="relative mb-2">
                <input value={propQuery} onChange={e => { setPropQuery(e.target.value); setShowPropList(true); }}
                  onFocus={() => setShowPropList(true)}
                  placeholder="🔍 내 매물에서 검색"
                  className="w-full border border-emerald-200 rounded-xl px-3 py-2.5 text-sm bg-emerald-50 focus:outline-none focus:ring-2 focus:ring-emerald-400" autoComplete="off" />
                {showPropList && filteredProps.length > 0 && (
                  <div className="absolute z-20 w-full mt-1 bg-white border border-gray-200 rounded-xl shadow-lg overflow-hidden max-h-48 overflow-y-auto">
                    {filteredProps.map(p => (
                      <button key={p.id} type="button" onMouseDown={e => { e.preventDefault(); selectProperty(p); }}
                        className="w-full text-left px-3 py-2.5 hover:bg-emerald-50 border-b last:border-0 border-gray-100 transition-colors">
                        <div className="flex items-center gap-2">
                          <span className="text-[10px] px-1.5 py-0.5 rounded bg-emerald-100 text-emerald-700 shrink-0 whitespace-nowrap">{p.propertyType} · {p.dealType}</span>
                          <span className="text-sm font-medium text-gray-800 break-all">{propertyFullLabel(p)}</span>
                        </div>
                        <div className="text-xs text-gray-500 mt-0.5">{p.price ? `${p.price}만` : ""}{p.ownerName ? ` · ${p.ownerName}` : ""}</div>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}
            <input value={form.propertyAddress} onChange={e => { set("propertyAddress", e.target.value); set("propertyId", undefined); }}
              placeholder="직접 입력: 힐스테이트 미사역 101동 1902호"
              className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm bg-gray-50 focus:outline-none focus:ring-2 focus:ring-blue-500" />
            {isNew && extraProps.length > 0 && (
              <div className="mt-2 space-y-1">
                {extraProps.map(p => (
                  <div key={p.id} className="flex items-center gap-2 px-3 py-2 rounded-xl border border-emerald-200 bg-emerald-50 text-sm">
                    <span className="text-[10px] px-1.5 py-0.5 rounded bg-emerald-100 text-emerald-700 shrink-0 whitespace-nowrap">{p.propertyType} · {p.dealType}</span>
                    <span className="flex-1 min-w-0 break-all text-gray-800">{propertyFullLabel(p)}</span>
                    <button type="button" onClick={() => setExtraProps(xs => xs.filter(x => x.id !== p.id))}
                      className="shrink-0 w-6 h-6 flex items-center justify-center rounded-full text-gray-400 hover:bg-white hover:text-red-500">✕</button>
                  </div>
                ))}
              </div>
            )}
            {isNew && properties.length > 0 && (
              addingExtra ? (
                <p className="mt-2 text-xs text-emerald-700">위 검색칸에서 추가할 매물을 골라주세요 <button type="button" onClick={() => setAddingExtra(false)} className="ml-1 underline text-gray-500">취소</button></p>
              ) : (
                <button type="button" onClick={() => { if (!form.propertyAddress.trim()) { alert("먼저 위에서 첫 번째 매물을 골라주세요"); return; } setAddingExtra(true); setPropQuery(""); setShowPropList(true); }}
                  className="mt-2 w-full py-2 rounded-xl border border-dashed border-emerald-300 text-emerald-700 text-sm whitespace-nowrap hover:bg-emerald-50">
                  ＋ 매물 추가 (몇 개든 가능)
                </button>
              )
            )}
            {extraProps.length > 0 && (
              <p className="mt-1 text-[11px] text-gray-500">매물 {extraProps.length + 1}개 — 같은 날짜·시간·방문자로 일정이 매물마다 하나씩 저장돼요</p>
            )}
          </div>

          {/* 메모 */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">메모</label>
            <textarea value={form.memo} onChange={e => set("memo", e.target.value)}
              placeholder="특이사항 등" rows={2}
              className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm bg-gray-50 focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none" />
          </div>

          <div className="flex gap-2 pt-2">
            <button onClick={onClose} className="flex-1 py-2.5 rounded-xl border border-gray-200 text-gray-600 text-sm hover:bg-gray-50">취소</button>
            <button onClick={save} disabled={saving} className="flex-1 py-2.5 rounded-xl bg-blue-600 text-white text-sm font-semibold hover:bg-blue-700 disabled:opacity-60">
              {saving ? "저장 중…" : "저장"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
