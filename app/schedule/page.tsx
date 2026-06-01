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
import { subscribeContracts } from "@/lib/contracts-db";
import { dDay } from "@/app/expiry/contracts";
import type { Customer } from "@/app/customers/customer-types";
import type { Contract } from "@/app/expiry/contracts";
import MonthCalendar, { type CalendarItem } from "./MonthCalendar";

/* ── 타입 ── */
type SourceFilter = "all" | "schedule" | "expiry" | "followup";

interface UnifiedItem {
  key: string;
  source: "schedule" | "expiry" | "followup";
  date: string;       // YYYY-MM-DD (정렬 기준)
  time: string;
  schedule?: Schedule;
  contract?: Contract;
  customer?: Customer;
  property?: Property; // 내 매물 임대만기
}

const SCHEDULE_TYPES: ScheduleType[] = ["집보기", "계약", "잔금", "기타"];
const TYPE_COLORS: Record<ScheduleType, string> = {
  "집보기": "bg-blue-100 text-blue-700",
  "계약":   "bg-purple-100 text-purple-700",
  "잔금":   "bg-orange-100 text-orange-700",
  "기타":   "bg-gray-100 text-gray-600",
};

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
  const [contracts,  setContracts]  = useState<Contract[]>([]);
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
    const u2 = subscribeContracts(user.agencyId,  setContracts);
    const u3 = subscribeCustomers(user.agencyId,  setCustomers);
    const u4 = subscribeProperties(user.agencyId, setProperties);
    return () => { u1(); u2(); u3(); u4(); };
  }, [user]);

  /* 통합 아이템 생성 */
  const unified = useMemo<UnifiedItem[]>(() => {
    const items: UnifiedItem[] = [];

    // ① 약속 (수동 등록)
    for (const s of schedules) {
      if (s.status === "cancelled") continue;
      if (!showPast && s.status === "done") continue;
      if (!showPast && !isFuture(s.date)) continue;
      items.push({ key: `s-${s.id}`, source: "schedule", date: s.date, time: s.time, schedule: s });
    }

    // ② 만기관리 계약 (D-120 이내 활성 계약)
    for (const c of contracts) {
      if (c.status !== "active") continue;
      if (!c.endDate) continue;
      const dd = dDay(c.endDate);
      if (dd > 120) continue;
      if (!showPast && dd < -30) continue;
      items.push({ key: `e-${c.id}`, source: "expiry", date: c.endDate, time: "", contract: c });
    }

    // ② 내 매물 임대만기 (leaseEndDate 입력된 매물)
    for (const p of properties) {
      if (!p.leaseEndDate || p.status !== "active") continue;
      const dd = dDay(p.leaseEndDate);
      if (dd > 120) continue;
      if (!showPast && dd < -30) continue;
      // 만기관리에 같은 주소 계약이 있으면 중복 제외
      const duplicate = contracts.some(c => c.status === "active" && c.address === p.address && c.endDate === p.leaseEndDate);
      if (duplicate) continue;
      items.push({ key: `pe-${p.id}`, source: "expiry", date: p.leaseEndDate, time: "", property: p });
    }

    // ③ 손님 후속연락
    for (const cu of customers) {
      if (!cu.nextFollowUp) continue;
      if (cu.status === "closed" || cu.status === "lost") continue;
      if (!showPast && !isFuture(cu.nextFollowUp)) continue;
      items.push({ key: `f-${cu.id}`, source: "followup", date: cu.nextFollowUp, time: "", customer: cu });
    }

    return items
      .filter(i => filter === "all" || i.source === filter)
      .filter(i => !selectedDate || i.date === selectedDate)
      .sort((a, b) => {
        const d = a.date.localeCompare(b.date);
        if (d !== 0) return d;
        return a.time.localeCompare(b.time);
      });
  }, [schedules, contracts, customers, properties, filter, showPast, selectedDate]);

  /* 캘린더용 — 필터 + 날짜 선택 무시한 전체 일정 (지난 일정 포함 표시) */
  const calendarItems = useMemo<CalendarItem[]>(() => {
    const items: CalendarItem[] = [];
    for (const s of schedules) {
      if (s.status === "cancelled") continue;
      items.push({ date: s.date, source: "schedule" });
    }
    for (const c of contracts) {
      if (c.status !== "active" || !c.endDate) continue;
      items.push({ date: c.endDate, source: "expiry" });
    }
    for (const p of properties) {
      if (!p.leaseEndDate || p.status !== "active") continue;
      const dup = contracts.some(c => c.status === "active" && c.address === p.address && c.endDate === p.leaseEndDate);
      if (dup) continue;
      items.push({ date: p.leaseEndDate, source: "expiry" });
    }
    for (const cu of customers) {
      if (!cu.nextFollowUp) continue;
      if (cu.status === "closed" || cu.status === "lost") continue;
      items.push({ date: cu.nextFollowUp, source: "followup" });
    }
    return items;
  }, [schedules, contracts, customers, properties]);

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
    all:      unified.length,
    schedule: unified.filter(i => i.source === "schedule").length,
    expiry:   unified.filter(i => i.source === "expiry").length,
    followup: unified.filter(i => i.source === "followup").length,
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
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-blue-50">
      <div className="max-w-2xl mx-auto px-3 sm:px-4 py-5 sm:py-8">

        {/* 사용자 바 */}
        <div className="flex items-center justify-end gap-2 mb-3 text-[11px] text-gray-500">
          <span>👤 {user.displayName || user.email}</span>
          <span className="text-gray-300">·</span>
          <button onClick={() => { if (confirm("로그아웃?")) signOut(); }} className="hover:text-blue-600 hover:underline">로그아웃</button>
        </div>

        {/* 헤더 */}
        <div className="text-center mb-5">
          <div className="inline-flex items-center gap-2 bg-blue-600 text-white px-4 py-1.5 rounded-full text-sm font-medium mb-3">
            📅 스케줄 관리
          </div>
          <h1 className="text-xl sm:text-2xl font-bold text-gray-900 mb-1">통합 일정</h1>
          <p className="text-gray-500 text-xs sm:text-sm mb-4">만기·손님·약속 한눈에</p>
          <button
            onClick={() => setEditing(emptySchedule())}
            className="px-5 py-2.5 rounded-full border-2 border-blue-500 bg-blue-50 text-blue-700 text-sm font-semibold hover:bg-blue-100 transition-colors"
          >
            + 약속 추가
          </button>
        </div>

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

        {/* 필터 탭 */}
        <div className="grid grid-cols-4 gap-1.5 mb-4">
          {([
            { key: "all",      icon: "📋", label: "전체" },
            { key: "schedule", icon: "📅", label: "약속" },
            { key: "expiry",   icon: "⏰", label: "만기" },
            { key: "followup", icon: "👥", label: "손님" },
          ] as const).map(tab => (
            <button
              key={tab.key}
              onClick={() => setFilter(tab.key)}
              className={`rounded-2xl border py-2.5 text-center transition-colors ${filter === tab.key ? "bg-blue-600 text-white border-blue-600 font-semibold" : "bg-white border-gray-200 text-gray-600 hover:border-blue-300"}`}
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
                    if (item.source === "schedule" && item.schedule)
                      return <ScheduleCard key={item.key} schedule={item.schedule} properties={properties}
                               onEdit={() => setEditing({ ...item.schedule! })}
                               onDone={() => done(item.schedule!)}
                               onDelete={() => remove(item.schedule!.id)} />;
                    if (item.source === "expiry" && item.contract)
                      return <ExpiryCard key={item.key} contract={item.contract} />;
                    if (item.source === "expiry" && item.property)
                      return <PropertyLeaseCard key={item.key} property={item.property} />;
                    if (item.source === "followup" && item.customer)
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

/* ── 만기 카드 ── */
function ExpiryCard({ contract: c }: { contract: Contract }) {
  const dd = dDay(c.endDate);
  const isOver = dd < 0;
  const isUrgent = dd <= 60;
  const bgColor = isOver ? "bg-red-50 border-red-200" : isUrgent ? "bg-orange-50 border-orange-200" : "bg-yellow-50 border-yellow-200";
  const badgeColor = isOver ? "bg-red-100 text-red-700" : isUrgent ? "bg-orange-100 text-orange-700" : "bg-yellow-100 text-yellow-700";
  const ddLabel = isOver ? `${-dd}일 지남` : dd === 0 ? "오늘만기" : `D-${dd}`;

  return (
    <div className={`rounded-2xl border p-3 sm:p-4 ${bgColor}`}>
      <div className="flex items-start gap-3">
        <div className="flex-shrink-0 w-14 text-center rounded-xl py-2 bg-white/70">
          <div className="text-[10px] text-orange-500 font-medium">만기</div>
          <div className={`text-xs font-bold ${isOver ? "text-red-600" : isUrgent ? "text-orange-600" : "text-yellow-700"}`}>{ddLabel}</div>
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex flex-wrap items-center gap-1.5 mb-1">
            <span className={`text-[11px] px-1.5 py-0.5 rounded font-medium ${badgeColor}`}>⏰ 만기</span>
            <span className="text-[11px] px-1.5 py-0.5 rounded bg-gray-100 text-gray-600">{c.type}</span>
          </div>
          <div className="text-sm font-semibold text-gray-800 break-all">{c.address}</div>
          {c.tenantPhone && (
            <div className="mt-1.5 flex items-center gap-2 text-xs">
              <span className="text-gray-500 shrink-0">임차인 {c.tenantName}</span>
              <a href={`tel:${c.tenantPhone.replace(/\D/g,"")}`} className="text-blue-600 hover:underline">📞 {formatPhone(c.tenantPhone)}</a>
              <a href={`sms:${c.tenantPhone.replace(/\D/g,"")}?body=${encodeURIComponent(`안녕하세요${c.tenantName ? ` ${c.tenantName}님` : ""}, 미사금빛공인중개사입니다.\n${c.address} 계약 만기(${c.endDate}) 관련하여 연락드립니다.`)}`}
                className="text-[10px] px-2 py-0.5 rounded-full border border-blue-200 text-blue-700 hover:bg-blue-50 ml-auto">문자</a>
            </div>
          )}
          <div className="mt-1 text-[11px] text-gray-500">만기일 {c.endDate} · 보증금 {c.deposit || "—"}만{c.monthly ? ` / 월세 ${c.monthly}만` : ""}</div>
        </div>
      </div>
    </div>
  );
}

/* ── 내 매물 임대만기 카드 ── */
function PropertyLeaseCard({ property: p }: { property: Property }) {
  const dd = p.leaseEndDate ? dDay(p.leaseEndDate) : 0;
  const isOver = dd < 0;
  const isUrgent = dd <= 60;
  const bgColor = isOver ? "bg-red-50 border-red-200" : isUrgent ? "bg-orange-50 border-orange-200" : "bg-yellow-50 border-yellow-200";
  const badgeColor = isOver ? "bg-red-100 text-red-700" : isUrgent ? "bg-orange-100 text-orange-700" : "bg-yellow-100 text-yellow-700";
  const ddLabel = isOver ? `${-dd}일 지남` : dd === 0 ? "오늘만기" : `D-${dd}`;

  return (
    <div className={`rounded-2xl border p-3 sm:p-4 ${bgColor}`}>
      <div className="flex items-start gap-3">
        <div className="flex-shrink-0 w-14 text-center rounded-xl py-2 bg-white/70">
          <div className="text-[10px] text-orange-500 font-medium">임대만기</div>
          <div className={`text-xs font-bold ${isOver ? "text-red-600" : isUrgent ? "text-orange-600" : "text-yellow-700"}`}>{ddLabel}</div>
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex flex-wrap items-center gap-1.5 mb-1">
            <span className={`text-[11px] px-1.5 py-0.5 rounded font-medium ${badgeColor}`}>🏘️ 내 매물 만기</span>
            <span className="text-[11px] px-1.5 py-0.5 rounded bg-gray-100 text-gray-600">{p.dealType}</span>
          </div>
          <div className="text-sm font-semibold text-gray-800 break-all">{p.address}</div>
          {p.tenantPhone && (
            <div className="mt-1.5 flex items-center gap-2 text-xs">
              <span className="text-gray-500 shrink-0">임차인 {p.tenantName || ""}</span>
              <a href={`tel:${p.tenantPhone.replace(/\D/g,"")}`} className="text-blue-600 hover:underline">📞 {formatPhone(p.tenantPhone)}</a>
              <a href={`sms:${p.tenantPhone.replace(/\D/g,"")}?body=${encodeURIComponent(`안녕하세요${p.tenantName ? ` ${p.tenantName}님` : ""}, 미사금빛공인중개사입니다.\n${p.address} 임대차 만기(${p.leaseEndDate}) 관련하여 연락드립니다.`)}`}
                className="text-[10px] px-2 py-0.5 rounded-full border border-blue-200 text-blue-700 hover:bg-blue-50 ml-auto">문자</a>
            </div>
          )}
          <div className="mt-1 text-[11px] text-gray-500">만기일 {p.leaseEndDate}{p.ownerName ? ` · 집주인 ${p.ownerName}` : ""}</div>
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
    <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50 flex items-end sm:items-center justify-center p-0 sm:p-4" onClick={onClose}>
      <div className="bg-white rounded-t-3xl sm:rounded-3xl w-full sm:max-w-md max-h-[92vh] overflow-y-auto shadow-2xl" onClick={e => e.stopPropagation()}>
        <div className="sticky top-0 bg-white border-b border-gray-100 px-5 py-3 flex items-center justify-between rounded-t-3xl">
          <h2 className="text-base font-semibold">{!schedule.propertyAddress ? "약속 추가" : "약속 수정"}</h2>
          <button onClick={onClose} className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-gray-100 text-gray-500 text-lg">✕</button>
        </div>
        <div className="p-5 space-y-4">

          {/* 종류 */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">일정 종류</label>
            <div className="grid grid-cols-4 gap-1.5">
              {SCHEDULE_TYPES.map(t => (
                <button key={t} type="button" onClick={() => set("scheduleType", t)}
                  className={`py-2 rounded-xl text-xs font-medium border transition-colors ${form.scheduleType === t ? "bg-blue-600 text-white border-blue-600" : "bg-gray-50 text-gray-600 border-gray-200 hover:border-blue-400"}`}>{t}</button>
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
