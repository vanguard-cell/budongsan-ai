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
  arrayUnion,
  serverTimestamp,
  Timestamp,
  type Unsubscribe,
} from "firebase/firestore";
import { db } from "./firebase";

export const ADMIN_EMAIL = "vpfldh87@gmail.com";

/** 대화 스레드의 메시지 한 건 */
export interface FeedbackMessage {
  sender: "user" | "admin";
  senderName: string;
  text: string;
  image?: string;        // 압축된 base64 data URL (선택)
  createdAt: number;
}

export interface FeedbackItem {
  id: string;
  text: string;          // (레거시) 첫 문의 내용
  status: "pending" | "done";
  createdAt: number;
  reply: string;         // (레거시) 단일 답변 — thread로 마이그레이션
  thread: FeedbackMessage[];  // 대화 스레드
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
  const text = (data.text as string) || "";
  const reply = (data.reply as string) || "";
  const submittedBy = (data.submittedBy as FeedbackItem["submittedBy"]) || {
    uid: "", email: "", name: "알 수 없음",
  };

  // thread가 있으면 그대로, 없으면 레거시(text/reply)에서 구성
  let thread: FeedbackMessage[] = Array.isArray(data.thread)
    ? (data.thread as FeedbackMessage[])
    : [];
  if (thread.length === 0) {
    if (text) thread.push({ sender: "user", senderName: submittedBy.name, text, createdAt });
    if (reply) thread.push({ sender: "admin", senderName: "관리자", text: reply, createdAt: createdAt + 1 });
  }

  return {
    id, text, status: (data.status as FeedbackItem["status"]) || "pending",
    createdAt, reply, thread, submittedBy,
  };
}

/** 실시간 구독 — 관리자는 전체, 일반 사용자는 본인 것만
 *
 * 주의: where + orderBy 조합은 Firestore에서 복합 인덱스가 필요하므로
 * 일반 사용자 쿼리는 where만 사용하고 클라이언트에서 정렬한다.
 * (사용자별 글은 보통 수십 건 이하라 클라 정렬 부담 없음)
 */
export function subscribeFeedback(
  uid: string,
  isAdmin: boolean,
  onChange: (items: FeedbackItem[]) => void,
): Unsubscribe {
  const q = isAdmin
    ? query(feedbackCol(), orderBy("createdAt", "desc"))
    : query(feedbackCol(), where("submittedBy.uid", "==", uid));

  return onSnapshot(
    q,
    snap => {
      const items = snap.docs.map(d => fromDoc(d.id, d.data() as Record<string, unknown>));
      // 클라이언트 정렬 — 최신순
      items.sort((a, b) => b.createdAt - a.createdAt);
      onChange(items);
    },
    err => {
      console.error("[feedback] subscribe 실패:", err);
      onChange([]);
    },
  );
}

/** 새 건의 등록 — 첫 메시지를 thread에 담음 */
export async function addFeedback(
  uid: string,
  email: string,
  name: string,
  text: string,
  image?: string,
): Promise<void> {
  const firstMsg: FeedbackMessage = {
    sender: "user", senderName: name, text, createdAt: Date.now(),
    ...(image ? { image } : {}),
  };
  await addDoc(feedbackCol(), {
    text,                       // 레거시 호환 (목록 미리보기용)
    status: "pending",
    createdAt: serverTimestamp(),
    reply: "",
    thread: [firstMsg],
    submittedBy: { uid, email, name },
  });
}

/** 스레드에 메시지 추가 (문의자·관리자 양쪽 대화) */
export async function addMessage(
  id: string,
  msg: { sender: "user" | "admin"; senderName: string; text: string; image?: string },
): Promise<void> {
  const message: FeedbackMessage = {
    sender: msg.sender,
    senderName: msg.senderName,
    text: msg.text,
    createdAt: Date.now(),
    ...(msg.image ? { image: msg.image } : {}),
  };
  await updateDoc(doc(db, "feedback", id), {
    thread: arrayUnion(message),
    // 문의자가 추가하면 다시 대기중으로
    ...(msg.sender === "user" ? { status: "pending" } : {}),
  });
}

/** 상태 업데이트 */
export async function updateFeedback(
  id: string,
  updates: Partial<Pick<FeedbackItem, "status">>,
): Promise<void> {
  await updateDoc(doc(db, "feedback", id), updates);
}

/** 삭제 */
export async function deleteFeedback(id: string): Promise<void> {
  await deleteDoc(doc(db, "feedback", id));
}
