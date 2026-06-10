/**
 * 팀(직원) 관리 — 초대 코드 기반 사무실 합류
 *
 * 흐름:
 *  1) 대표가 초대 코드 생성 → /invites/{code} { agencyId, agencyName, createdBy }
 *  2) 직원이 코드 입력 → invite 조회 → agencies.members에 본인 uid arrayUnion
 *     (Security Rules: joinCode가 유효하고 "본인만 추가"일 때만 허용)
 *  3) 본인 users 문서의 agencyId 변경 → 새로고침하면 파트너로 입장
 */

import {
  doc, getDoc, setDoc, updateDoc, deleteDoc, onSnapshot,
  arrayUnion, serverTimestamp,
  type Unsubscribe,
} from "firebase/firestore";
import { db } from "./firebase";

export interface MemberInfo {
  name: string;
  email: string;
  joinedAt: number;
}

export interface AgencyDoc {
  name: string;
  owner: string;
  members: string[];
  memberInfo?: Record<string, MemberInfo>;
}

export interface Invite {
  agencyId: string;
  agencyName: string;
  createdBy: string;
  createdAt: number;
}

/** 6자리 초대 코드 (혼동 글자 제외) */
function genCode(): string {
  const chars = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
  let s = "";
  for (let i = 0; i < 6; i++) s += chars[Math.floor(Math.random() * chars.length)];
  return s;
}

/** 사무실 문서 실시간 구독 (멤버만 가능) */
export function subscribeAgency(agencyId: string, onChange: (a: AgencyDoc | null) => void): Unsubscribe {
  return onSnapshot(
    doc(db, "agencies", agencyId),
    snap => onChange(snap.exists() ? (snap.data() as AgencyDoc) : null),
    err => { console.error("[team] agency 구독 실패:", err); onChange(null); },
  );
}

/** 초대 코드 생성 (대표만) — 코드 반환 */
export async function createInvite(agencyId: string, agencyName: string, uid: string): Promise<string> {
  const code = genCode();
  await setDoc(doc(db, "invites", code), {
    agencyId, agencyName, createdBy: uid,
    createdAt: Date.now(), createdAtServer: serverTimestamp(),
  });
  return code;
}

/** 초대 코드 조회 */
export async function getInvite(code: string): Promise<Invite | null> {
  const snap = await getDoc(doc(db, "invites", code.trim().toUpperCase()));
  return snap.exists() ? (snap.data() as Invite) : null;
}

/** 초대 코드 삭제 (발급자) */
export async function deleteInvite(code: string): Promise<void> {
  await deleteDoc(doc(db, "invites", code));
}

/**
 * 사무실 합류 — 본인 uid를 members에 추가 + 본인 user 문서 agencyId 변경
 * Security Rules가 joinCode 유효성·본인만 추가를 강제
 */
export async function joinAgency(code: string, uid: string, name: string, email: string): Promise<Invite> {
  const normalized = code.trim().toUpperCase();
  const invite = await getInvite(normalized);
  if (!invite) throw new Error("초대 코드를 찾을 수 없습니다. 코드를 다시 확인해주세요.");

  // 1) 사무실 members에 본인 추가 (+ 이름 기록, joinCode는 규칙 검증용)
  await updateDoc(doc(db, "agencies", invite.agencyId), {
    members: arrayUnion(uid),
    [`memberInfo.${uid}`]: { name, email, joinedAt: Date.now() },
    joinCode: normalized,
  });

  // 2) 본인 user 문서의 agencyId 교체
  await setDoc(doc(db, "users", uid), { agencyId: invite.agencyId }, { merge: true });

  return invite;
}

/** 본인 멤버 정보 기록 (이름 표시용 — 대표 포함, 멤버면 가능) */
export async function upsertMyMemberInfo(agencyId: string, uid: string, name: string, email: string): Promise<void> {
  try {
    await updateDoc(doc(db, "agencies", agencyId), {
      [`memberInfo.${uid}`]: { name, email, joinedAt: Date.now() },
    });
  } catch (e) {
    console.error("[team] memberInfo 기록 실패:", e);
  }
}
