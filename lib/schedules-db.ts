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

export type ScheduleType = "집보기" | "계약" | "잔금" | "기타";
export type ScheduleStatus = "scheduled" | "done" | "cancelled";

export interface Schedule {
  id: string;
  date: string;         // YYYY-MM-DD
  time: string;         // HH:MM
  visitorName: string;
  visitorPhone: string;
  propertyAddress: string;
  propertyId?: string;   // 연결된 매물 ID
  customerId?: string;   // 연결된 손님 ID
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
  return {
    id, createdAt,
    date:            (d.date            as string) || "",
    time:            (d.time            as string) || "",
    visitorName:     (d.visitorName     as string) || "",
    visitorPhone:    (d.visitorPhone    as string) || "",
    propertyAddress: (d.propertyAddress as string) || "",
    propertyId:      (d.propertyId      as string) || undefined,
    customerId:      (d.customerId      as string) || undefined,
    scheduleType:    (d.scheduleType    as ScheduleType) || "집보기",
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
  await setDoc(ref(agencyId, id), { ...rest, updatedAt: serverTimestamp(), createdAt: rest.createdAt || Date.now() });
}

export async function deleteSchedule(agencyId: string, id: string): Promise<void> {
  await deleteDoc(ref(agencyId, id));
}
