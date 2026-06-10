"use client";

import { useState, useEffect, useMemo } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth-context";
import {
  subscribeSchedules, saveSchedule, deleteSchedule, emptySchedule,
  type Schedule, type ScheduleType,
} from "@/lib/schedules-db";
import { subscribeProperties, type Property } from "@/lib/properties-db";
import { subscribeCustomers } from "@/lib/customers-db";
import { dDay } from "@/app/expiry/contracts";
import type { Customer } from "@/app/customers/customer-types";
import MonthCalendar, { type CalendarItem } from "./MonthCalendar";

/* ── 타입 ── */
type SourceFilter = "all" | "appointment" | "contractDate" | "downPaymentDate" | "balanceDate";
type ItemSource   = Exclude<SourceFilter, "all">;
type PropertyDateKind = "contractDate" | "downPaymentDate" | "balanceDate";

interface UnifiedItem {
  key: string;
  source: ItemSource;
  date: string;       // YYYY-MM-DD (정렬 기준)
  time: string;
  schedule?: Schedule;
  customer?: Customer;
  property?: Property;
  propertyKind?: PropertyDateKind;  // Property에서 어느 날짜인지
}

const SCHEDULE_TYPES: ScheduleType[] = ["집보기", "계약일", "중도금일", "잔금일", "기타"];
const TYPE_COLORS: Record<ScheduleType, string> = {
  "집보기":   "bg-blue-100 text-blue-700",
  "계약일":   "bg-purple-100 text-purple-700",
  "중도금일": "bg-pink-100 text-pink-700",
  "잔금일":   "bg-amber-100 text-amber-700",
  "기타":     "bg-gray-100 text-gray-600",
};

/** schedule.scheduleType → 필터 분류 (계약/중도금/잔금은 별도, 집보기/기타는 약속) */
function scheduleTypeToSource(t: ScheduleType): ItemSource {
  if (t === "계약일")   return "contractDate";
  if (t === "중도금일") return "downPaymentDate";
  if (t === "잔금일")   return "balanceDate";
  return "appointment"; // 집보기·기타
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
  return new Date(date + "T00:00:00").toLocaleDateString("ko-KR", { month: "long", day: "numeric", weekday: "short" });
}

/* ── 메인 ── */
export default function SchedulePage() {
  const router = useRouter();
  const { user, loading: authLoading, signOut } = useAuth();

  const [schedules,  setSchedules]  = useState<Schedule[]>([]);
  const [customers,  setCustomers]  = useState<Customer[]>([]);
  const [properties, setProperties] = useState<Property[]>([]);
  const [loaded,     setLoaded]     = useState(false);
  const [editing,    setEditing]    = useState<Schedule | null>(null);
  const [filter,     setFilter]     = useState<SourceFilter>("all");
  const [showPast,   setShowPast]   = useState(false);
  const [selectedDate, setSelectedDate] = useState<string | null>(null);

  useEffect(() => {
    if (!authLoading && !user) router.replace("/login?redirect=/schedule");
  }, [authLoading, user, router]);

  useEffect(() => {
    if (!user) return;
    const u1 = subscribeSchedules(user.agencyId,  list => { setSchedules(list);  setLoaded(true); });
    const u2 = subscribeCustomers(user.agencyId,  setCustomers);
    const u3 = subscribeProperties(user.agencyId, setProperties);
    return () => { u1(); u2(); u3(); };
  }, [user]);

  /* 통합 아이템 생성 — 만기일 제거, Property의 4개 날짜 추가 */
  const unified = useMemo<UnifiedItem[]>(() => {
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
        items.push({ key: `p-${p.id}-${kind}`, source, date, time: "", property: p, propertyKind: kind });
      }
    }


    // ③ 손님 후속연락 — "약속" 카테고리로 통합
    for (const cu of customers) {
      if (!cu.nextFollowUp) continue;
      if (cu.status === "closed" || cu.status === "lost") continue;
      if (!showPast && !isFuture(cu.nextFollowUp)) continue;
      items.push({ key: `f-${cu.id}`, source: "appointment", date: cu.nextFollowUp, time: "", customer: cu });
    }

    return items
      .filter(i => filter === "all" || i.source === filter)
      .filter(i => !selectedDate || i.date === selectedDate)
      .sort((a, b) => {
        const d = a.date.localeCompare(b.date);
        if (d !== 0) return d;
        return a.time.localeCompare(b.time);
      });
  }, [schedules, customers, properties, filter, showPast, selectedDate]);

  /* 캘린더용 — 필터 + 날짜 선택 무시한 전체 일정 (지난 일정 포함 표시) */
  const calendarItems = useMemo<CalendarItem[]>(() => {
    const items: CalendarItem[] = [];
    for (const s of schedules) {
      if (s.status === "cancelled") continue;
      items.push({ date: s.date, source: scheduleTypeToSource(s.scheduleType) });
    }
    for (const p of properties) {
      if (p.status !== "active") continue;
      if (p.contractDate)    items.push({ date: p.contractDate,    source: "contractDate" });
      if (p.downPaymentDate) items.push({ date: p.downPaymentDate, source: "downPaymentDate" });
      if (p.balanceDate)     items.push({ date: p.balanceDate,     source: "balanceDate" });
    }
    for (const cu of customers) {
      if (!cu.nextFollowUp) continue;
      if (cu.status === "closed" || cu.status === "lost") continue;
      items.push({ date: cu.nextFollowUp, source: "appointment" });
    }
    return items;
  }, [schedules, customers, properties]);

  /* 날짜별 그룹 */
  const grouped = useMemo(() => {
    const map: Record<string, UnifiedItem[]> = {};
    for (const i of unified) {
      if (!map[i.date]) map[i.date] = [];
      map[i.date].push(i);
    }
    return Object.entries(map);
  }, [unified]);

  const todayCount = unified.filter(i => isToday(i.date)).length;

  /* 필터별 카운트 */
  const counts = useMemo(() => ({
    all:             unified.length,
    appointment:     unified.filter(i => i.source === "appointment").length,
    contractDate:    unified.filter(i => i.source === "contractDate").length,
    downPaymentDate: unified.filter(i => i.source === "downPaymentDate").length,
    balanceDate:     unified.filter(i => i.source === "balanceDate").length,
  }), [unified]);

  const upsert = async (s: Schedule) => {
    if (!user) return;
    await saveSchedule(user.agencyId, s);
  };
  const remove = async (id: string) => {
    if (!user || !confirm("이 일정을 삭제할까요?")) return;
    await deleteSchedule(user.agencyId, id);
  };
  const done = async (s: Schedule) => {
    if (!user) return;
    await saveSchedule(user.agencyId, { ...s, status: s.status === "done" ? "scheduled" : "done" });
  };

  if (authLoading || !user) return (
    <div className="min-h-screen flex items-center justify-center text-gray-400 text-sm">불러오는 중…</div>
  );

  return (
    <div className="p-4 sm:p-6 lg:p-8">
      <div className="max-w-2xl mx-auto">

        {/* Stitch 톤 페이지 헤더 — 좌측 제목 + 우측 빠른 등록 */}
        <section className="flex flex-col md:flex-row md:justify-between md:items-end gap-4 mb-5">
          <div>
            <h2 className="flex items-center gap-2 text-2xl sm:text-3xl font-bold text-gray-900 dark:text-gray-100">
              <span className="material-symbols-outlined text-blue-600 dark:text-blue-400" style={{ fontSize: "2rem" }}>calendar_month</span>
              스케줄
            </h2>
            <p className="text-sm text-gray-500 dark:text-gray-400 mt-1.5">
              약속·계약일·중도금일·잔금일 한눈에 (만기일은 만기관리)
            </p>
          </div>
          <div className="flex flex-wrap gap-1.5">
            <button
              onClick={() => setEditing(emptySchedule())}
              className="text-xs px-3.5 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-bold transition-colors shadow-sm"
            >
              + 약속
            </button>
            <button
              onClick={() => setEditing({ ...emptySchedule(), scheduleType: "계약일" })}
              className="text-xs px-3.5 py-2 rounded-xl border-2 border-purple-400 bg-purple-50 text-purple-700 font-semibold hover:bg-purple-100 transition-colors"
            >
              + 계약일
            </button>
            <button
              onClick={() => setEditing({ ...emptySchedule(), scheduleType: "중도금일" })}
              className="text-xs px-3.5 py-2 rounded-xl border-2 border-pink-400 bg-pink-50 text-pink-700 font-semibold hover:bg-pink-100 transition-colors"
            >
              + 중도금일
            </button>
            <button
              onClick={() => setEditing({ ...emptySchedule(), scheduleType: "잔금일" })}
              className="text-xs px-3.5 py-2 rounded-xl border-2 border-amber-400 bg-amber-50 text-amber-700 font-semibold hover:bg-amber-100 transition-colors"
            >
              + 잔금일
            </button>
          </div>
        </section>

        {/* 월별 캘린더 — 한눈에 보기 */}
        <MonthCalendar
          items={calendarItems}
          onSelectDate={setSelectedDate}
          selectedDate={selectedDate}
        />

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
            <button onClick={() => setSelectedDate(null)} className="text-xs px-2.5 py-1 rounded-full bg-white border border-blue-200 text-blue-700 hover:bg-blue-100">
              전체 보기
            </button>
          </div>
        )}

        {/* 필터 탭 — 5개 */}
        <div className="grid grid-cols-5 gap-1.5 mb-4">
          {([
            { key: "all",             icon: "📋", label: "전체",     activeColor: "bg-blue-600",    inactiveColor: "bg-blue-50 border-blue-200 text-blue-700" },
            { key: "appointment",     icon: "👥", label: "약속",     activeColor: "bg-blue-500",    inactiveColor: "bg-blue-50 border-blue-200 text-blue-700" },
            { key: "contractDate",    icon: "📝", label: "계약일",   activeColor: "bg-purple-600",  inactiveColor: "bg-purple-50 border-purple-200 text-purple-700" },
            { key: "downPaymentDate", icon: "💰", label: "중도금", activeColor: "bg-pink-600",    inactiveColor: "bg-pink-50 border-pink-200 text-pink-700" },
            { key: "balanceDate",     icon: "🔑", label: "잔금",   activeColor: "bg-amber-500",   inactiveColor: "bg-amber-50 border-amber-200 text-amber-700" },
          ] as const).map(tab => (
            <button
              key={tab.key}
              onClick={() => setFilter(tab.key)}
              className={`rounded-2xl border py-2.5 text-center transition-colors font-medium ${
                filter === tab.key
                  ? `${tab.activeColor} text-white border-transparent font-semibold`
                  : `${tab.inactiveColor} hover:opacity-80`
              }`}
            >
              <div className="text-base leading-none">{tab.icon}</div>
              <div className="text-[10px] mt-1">{tab.label}</div>
              <div className="text-[10px] font-bold">{counts[tab.key]}</div>
            </button>
          ))}
        </div>

        {/* 지난 일정 토글 */}
        <div className="flex items-center justify-end mb-3">
          <label className="flex items-center gap-1.5 text-xs text-gray-600 cursor-pointer">
            <input type="checkbox" checked={showPast} onChange={e => setShowPast(e.target.checked)} className="accent-blue-600" />
            지난 일정 포함
          </label>
        </div>

        {/* 목록 */}
        {!loaded ? (
          <div className="text-center text-gray-400 py-12">불러오는 중…</div>
        ) : grouped.length === 0 ? (
          <div className="bg-white rounded-3xl border border-gray-200 p-8 text-center">
            <div className="text-5xl mb-3">📅</div>
            <div className="text-base font-semibold text-gray-900 mb-1">일정이 없습니다</div>
            <div className="text-xs text-gray-500 mb-4">약속을 추가하거나 만기·손님 탭을 확인해보세요</div>
            <button onClick={() => setEditing(emptySchedule())} className="text-sm px-4 py-2 rounded-full border-2 border-blue-500 bg-blue-50 text-blue-700 font-semibold">
              + 약속 추가
            </button>
          </div>
        ) : (
          <div className="space-y-5">
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

                <div className="space-y-2">
                  {items.map(item => {
                    if (item.schedule)
                      return <ScheduleCard key={item.key} schedule={item.schedule} properties={properties}
                               onEdit={() => setEditing({ ...item.schedule! })}
                               onDone={() => done(item.schedule!)}
                               onDelete={() => remove(item.schedule!.id)} />;
                    if (item.property && item.propertyKind)
                      return <PropertyDateCard key={item.key} property={item.property} kind={item.propertyKind} />;
                    if (item.customer)
                      return <FollowUpCard key={item.key} customer={item.customer} />;
                    return null;
                  })}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {editing && (
        <ScheduleModal
          schedule={editing}
          properties={properties}
          customers={customers}
          onClose={() => setEditing(null)}
          onSave={async s => { await upsert(s); setEditing(null); }}
        />
      )}
    </div>
  );
}

/* ── 약속 카드 ── */
function ScheduleCard({ schedule: s, properties, onEdit, onDone, onDelete }: {
  schedule: Schedule; properties: Property[];
  onEdit: () => void; onDone: () => void; onDelete: () => void;
}) {
  const isDone = s.status === "done";
  const linkedProp = s.propertyId ? properties.find(p => p.id === s.propertyId) : null;
  return (
    <div className={`rounded-2xl border p-3 sm:p-4 ${isDone ? "bg-gray-50/60 border-gray-200 opacity-60" : "bg-white border-gray-200 shadow-sm"}`}>
      <div className="flex items-start gap-3">
        <div className={`flex-shrink-0 w-14 text-center rounded-xl py-2 ${isDone ? "bg-gray-100" : "bg-blue-50"}`}>
          <div className="text-[10px] text-blue-400 font-medium">약속</div>
          <div className={`text-sm font-bold ${isDone ? "text-gray-400" : "text-blue-700"}`}>{s.time}</div>
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex flex-wrap items-center gap-1.5 mb-1">
            <span className={`text-[11px] px-1.5 py-0.5 rounded font-medium ${TYPE_COLORS[s.scheduleType]}`}>{s.scheduleType}</span>
            {isDone && <span className="text-[11px] px-1.5 py-0.5 rounded bg-green-100 text-green-700">완료</span>}
            {linkedProp && <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200">🏘️ 매물연결</span>}
          </div>
          <div className="text-sm font-semibold text-gray-800 break-all">{s.propertyAddress || "주소 미입력"}</div>
          {linkedProp && (
            <div className="mt-1 text-[11px] text-emerald-700 bg-emerald-50 rounded px-2 py-1">
              {linkedProp.dealType} {linkedProp.propertyType}{linkedProp.price ? ` · ${linkedProp.price}만` : ""}{linkedProp.ownerName ? ` · 집주인 ${linkedProp.ownerName}` : ""}
            </div>
          )}
          {s.visitorPhone && (
            <div className="mt-1.5 flex items-center gap-2 text-xs">
              <span className="text-gray-500 shrink-0">{s.visitorName || "방문자"}</span>
              <a href={`tel:${s.visitorPhone.replace(/\D/g,"")}`} className="text-blue-600 hover:underline">📞 {formatPhone(s.visitorPhone)}</a>
              <a href={`sms:${s.visitorPhone.replace(/\D/g,"")}?body=${encodeURIComponent(`안녕하세요${s.visitorName ? ` ${s.visitorName}님` : ""}, 미사금빛공인중개사입니다.\n${s.date} ${s.time} ${s.propertyAddress} ${s.scheduleType} 약속 확인드립니다.`)}`}
                className="text-[10px] px-2 py-0.5 rounded-full border border-blue-200 text-blue-700 hover:bg-blue-50 ml-auto">문자</a>
            </div>
          )}
          {s.memo && <div className="mt-1 text-[11px] text-gray-500 bg-gray-50 rounded px-2 py-1">💬 {s.memo}</div>}
        </div>
      </div>
      <div className="flex flex-wrap gap-1.5 mt-3 pt-3 border-t border-gray-100">
        <button onClick={onEdit} className="text-[11px] px-2.5 py-1 rounded-full border border-gray-200 text-gray-600 hover:border-blue-400 hover:text-blue-600 transition-colors">수정</button>
        <button onClick={onDone} className={`text-[11px] px-2.5 py-1 rounded-full border transition-colors ${isDone ? "border-gray-200 text-gray-500 hover:border-blue-400 hover:text-blue-600" : "border-gray-200 text-gray-600 hover:border-green-400 hover:text-green-600"}`}>
          {isDone ? "미완료로" : "완료 처리"}
        </button>
        <button onClick={onDelete} className="text-[11px] px-2.5 py-1 rounded-full border border-gray-200 text-gray-400 hover:border-red-400 hover:text-red-600 transition-colors ml-auto">삭제</button>
      </div>
    </div>
  );
}

/* ── 내 매물 계약 진행 날짜 카드 (계약일·중도금일·잔금일) ── */
function PropertyDateCard({ property: p, kind }: { property: Property; kind: PropertyDateKind }) {
  const date =
    kind === "contractDate"    ? p.contractDate
    : kind === "downPaymentDate" ? p.downPaymentDate
    : p.balanceDate;

  const kindMeta: Record<PropertyDateKind, { label: string; icon: string; mainColor: string; badgeColor: string; bgColor: string }> = {
    contractDate:    { label: "계약일",   icon: "📝", mainColor: "text-purple-600", badgeColor: "bg-purple-100 text-purple-700", bgColor: "bg-purple-50 border-purple-200" },
    downPaymentDate: { label: "중도금일", icon: "💰", mainColor: "text-pink-600",   badgeColor: "bg-pink-100 text-pink-700",     bgColor: "bg-pink-50 border-pink-200" },
    balanceDate:     { label: "잔금일",   icon: "🔑", mainColor: "text-amber-600",  badgeColor: "bg-amber-100 text-amber-700",   bgColor: "bg-amber-50 border-amber-200" },
  };
  const m = kindMeta[kind];

  const dd = dDay(date);
  const ddLabel = dd === Infinity ? "—" : dd < 0 ? `${-dd}일전` : dd === 0 ? "오늘" : `D-${dd}`;

  return (
    <div className={`rounded-2xl border p-3 sm:p-4 ${m.bgColor}`}>
      <div className="flex items-start gap-3">
        <div className="flex-shrink-0 w-14 text-center rounded-xl py-2 bg-white/70">
          <div className={`text-[10px] font-medium ${m.mainColor}`}>{m.label}</div>
          <div className={`text-xs font-bold ${m.mainColor}`}>{ddLabel}</div>
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex flex-wrap items-center gap-1.5 mb-1">
            <span className={`text-[11px] px-1.5 py-0.5 rounded font-medium ${m.badgeColor}`}>{m.icon} {m.label}</span>
            <span className="text-[11px] px-1.5 py-0.5 rounded bg-gray-100 text-gray-600">{p.dealType}</span>
            <span className="text-[10px] px-1.5 py-0.5 rounded bg-emerald-50 text-emerald-700 border border-emerald-200">🏘️ 내 매물</span>
          </div>
          <div className="text-sm font-semibold text-gray-800 break-all">{p.address}</div>
          {p.ownerPhone && (
            <div className="mt-1.5 flex items-center gap-2 text-xs">
              <span className="text-gray-500 shrink-0">집주인 {p.ownerName || ""}</span>
              <a href={`tel:${p.ownerPhone.replace(/\D/g,"")}`} className="text-blue-600 hover:underline">📞 {formatPhone(p.ownerPhone)}</a>
            </div>
          )}
          {p.tenantPhone && (
            <div className="mt-1 flex items-center gap-2 text-xs">
              <span className="text-gray-500 shrink-0">임차인 {p.tenantName || ""}</span>
              <a href={`tel:${p.tenantPhone.replace(/\D/g,"")}`} className="text-blue-600 hover:underline">📞 {formatPhone(p.tenantPhone)}</a>
            </div>
          )}
          <div className="mt-1 text-[11px] text-gray-500">{m.label} {date}</div>
        </div>
      </div>
    </div>
  );
}

/* ── 손님 후속연락 카드 ── */
function FollowUpCard({ customer: c }: { customer: Customer }) {
  const today = new Date().toISOString().slice(0, 10);
  const isOver = c.nextFollowUp < today;
  const isToday2 = c.nextFollowUp === today;
  const bgColor = isOver ? "bg-red-50 border-red-200" : isToday2 ? "bg-orange-50 border-orange-200" : "bg-blue-50 border-blue-200";

  return (
    <div className={`rounded-2xl border p-3 sm:p-4 ${bgColor}`}>
      <div className="flex items-start gap-3">
        <div className="flex-shrink-0 w-14 text-center rounded-xl py-2 bg-white/70">
          <div className="text-[10px] text-blue-500 font-medium">손님</div>
          <div className={`text-xs font-bold ${isOver ? "text-red-600" : isToday2 ? "text-orange-600" : "text-blue-600"}`}>
            {isOver ? "지남" : isToday2 ? "오늘" : "예정"}
          </div>
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex flex-wrap items-center gap-1.5 mb-1">
            <span className="text-[11px] px-1.5 py-0.5 rounded font-medium bg-blue-100 text-blue-700">👥 후속연락</span>
            {c.vip && <span className="text-[11px] px-1.5 py-0.5 rounded bg-yellow-100 text-yellow-700">⭐ VIP</span>}
          </div>
          <div className="text-sm font-semibold text-gray-800">{c.name}</div>
          {c.preferredArea && <div className="text-xs text-gray-500 mt-0.5">희망: {c.preferredArea}</div>}
          {c.phone && (
            <div className="mt-1.5 flex items-center gap-2 text-xs">
              <a href={`tel:${c.phone.replace(/\D/g,"")}`} className="text-blue-600 hover:underline">📞 {formatPhone(c.phone)}</a>
              <a href={`sms:${c.phone.replace(/\D/g,"")}?body=${encodeURIComponent(`안녕하세요 ${c.name}님, 미사금빛공인중개사입니다.\n안녕하신지요? 좋은 매물 있어 연락드립니다.`)}`}
                className="text-[10px] px-2 py-0.5 rounded-full border border-blue-200 text-blue-700 hover:bg-blue-50 ml-auto">문자</a>
            </div>
          )}
          {c.memo && <div className="mt-1 text-[11px] text-gray-500 bg-white/60 rounded px-2 py-1">💬 {c.memo}</div>}
        </div>
      </div>
    </div>
  );
}

/* ── 약속 등록/수정 모달 ── */
function ScheduleModal({ schedule, properties, customers, onClose, onSave }: {
  schedule: Schedule; properties: Property[]; customers: Customer[];
  onClose: () => void; onSave: (s: Schedule) => Promise<void>;
}) {
  const [form, setForm] = useState<Schedule>(schedule);
  const [saving, setSaving] = useState(false);
  const [propQuery, setPropQuery] = useState("");
  const [showPropList, setShowPropList] = useState(false);
  const [custQuery, setCustQuery] = useState("");
  const [showCustList, setShowCustList] = useState(false);

  const set = <K extends keyof Schedule>(k: K, v: Schedule[K]) => setForm(p => ({ ...p, [k]: v }));

  const filteredProps = useMemo(() => {
    const base = properties.filter(p => p.status === "active");
    if (!propQuery.trim()) return base.slice(0, 8);
    const q = propQuery.toLowerCase();
    return base.filter(p => p.address.toLowerCase().includes(q)).slice(0, 8);
  }, [propQuery, properties]);

  const filteredCusts = useMemo(() => {
    if (!custQuery.trim()) return customers.slice(0, 8);
    const q = custQuery.toLowerCase();
    return customers.filter(c => c.name.toLowerCase().includes(q) || c.phone.includes(q)).slice(0, 8);
  }, [custQuery, customers]);

  const selectProperty = (p: Property) => {
    set("propertyAddress", p.address); set("propertyId", p.id);
    setPropQuery(p.address); setShowPropList(false);
  };
  const selectCustomer = (c: Customer) => {
    set("visitorName", c.name); set("visitorPhone", c.phone); set("customerId", c.id);
    setCustQuery(c.name); setShowCustList(false);
  };

  const save = async () => {
    if (!form.propertyAddress.trim()) { alert("매물 주소를 입력해주세요"); return; }
    if (!form.date) { alert("날짜를 선택해주세요"); return; }
    setSaving(true);
    try { await onSave({ ...form }); }
    catch { alert("저장 중 오류가 발생했습니다."); }
    finally { setSaving(false); }
  };

  return (
    <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-[60] flex items-end sm:items-center justify-center p-0 sm:p-4" onClick={onClose}>
      <div className="bg-white rounded-t-3xl sm:rounded-3xl w-full sm:max-w-md max-h-[92vh] overflow-y-auto shadow-2xl" onClick={e => e.stopPropagation()}>
        <div className="sticky top-0 bg-white border-b border-gray-100 px-5 py-3 flex items-center justify-between rounded-t-3xl">
          <h2 className="text-base font-semibold">{!schedule.propertyAddress ? "약속 추가" : "약속 수정"}</h2>
          <button onClick={onClose} className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-gray-100 text-gray-500 text-lg">✕</button>
        </div>
        <div className="p-5 space-y-4">

          {/* 종류 */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">일정 종류</label>
            <div className="grid grid-cols-5 gap-1.5">
              {SCHEDULE_TYPES.map(t => (
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
              <input type="time" value={form.time} onChange={e => set("time", e.target.value)}
                className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm bg-gray-50 focus:outline-none focus:ring-2 focus:ring-blue-500" />
            </div>
          </div>

          {/* 매물 연결 */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              매물 연결 <span className="text-red-400">*</span>
              {form.propertyId && <span className="ml-2 text-[11px] text-emerald-600 font-normal">🏘️ 연결됨</span>}
            </label>
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
                          <span className="text-[10px] px-1.5 py-0.5 rounded bg-emerald-100 text-emerald-700 shrink-0">{p.dealType}</span>
                          <span className="text-sm font-medium text-gray-800 truncate">{p.address}</span>
                        </div>
                        <div className="text-xs text-gray-500 mt-0.5">{p.propertyType}{p.price ? ` · ${p.price}만` : ""}{p.ownerName ? ` · ${p.ownerName}` : ""}</div>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}
            <input value={form.propertyAddress} onChange={e => { set("propertyAddress", e.target.value); set("propertyId", undefined); }}
              placeholder="직접 입력: 힐스테이트 미사역 101동 1902호"
              className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm bg-gray-50 focus:outline-none focus:ring-2 focus:ring-blue-500" />
          </div>

          {/* 방문자 */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              방문자
              {form.customerId && <span className="ml-2 text-[11px] text-blue-600 font-normal">👥 손님연결</span>}
            </label>
            {customers.length > 0 && (
              <div className="relative mb-2">
                <input value={custQuery} onChange={e => { setCustQuery(e.target.value); setShowCustList(true); }}
                  onFocus={() => setShowCustList(true)}
                  placeholder="🔍 기존 손님에서 검색"
                  className="w-full border border-blue-200 rounded-xl px-3 py-2.5 text-sm bg-blue-50 focus:outline-none focus:ring-2 focus:ring-blue-400" autoComplete="off" />
                {showCustList && filteredCusts.length > 0 && (
                  <div className="absolute z-20 w-full mt-1 bg-white border border-gray-200 rounded-xl shadow-lg overflow-hidden max-h-48 overflow-y-auto">
                    {filteredCusts.map(c => (
                      <button key={c.id} type="button" onMouseDown={e => { e.preventDefault(); selectCustomer(c); }}
                        className="w-full text-left px-3 py-2.5 hover:bg-blue-50 border-b last:border-0 border-gray-100 transition-colors">
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-medium text-gray-800">{c.name}</span>
                          <span className="text-xs text-gray-500">{formatPhone(c.phone)}</span>
                          {c.vip && <span className="text-[10px] px-1.5 py-0.5 rounded bg-yellow-100 text-yellow-700">VIP</span>}
                        </div>
                        {c.preferredArea && <div className="text-xs text-gray-400 mt-0.5">희망: {c.preferredArea}</div>}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}
            <div className="grid grid-cols-2 gap-2">
              <input value={form.visitorName} onChange={e => { set("visitorName", e.target.value); set("customerId", undefined); }}
                placeholder="이름" className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm bg-gray-50 focus:outline-none focus:ring-2 focus:ring-blue-500" />
              <input type="tel" value={form.visitorPhone} onChange={e => { set("visitorPhone", e.target.value); set("customerId", undefined); }}
                placeholder="010-0000-0000" className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm bg-gray-50 focus:outline-none focus:ring-2 focus:ring-blue-500" />
            </div>
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
