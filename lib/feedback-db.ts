/**
 * 건의함 / 수정 요청 — Firestore CRUD
 *
 * 경로: /agencies/{agencyId}/feedback/{feedbackId}
 */

import {
  collection,
  addDoc,
  updateDoc,
  deleteDoc,
  doc,
  query,
  orderBy,
  onSnapshot,
  serverTimestamp,
  Timestamp,
  type Unsubscribe,
} from "firebase/firestore";
import { db } from "./firebase";

export interface FeedbackItem {
  id: string;
  text: string;
  status: "pending" | "done";
  createdAt: number;
  reply: string;
}

function feedbackCol(agencyId: string) {
  return collection(db, "agencies", agencyId, "feedback");
}

function feedbackDoc(agencyId: string, feedbackId: string) {
  return doc(db, "agencies", agencyId, "feedback", feedbackId);
}

function fromDoc(id: string, data: Record<string, unknown>): FeedbackItem {
  const createdAt =
    data.createdAt instanceof Timestamp
      ? data.createdAt.toMillis()
      : (data.createdAt as number) || Date.now();
  return {
    id,
    text: (data.text as string) || "",
    status: (data.status as FeedbackItem["status"]) || "pending",
    createdAt,
    reply: (data.reply as string) || "",
  };
}

/** 실시간 구독 */
export function subscribeFeedback(
  agencyId: string,
  onChange: (items: FeedbackItem[]) => void,
): Unsubscribe {
  const q = query(feedbackCol(agencyId), orderBy("createdAt", "desc"));
  return onSnapshot(q, snap => {
    onChange(snap.docs.map(d => fromDoc(d.id, d.data() as Record<string, unknown>)));
  });
}

/** 새 건의 등록 */
export async function addFeedback(agencyId: string, text: string): Promise<void> {
  await addDoc(feedbackCol(agencyId), {
    text,
    status: "pending",
    createdAt: serverTimestamp(),
    reply: "",
  });
}

/** 상태/답변 업데이트 */
export async function updateFeedback(
  agencyId: string,
  id: string,
  updates: Partial<Pick<FeedbackItem, "status" | "reply">>,
): Promise<void> {
  await updateDoc(feedbackDoc(agencyId, id), updates);
}

/** 삭제 */
export async function deleteFeedback(agencyId: string, id: string): Promise<void> {
  await deleteDoc(feedbackDoc(agencyId, id));
}
