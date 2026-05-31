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
    scheduleType:    (d.scheduleType    as ScheduleType) || "집보기",
    memo:            (d.memo            as string) || "",
    status:          (d.status          as ScheduleStatus) || "scheduled",
  };
}

export function subscribeSchedules(agencyId: string, onChange: (list: Schedule[]) => void): Unsubscribe {
  const q = query(col(agencyId), orderBy("date", "asc"), orderBy("time", "asc"));
  return onSnapshot(q, snap => onChange(snap.docs.map(d => fromDoc(d.id, d.data() as Record<string, unknown>))));
}

export async function saveSchedule(agencyId: string, s: Schedule): Promise<void> {
  const { id, ...rest } = s;
  await setDoc(ref(agencyId, id), { ...rest, updatedAt: serverTimestamp(), createdAt: rest.createdAt || Date.now() });
}

export async function deleteSchedule(agencyId: string, id: string): Promise<void> {
  await deleteDoc(ref(agencyId, id));
}
