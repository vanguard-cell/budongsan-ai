"use client";

import { useState, useEffect, useMemo } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth-context";
import {
  subscribeSchedules, saveSchedule, deleteSchedule, emptySchedule,
  type Schedule, type ScheduleType,
} from "@/lib/schedules-db";

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

function isToday(date: string) {
  return date === new Date().toISOString().slice(0, 10);
}
function isFuture(date: string) {
  return date >= new Date().toISOString().slice(0, 10);
}

export default function SchedulePage() {
  const router = useRouter();
  const { user, loading: authLoading, signOut } = useAuth();
  const [schedules, setSchedules] = useState<Schedule[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [editing, setEditing] = useState<Schedule | null>(null);
  const [showPast, setShowPast] = useState(false);

  useEffect(() => {
    if (!authLoading && !user) router.replace("/login?redirect=/schedule");
  }, [authLoading, user, router]);

  useEffect(() => {
    if (!user) return;
    const unsub = subscribeSchedules(user.agencyId, list => { setSchedules(list); setLoaded(true); });
    return () => unsub();
  }, [user]);

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

  const filtered = useMemo(() => {
    return schedules.filter(s => showPast ? true : (s.status !== "done" && isFuture(s.date)));
  }, [schedules, showPast]);

  // 날짜별 그룹
  const grouped = useMemo(() => {
    const map: Record<string, Schedule[]> = {};
    for (const s of filtered) {
      if (!map[s.date]) map[s.date] = [];
      map[s.date].push(s);
    }
    return Object.entries(map).sort(([a], [b]) => a.localeCompare(b));
  }, [filtered]);

  const todayCount = schedules.filter(s => isToday(s.date) && s.status === "scheduled").length;

  if (authLoading || !user) return <div className="min-h-screen flex items-center justify-center text-gray-400 text-sm">불러오는 중…</div>;

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
        <div className="text-center mb-6">
          <div className="inline-flex items-center gap-2 bg-blue-600 text-white px-4 py-1.5 rounded-full text-sm font-medium mb-3">
            📅 스케줄 관리
          </div>
          <h1 className="text-xl sm:text-2xl font-bold text-gray-900 mb-1">약속 · 일정 관리</h1>
          <p className="text-gray-500 text-xs sm:text-sm mb-4">집보기·계약·잔금 약속 한눈에</p>
          <button
            onClick={() => setEditing(emptySchedule())}
            className="px-5 py-2.5 rounded-full border-2 border-blue-500 bg-blue-50 text-blue-700 text-sm font-semibold hover:bg-blue-100 transition-colors"
          >
            + 일정 추가
          </button>
        </div>

        {/* 오늘 알림 */}
        {todayCount > 0 && (
          <div className="bg-blue-50 border border-blue-200 rounded-2xl px-4 py-3 mb-4 text-sm text-blue-800 font-medium">
            📌 오늘 약속 {todayCount}건이 있습니다
          </div>
        )}

        {/* 필터 */}
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
            <div className="text-base font-semibold text-gray-900 mb-1">예정된 일정이 없습니다</div>
            <div className="text-xs text-gray-500 mb-4">집보기·계약 약속을 등록해보세요</div>
            <button onClick={() => setEditing(emptySchedule())} className="text-sm px-4 py-2 rounded-full border-2 border-blue-500 bg-blue-50 text-blue-700 font-semibold">
              + 첫 일정 추가
            </button>
          </div>
        ) : (
          <div className="space-y-4">
            {grouped.map(([date, items]) => (
              <div key={date}>
                {/* 날짜 헤더 */}
                <div className={`flex items-center gap-2 mb-2 ${isToday(date) ? "text-blue-700" : "text-gray-500"}`}>
                  <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${isToday(date) ? "bg-blue-100" : "bg-gray-100"}`}>
                    {isToday(date) ? "오늘" : new Date(date + "T00:00:00").toLocaleDateString("ko-KR", { month: "long", day: "numeric", weekday: "short" })}
                  </span>
                  <div className="flex-1 h-px bg-gray-200" />
                  <span className="text-[11px]">{items.length}건</span>
                </div>

                <div className="space-y-2">
                  {items.map(s => (
                    <ScheduleCard
                      key={s.id}
                      schedule={s}
                      onEdit={() => setEditing({ ...s })}
                      onDone={() => done(s)}
                      onDelete={() => remove(s.id)}
                    />
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {editing && (
        <ScheduleModal
          schedule={editing}
          onClose={() => setEditing(null)}
          onSave={async s => { await upsert(s); setEditing(null); }}
        />
      )}
    </div>
  );
}

/* ── 스케줄 카드 ── */
function ScheduleCard({ schedule: s, onEdit, onDone, onDelete }: {
  schedule: Schedule;
  onEdit: () => void;
  onDone: () => void;
  onDelete: () => void;
}) {
  const isDone = s.status === "done";
  return (
    <div className={`rounded-2xl border p-3 sm:p-4 ${isDone ? "bg-gray-50/60 border-gray-200 opacity-60" : "bg-white border-gray-200 shadow-sm"}`}>
      <div className="flex items-start gap-3">
        {/* 시간 */}
        <div className={`flex-shrink-0 w-14 text-center rounded-xl py-2 ${isDone ? "bg-gray-100" : "bg-blue-50"}`}>
          <div className={`text-sm font-bold ${isDone ? "text-gray-400" : "text-blue-700"}`}>{s.time}</div>
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex flex-wrap items-center gap-1.5 mb-1">
            <span className={`text-[11px] px-1.5 py-0.5 rounded font-medium ${TYPE_COLORS[s.scheduleType]}`}>{s.scheduleType}</span>
            {isDone && <span className="text-[11px] px-1.5 py-0.5 rounded bg-green-100 text-green-700">완료</span>}
          </div>
          <div className="text-sm font-semibold text-gray-800 break-all">{s.propertyAddress || "매물 주소 미입력"}</div>

          {s.visitorPhone && (
            <div className="mt-1.5 flex items-center gap-2 text-xs">
              <span className="text-gray-500 shrink-0">{s.visitorName || "방문자"}</span>
              <a href={`tel:${s.visitorPhone.replace(/\D/g,"")}`} className="text-blue-600 hover:underline">📞 {formatPhone(s.visitorPhone)}</a>
              <a
                href={`sms:${s.visitorPhone.replace(/\D/g,"")}?body=${encodeURIComponent(`안녕하세요${s.visitorName ? ` ${s.visitorName}님` : ""}, 미사금빛공인중개사입니다.\n${s.date} ${s.time} ${s.propertyAddress} ${s.scheduleType} 약속 확인드립니다.`)}`}
                className="text-[10px] px-2 py-0.5 rounded-full border border-blue-200 text-blue-700 hover:bg-blue-50 ml-auto"
              >
                문자
              </a>
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

/* ── 스케줄 등록/수정 모달 ── */
function ScheduleModal({ schedule, onClose, onSave }: {
  schedule: Schedule;
  onClose: () => void;
  onSave: (s: Schedule) => Promise<void>;
}) {
  const [form, setForm] = useState<Schedule>(schedule);
  const [saving, setSaving] = useState(false);
  const set = <K extends keyof Schedule>(k: K, v: Schedule[K]) => setForm(p => ({ ...p, [k]: v }));

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
      <div className="bg-white rounded-t-3xl sm:rounded-3xl w-full sm:max-w-md max-h-[90vh] overflow-y-auto shadow-2xl" onClick={e => e.stopPropagation()}>
        <div className="sticky top-0 bg-white border-b border-gray-100 px-5 py-3 flex items-center justify-between rounded-t-3xl">
          <h2 className="text-base font-semibold">{!schedule.propertyAddress ? "일정 추가" : "일정 수정"}</h2>
          <button onClick={onClose} className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-gray-100 text-gray-500 text-lg">✕</button>
        </div>
        <div className="p-5 space-y-3">

          {/* 종류 */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">일정 종류</label>
            <div className="grid grid-cols-4 gap-1.5">
              {SCHEDULE_TYPES.map(t => (
                <button key={t} type="button" onClick={() => set("scheduleType", t)}
                  className={`py-2 rounded-xl text-xs font-medium border transition-colors ${form.scheduleType === t ? "bg-blue-600 text-white border-blue-600" : "bg-gray-50 text-gray-600 border-gray-200 hover:border-blue-400"}`}>
                  {t}
                </button>
              ))}
            </div>
          </div>

          {/* 날짜 + 시간 */}
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

          {/* 매물 주소 */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">매물 주소 <span className="text-red-400">*</span></label>
            <input value={form.propertyAddress} onChange={e => set("propertyAddress", e.target.value)}
              placeholder="예: 힐스테이트 미사역 101동 1902호"
              className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm bg-gray-50 focus:outline-none focus:ring-2 focus:ring-blue-500" />
          </div>

          {/* 방문자 */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">방문자 이름</label>
              <input value={form.visitorName} onChange={e => set("visitorName", e.target.value)}
                placeholder="홍길동" className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm bg-gray-50 focus:outline-none focus:ring-2 focus:ring-blue-500" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">연락처</label>
              <input type="tel" value={form.visitorPhone} onChange={e => set("visitorPhone", e.target.value)}
                placeholder="010-0000-0000" className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm bg-gray-50 focus:outline-none focus:ring-2 focus:ring-blue-500" />
            </div>
          </div>

          {/* 메모 */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">메모</label>
            <textarea value={form.memo} onChange={e => set("memo", e.target.value)}
              placeholder="특이사항, 준비물 등" rows={2}
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
