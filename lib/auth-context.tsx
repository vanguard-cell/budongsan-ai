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
import { doc, getDoc, setDoc, serverTimestamp } from "firebase/firestore";
import { auth, db } from "./firebase";

export interface AppUser {
  uid: string;
  email: string | null;
  displayName: string | null;
  photoURL: string | null;
  agencyId: string;
}

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
 * 사용자 문서 + 사무실(agency) 자동 생성 또는 조회
 * 같은 사용자가 다른 로그인 방식으로 들어와도 같은 agency를 사용 (이메일 기준)
 */
async function ensureUserAndAgency(fbUser: User): Promise<AppUser> {
  const userRef = doc(db, "users", fbUser.uid);
  const userSnap = await getDoc(userRef);

  if (userSnap.exists()) {
    const data = userSnap.data();
    return {
      uid: fbUser.uid,
      email: fbUser.email,
      displayName: fbUser.displayName || data.displayName || null,
      photoURL: fbUser.photoURL,
      agencyId: data.agencyId,
    };
  }

  // 새 사용자 → 새 사무실 생성
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
  });

  return {
    uid: fbUser.uid,
    email: fbUser.email,
    displayName: fbUser.displayName,
    photoURL: fbUser.photoURL,
    agencyId,
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
