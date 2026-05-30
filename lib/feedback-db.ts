/**
 * 건의함 — 전역 Firestore 컬렉션
 *
 * 경로: /feedback/{feedbackId}
 *
 * - 모든 로그인 사용자가 건의 등록 가능
 * - 본인은 자기 건의만 조회
 * - 관리자(ADMIN_EMAIL)는 전체 조회·답변·처리
 */

import {
  collection,
  addDoc,
  updateDoc,
  deleteDoc,
  doc,
  query,
  orderBy,
  where,
  onSnapshot,
  serverTimestamp,
  Timestamp,
  type Unsubscribe,
} from "firebase/firestore";
import { db } from "./firebase";

export const ADMIN_EMAIL = "vpfldh87@gmail.com";

export interface FeedbackItem {
  id: string;
  text: string;
  status: "pending" | "done";
  createdAt: number;
  reply: string;
  submittedBy: {
    uid: string;
    email: string;
    name: string;
  };
}

function feedbackCol() {
  return collection(db, "feedback");
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
    submittedBy: (data.submittedBy as FeedbackItem["submittedBy"]) || {
      uid: "",
      email: "",
      name: "알 수 없음",
    },
  };
}

/** 실시간 구독 — 관리자는 전체, 일반 사용자는 본인 것만 */
export function subscribeFeedback(
  uid: string,
  isAdmin: boolean,
  onChange: (items: FeedbackItem[]) => void,
): Unsubscribe {
  const q = isAdmin
    ? query(feedbackCol(), orderBy("createdAt", "desc"))
    : query(feedbackCol(), where("submittedBy.uid", "==", uid), orderBy("createdAt", "desc"));

  return onSnapshot(q, snap => {
    onChange(snap.docs.map(d => fromDoc(d.id, d.data() as Record<string, unknown>)));
  });
}

/** 새 건의 등록 */
export async function addFeedback(
  uid: string,
  email: string,
  name: string,
  text: string,
): Promise<void> {
  await addDoc(feedbackCol(), {
    text,
    status: "pending",
    createdAt: serverTimestamp(),
    reply: "",
    submittedBy: { uid, email, name },
  });
}

/** 상태/답변 업데이트 */
export async function updateFeedback(
  id: string,
  updates: Partial<Pick<FeedbackItem, "status" | "reply">>,
): Promise<void> {
  await updateDoc(doc(db, "feedback", id), updates);
}

/** 삭제 */
export async function deleteFeedback(id: string): Promise<void> {
  await deleteDoc(doc(db, "feedback", id));
}
