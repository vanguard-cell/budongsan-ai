"use client";

/**
 * 인증 컨텍스트
 *
 * - useAuth() 훅으로 어디서든 현재 로그인 상태 확인
 * - Google 로그인 + 이메일/비밀번호 지원 (카카오는 추후)
 * - 첫 로그인 시 사용자 문서 + 사무실(agency) 자동 생성
 */

import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import {
  GoogleAuthProvider,
  signInWithPopup,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signOut as fbSignOut,
  onAuthStateChanged,
  type User,
} from "firebase/auth";
import { doc, getDoc, setDoc, updateDoc, increment, serverTimestamp } from "firebase/firestore";
import { auth, db } from "./firebase";
import { kstDateStr } from "./kst";

/**
 * 사용자 역할
 * - owner: 사무실 개설자(대표공인중개사) — "대표님"
 * - partner: 같은 사무실에 초대받은 직원 — "파트너님"
 *
 * agencies.owner === user.uid 일 때 owner, 아니면 partner
 * 추후 직원 초대 기능 추가 시 members 배열에 추가하면 partner로 입장
 */
export type UserRole = "owner" | "partner";

export interface AppUser {
  uid: string;
  email: string | null;
  displayName: string | null;
  photoURL: string | null;
  agencyId: string;
  role: UserRole;
}

/** role → 한국어 호칭 ("대표님" / "파트너님") */
export const roleTitle = (role: UserRole): string =>
  role === "owner" ? "대표님" : "파트너님";

interface AuthContextValue {
  user: AppUser | null;
  loading: boolean;
  signInGoogle: () => Promise<void>;
  signInEmail: (email: string, password: string) => Promise<void>;
  signUpEmail: (email: string, password: string, displayName: string) => Promise<void>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used inside <AuthProvider>");
  return ctx;
}

/**
 * 페이지 사용량 기록 — 어떤 메뉴를 얼마나 쓰는지 집계 (단순화 근거 데이터)
 * 유저 문서에 pageViews.{경로} += 1. 본인 문서 self-update라 규칙 그대로 허용.
 * 실패해도 조용히 무시 (사용 흐름 방해 금지).
 */
export function recordPageView(uid: string, pathKey: string): void {
  if (!uid || !pathKey) return;
  const userRef = doc(db, "users", uid);
  updateDoc(userRef, {
    [`pageViews.${pathKey}`]: increment(1),
    lastPageAt: serverTimestamp(),
  }).catch(() => { /* 비핵심 — 무시 */ });
}

/**
 * 기능 사용량 기록 — 어떤 '행동'을 얼마나 하는지 집계 (단순화 근거: 메뉴 방문보다 정밀)
 * 유저 문서에 features.{키} += 1. 본인 self-update. 실패해도 조용히 무시.
 * 호출 예: recordFeatureUse(user.uid, "prop_add")
 */
export function recordFeatureUse(uid: string | undefined, key: string): void {
  if (!uid || !key) return;
  updateDoc(doc(db, "users", uid), {
    [`features.${key}`]: increment(1),
    lastFeatureAt: serverTimestamp(),
  }).catch(() => { /* 비핵심 — 무시 */ });
}

/**
 * 사용자 문서 + 사무실(agency) 자동 생성 또는 조회
 * 같은 사용자가 다른 로그인 방식으로 들어와도 같은 agency를 사용 (이메일 기준)
 */
async function ensureUserAndAgency(fbUser: User): Promise<AppUser> {
  const userRef = doc(db, "users", fbUser.uid);
  const userSnap = await getDoc(userRef);

  if (userSnap.exists()) {
    const data = userSnap.data();
    // 활동 기록 — 마지막 접속 + 누적 횟수 + 날짜별 접속(일/주/월 접속일 집계용)
    const today = kstDateStr();   // 한국(KST) 달력 날짜 YYYY-MM-DD
    updateDoc(userRef, {
      lastLoginAt: serverTimestamp(),
      loginCount: increment(1),
      [`loginDays.${today}`]: increment(1),
    }).catch(e => console.error("[auth] 활동 기록 실패:", e));

    // 역할 결정 — agency.owner === uid 이면 대표, 아니면 파트너
    let role: UserRole = "partner";
    try {
      const agencySnap = await getDoc(doc(db, "agencies", data.agencyId));
      if (agencySnap.exists() && agencySnap.data().owner === fbUser.uid) {
        role = "owner";
      }
    } catch (e) {
      console.error("[auth] agency 조회 실패 — 기본 owner로 처리:", e);
      role = "owner";   // 안전 폴백 (조회 실패 시 자신을 대표로 가정)
    }

    return {
      uid: fbUser.uid,
      email: fbUser.email,
      displayName: fbUser.displayName || data.displayName || null,
      photoURL: fbUser.photoURL,
      agencyId: data.agencyId,
      role,
    };
  }

  // 새 사용자 → 새 사무실 생성 (자동으로 대표가 됨)
  const agencyId = `agency_${fbUser.uid.slice(0, 12)}`;
  const agencyRef = doc(db, "agencies", agencyId);

  await setDoc(agencyRef, {
    name: fbUser.displayName ? `${fbUser.displayName}의 사무실` : "내 사무실",
    owner: fbUser.uid,
    members: [fbUser.uid],
    createdAt: serverTimestamp(),
  });

  await setDoc(userRef, {
    email: fbUser.email,
    displayName: fbUser.displayName,
    photoURL: fbUser.photoURL,
    agencyId,
    createdAt: serverTimestamp(),
    lastLoginAt: serverTimestamp(),
    loginCount: 1,
    loginDays: { [kstDateStr()]: 1 },
  });

  return {
    uid: fbUser.uid,
    email: fbUser.email,
    displayName: fbUser.displayName,
    photoURL: fbUser.photoURL,
    agencyId,
    role: "owner",   // 사무실 개설자 = 대표
  };
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AppUser | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (fbUser) => {
      try {
        if (fbUser) {
          const appUser = await ensureUserAndAgency(fbUser);
          setUser(appUser);
        } else {
          setUser(null);
        }
      } catch (e) {
        console.error("Auth 상태 처리 실패:", e);
        setUser(null);
      } finally {
        setLoading(false);
      }
    });
    return () => unsub();
  }, []);

  const signInGoogle = async () => {
    const provider = new GoogleAuthProvider();
    await signInWithPopup(auth, provider);
  };

  const signInEmail = async (email: string, password: string) => {
    await signInWithEmailAndPassword(auth, email, password);
  };

  const signUpEmail = async (email: string, password: string, displayName: string) => {
    const cred = await createUserWithEmailAndPassword(auth, email, password);
    // displayName 저장 (Firestore 사용자 문서에서 처리됨)
    if (cred.user && displayName) {
      const userRef = doc(db, "users", cred.user.uid);
      const snap = await getDoc(userRef);
      if (snap.exists()) {
        await setDoc(userRef, { displayName }, { merge: true });
      }
    }
  };

  const signOut = async () => {
    await fbSignOut(auth);
  };

  return (
    <AuthContext.Provider value={{ user, loading, signInGoogle, signInEmail, signUpEmail, signOut }}>
      {children}
    </AuthContext.Provider>
  );
}
