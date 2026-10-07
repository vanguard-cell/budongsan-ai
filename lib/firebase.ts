/**
 * Firebase 클라이언트 초기화
 *
 * - 웹 SDK 키는 공개돼도 안전합니다. 보안은 Firestore Security Rules로 강제.
 * - 모든 데이터는 한국 서울 리전(asia-northeast3)에 저장.
 */

import { initializeApp, getApps, type FirebaseApp } from "firebase/app";
import { getAuth, type Auth } from "firebase/auth";
import {
  getFirestore,
  initializeFirestore,
  persistentLocalCache,
  persistentMultipleTabManager,
  type Firestore,
} from "firebase/firestore";

const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
  measurementId: process.env.NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID,
};

// HMR / Next.js 중복 초기화 방지
const app: FirebaseApp = getApps().length === 0 ? initializeApp(firebaseConfig) : getApps()[0];

export const auth: Auth = getAuth(app);

// 읽은 데이터를 기기(IndexedDB)에 저장 — 화면을 옮기거나 다시 접속해도 서버에서 전체를 다시 읽지 않아 읽기 횟수 절약.
// 서버(SSR)에서는 IndexedDB가 없으므로 브라우저에서만 켬. 실패하면 기본 설정으로 동작.
function createDb(): Firestore {
  if (typeof window === "undefined") return getFirestore(app);
  try {
    return initializeFirestore(app, {
      localCache: persistentLocalCache({ tabManager: persistentMultipleTabManager() }),
    });
  } catch {
    // HMR 등으로 이미 초기화된 경우
    return getFirestore(app);
  }
}
export const db: Firestore = createDb();
export default app;
