/**
 * 스케줄 관리 — Firestore CRUD
 * 경로: /agencies/{agencyId}/schedules/{scheduleId}
 */

import {
  collection, doc, setDoc, deleteDoc,
  query, orderBy, onSnapshot, serverTimestamp, Timestamp,
  type Unsubscribe,
} from "firebase/firestore";
import { db } from "./firebase";

export type ScheduleType = "집보기" | "계약일" | "중도금일" | "잔금일" | "기타";
export type ScheduleStatus = "scheduled" | "done" | "cancelled";

export interface Schedule {
  id: string;
  date: string;         // YYYY-MM-DD
  time: string;         // HH:MM
  visitorName: string;
  visitorPhone: string;
  propertyAddress: string;
  propertyId?: string;   // 연결된 매물 ID
  customerId?: string;   // 연결된 고객 ID
  scheduleType: ScheduleType;
  memo: string;
  status: ScheduleStatus;
  createdAt: number;
}

export function emptySchedule(): Schedule {
  const today = new Date().toISOString().slice(0, 10);
  return {
    id: Math.random().toString(36).slice(2) + Date.now().toString(36),
    date: today, time: "10:00",
    visitorName: "", visitorPhone: "",
    propertyAddress: "", scheduleType: "집보기",
    memo: "", status: "scheduled", createdAt: Date.now(),
  };
}

function col(agencyId: string) {
  return collection(db, "agencies", agencyId, "schedules");
}
function ref(agencyId: string, id: string) {
  return doc(db, "agencies", agencyId, "schedules", id);
}
function fromDoc(id: string, d: Record<string, unknown>): Schedule {
  const createdAt = d.createdAt instanceof Timestamp ? d.createdAt.toMillis() : (d.createdAt as number) || Date.now();
  // 레거시 타입 마이그레이션: "계약" → "계약일", "잔금" → "잔금일"
  let rawType = (d.scheduleType as string) || "집보기";
  if (rawType === "계약") rawType = "계약일";
  if (rawType === "잔금") rawType = "잔금일";
  return {
    id, createdAt,
    date:            (d.date            as string) || "",
    time:            (d.time            as string) || "",
    visitorName:     (d.visitorName     as string) || "",
    visitorPhone:    (d.visitorPhone    as string) || "",
    propertyAddress: (d.propertyAddress as string) || "",
    propertyId:      (d.propertyId      as string) || undefined,
    customerId:      (d.customerId      as string) || undefined,
    scheduleType:    rawType as ScheduleType,
    memo:            (d.memo            as string) || "",
    status:          (d.status          as ScheduleStatus) || "scheduled",
  };
}

export function subscribeSchedules(agencyId: string, onChange: (list: Schedule[]) => void): Unsubscribe {
  // 단일 orderBy만 사용 (date) → 인덱스 불필요. time 정렬은 클라이언트에서.
  const q = query(col(agencyId), orderBy("date", "asc"));
  return onSnapshot(
    q,
    snap => {
      const list = snap.docs.map(d => fromDoc(d.id, d.data() as Record<string, unknown>));
      // 같은 날짜는 시간으로 정렬
      list.sort((a, b) => a.date.localeCompare(b.date) || a.time.localeCompare(b.time));
      onChange(list);
    },
    err => {
      console.error("[schedules] subscribe 실패:", err);
      onChange([]);
    },
  );
}

export async function saveSchedule(agencyId: string, s: Schedule): Promise<void> {
  const { id, ...rest } = s;
  const payload: Record<string, unknown> = {
    ...rest,
    updatedAt: serverTimestamp(),
    createdAt: rest.createdAt || Date.now(),
  };
  // Firestore는 undefined 거부 → optional 필드(propertyId/customerId) 정리
  for (const k of Object.keys(payload)) {
    if (payload[k] === undefined) delete payload[k];
  }
  try {
    await setDoc(ref(agencyId, id), payload);
  } catch (e) {
    console.error("[saveSchedule] 실패:", e, "payload:", payload);
    throw e;
  }
}

export async function deleteSchedule(agencyId: string, id: string): Promise<void> {
  await deleteDoc(ref(agencyId, id));
}

/** 다건 일괄 추가 (예시 데이터용) */
export async function saveSchedulesBatch(agencyId: string, list: Schedule[]): Promise<void> {
  for (const s of list) await saveSchedule(agencyId, s);
}

/** N일 후 날짜 (YYYY-MM-DD) */
function dayOffset(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}
const sid = () => Math.random().toString(36).slice(2) + Date.now().toString(36);

/** 예시 일정 5건 — 약속·계약일·중도금일·잔금일 골고루 */
export function sampleSchedules(): Schedule[] {
  const now = Date.now();
  const mk = (over: Partial<Schedule>): Schedule => ({
    id: sid(), date: dayOffset(0), time: "10:00",
    visitorName: "", visitorPhone: "", propertyAddress: "",
    scheduleType: "집보기", memo: "", status: "scheduled", createdAt: now,
    ...over,
  });
  return [
    mk({ date: dayOffset(0),  time: "14:00", visitorName: "이수민", visitorPhone: "010-3344-5566",
         propertyAddress: "힐스테이트 미사역 그랑파사쥬 101동 1902호", scheduleType: "집보기",
         memo: "신혼부부 · 남향 선호" }),
    mk({ date: dayOffset(1),  time: "11:00", visitorName: "박정훈", visitorPhone: "010-7788-9900",
         propertyAddress: "미사강변 오벨리스크 101-613호", scheduleType: "집보기",
         memo: "1층 상가 카페 자리 문의" }),
    mk({ date: dayOffset(3),  time: "15:30", visitorName: "김국환", visitorPhone: "010-5205-1111",
         propertyAddress: "힐스테이트 미사역 그랑파사쥬 101동 1902호", scheduleType: "계약일",
         memo: "매매 계약 · 계약금 5,500만" }),
    mk({ date: dayOffset(6),  time: "13:00", visitorName: "조현민", visitorPhone: "010-7924-1111",
         propertyAddress: "망월동 공공주택지구 11-1 1023호", scheduleType: "중도금일",
         memo: "중도금 입금 확인 필요" }),
    mk({ date: dayOffset(12), time: "10:30", visitorName: "권다솜", visitorPhone: "010-9242-3333",
         propertyAddress: "미사효성 해링턴타워 더퍼스트 101동 2717호", scheduleType: "잔금일",
         memo: "잔금 + 입주 · 관리비 정산" }),
  ];
}
