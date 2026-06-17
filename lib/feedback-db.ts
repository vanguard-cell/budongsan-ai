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
  getDoc,
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

/** 대화 스레드의 메시지 한 건 */
export interface FeedbackMessage {
  sender: "user" | "admin";
  senderName: string;
  text: string;
  image?: string;        // 압축된 base64 data URL (선택)
  createdAt: number;
}

/** 상태 3단계: pending=문의(접수), in_progress=진행중, done=완료 */
export type FeedbackStatus = "pending" | "in_progress" | "done";

export interface FeedbackItem {
  id: string;
  text: string;          // (레거시) 첫 문의 내용
  status: FeedbackStatus;
  createdAt: number;
  reply: string;         // (레거시) 단일 답변 — thread로 마이그레이션
  thread: FeedbackMessage[];  // 대화 스레드
  userConfirmed?: boolean;    // 처리완료를 문의자가 확인했는지 (확인 독촉용)
  lastReplyBy?: "user" | "admin";  // 마지막 메시지 보낸 쪽 — "새 답글" 배지용
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
    id, text, status: (data.status as FeedbackStatus) || "pending",
    createdAt, reply, thread, submittedBy,
    userConfirmed: (data.userConfirmed as boolean) ?? false,
    lastReplyBy: (data.lastReplyBy as "user" | "admin") || undefined,
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
    lastReplyBy: "user",
    submittedBy: { uid, email, name },
  });
}

/** 스레드에 메시지 추가 (문의자·관리자 양쪽 대화)
 *  레거시(text/reply만 있는) 문서는 먼저 thread로 보존한 뒤 추가 → 기존 질문 누락 방지
 */
export async function addMessage(
  id: string,
  msg: { sender: "user" | "admin"; senderName: string; text: string; image?: string },
): Promise<void> {
  const ref = doc(db, "feedback", id);
  const snap = await getDoc(ref);
  const data = (snap.data() as Record<string, unknown>) || {};

  // 기존 thread 확보 (없으면 레거시 text/reply에서 복원)
  let thread: FeedbackMessage[] = Array.isArray(data.thread) ? [...(data.thread as FeedbackMessage[])] : [];
  if (thread.length === 0) {
    const text = (data.text as string) || "";
    const reply = (data.reply as string) || "";
    const createdAt = data.createdAt instanceof Timestamp ? data.createdAt.toMillis() : (data.createdAt as number) || Date.now();
    const sb = (data.submittedBy as { name?: string }) || {};
    if (text) thread.push({ sender: "user", senderName: sb.name || "사용자", text, createdAt });
    if (reply) thread.push({ sender: "admin", senderName: "관리자", text: reply, createdAt: createdAt + 1 });
  }

  thread.push({
    sender: msg.sender,
    senderName: msg.senderName,
    text: msg.text,
    createdAt: Date.now(),
    ...(msg.image ? { image: msg.image } : {}),
  });

  // 칸반 상태 규칙:
  //  · 관리자가 첫 답변을 달면 문의(pending) → 진행중(in_progress) 자동 전환
  //  · 유저 답글은 상태를 바꾸지 않음(칸 튕김 방지). lastReplyBy로 "새 답글" 배지만.
  const curStatus = (data.status as FeedbackStatus) || "pending";
  const patch: Record<string, unknown> = { thread, lastReplyBy: msg.sender };
  if (msg.sender === "admin" && curStatus === "pending") {
    patch.status = "in_progress";
  }

  await updateDoc(ref, patch);
}

/** 상태 업데이트 (status / userConfirmed) */
export async function updateFeedback(
  id: string,
  updates: Partial<Pick<FeedbackItem, "status" | "userConfirmed">>,
): Promise<void> {
  await updateDoc(doc(db, "feedback", id), updates);
}

/** 칸반 상태 변경 — 드래그/버튼 공용. 완료로 가면 확인 대기 리셋 */
export async function setStatus(id: string, status: FeedbackStatus): Promise<void> {
  await updateDoc(doc(db, "feedback", id), {
    status,
    ...(status === "done" ? { userConfirmed: false } : {}),
  });
}

/** 처리완료 표시 (관리자/문의자) — 유저 확인 대기 상태로 리셋 */
export async function markDone(id: string): Promise<void> {
  await updateDoc(doc(db, "feedback", id), { status: "done", userConfirmed: false });
}

/** 다시 진행중으로 */
export async function markPending(id: string): Promise<void> {
  await updateDoc(doc(db, "feedback", id), { status: "in_progress", userConfirmed: false });
}

/** 문의자가 처리완료를 확인 ("확인했어요") */
export async function confirmByUser(id: string): Promise<void> {
  await updateDoc(doc(db, "feedback", id), { userConfirmed: true });
}

/** 삭제 */
export async function deleteFeedback(id: string): Promise<void> {
  await deleteDoc(doc(db, "feedback", id));
}
