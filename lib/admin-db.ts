/**
 * 관리자 전용 — 전체 유저 사용 현황 집계
 *
 * 경로: /users/{uid}, /agencies/{agencyId}/{properties,contracts,customers,schedules}
 *
 * - 전역 관리자(ADMIN_EMAIL)만 접근 (Firestore 규칙으로 강제)
 * - 유료 전환 검토용 사용량 데이터 수집
 */

import {
  collection, getDocs, getCountFromServer, Timestamp,
} from "firebase/firestore";
import { db } from "./firebase";
import { kstDateStr } from "./kst";

export const ADMIN_EMAIL = "vpfldh87@gmail.com";

export interface UserUsage {
  uid: string;
  email: string;
  displayName: string;
  agencyId: string;
  createdAt: number;       // 가입일
  lastLoginAt: number;     // 마지막 접속 (0이면 기록 없음)
  loginCount: number;      // 누적 접속 횟수
  // 접속일(서로 다른 날짜) — 오늘/이번주/이번달/전체
  loginDaysToday: number;  // 오늘 접속(1=했음)
  loginDaysWeek: number;   // 최근 7일 접속일 수
  loginDaysMonth: number;  // 최근 30일 접속일 수
  loginDaysTotal: number;  // 전체 접속일 수
  // 데이터량
  properties: number;
  contracts: number;
  customers: number;
  schedules: number;
  total: number;           // 데이터 총합
  pageViews: Record<string, number>;  // 메뉴별 방문 횟수 (단순화 근거)
}

function toMillis(v: unknown): number {
  if (v instanceof Timestamp) return v.toMillis();
  if (typeof v === "number") return v;
  return 0;
}

/** loginDays 맵({"YYYY-MM-DD": 횟수}) → 오늘/주/월/전체 접속일 수 */
function countLoginDays(map: unknown): { today: number; week: number; month: number; total: number } {
  if (!map || typeof map !== "object") return { today: 0, week: 0, month: 0, total: 0 };
  const days = Object.keys(map as Record<string, unknown>).filter(k => /^\d{4}-\d{2}-\d{2}$/.test(k));
  const todayStr = kstDateStr();
  const ms = (d: string) => new Date(d + "T00:00:00").getTime();
  const now = Date.now();
  const DAY = 24 * 60 * 60 * 1000;
  return {
    today: days.includes(todayStr) ? 1 : 0,
    week:  days.filter(d => now - ms(d) < 7 * DAY).length,
    month: days.filter(d => now - ms(d) < 30 * DAY).length,
    total: days.length,
  };
}

/** 특정 컬렉션의 문서 개수 (서버 집계 — 효율적) */
async function countCol(agencyId: string, sub: string): Promise<number> {
  try {
    const snap = await getCountFromServer(collection(db, "agencies", agencyId, sub));
    return snap.data().count;
  } catch {
    return 0;
  }
}

/**
 * 전체 유저 + 사용량 집계
 * - users 컬렉션 전체 조회 후, 각 유저의 agency 데이터량 카운트
 */
export async function fetchAllUsersUsage(): Promise<UserUsage[]> {
  const usersSnap = await getDocs(collection(db, "users"));

  const results = await Promise.all(
    usersSnap.docs.map(async (d) => {
      const data = d.data() as Record<string, unknown>;
      const agencyId = (data.agencyId as string) || "";

      const [properties, contracts, customers, schedules] = agencyId
        ? await Promise.all([
            countCol(agencyId, "properties"),
            countCol(agencyId, "contracts"),
            countCol(agencyId, "customers"),
            countCol(agencyId, "schedules"),
          ])
        : [0, 0, 0, 0];

      const ld = countLoginDays(data.loginDays);
      return {
        uid: d.id,
        email: (data.email as string) || "",
        displayName: (data.displayName as string) || "",
        agencyId,
        createdAt: toMillis(data.createdAt),
        lastLoginAt: toMillis(data.lastLoginAt),
        loginCount: (data.loginCount as number) || 0,
        loginDaysToday: ld.today,
        loginDaysWeek: ld.week,
        loginDaysMonth: ld.month,
        loginDaysTotal: ld.total,
        properties, contracts, customers, schedules,
        total: properties + contracts + customers + schedules,
        pageViews: (data.pageViews && typeof data.pageViews === "object" ? data.pageViews : {}) as Record<string, number>,
      } as UserUsage;
    }),
  );

  // 최근 접속순 정렬
  return results.sort((a, b) => b.lastLoginAt - a.lastLoginAt);
}

/** 요약 통계 */
export interface UsageSummary {
  totalUsers: number;
  activeWeek: number;   // 최근 7일 접속
  activeMonth: number;  // 최근 30일 접속
  newWeek: number;      // 최근 7일 가입
}

export function summarize(users: UserUsage[]): UsageSummary {
  const now = Date.now();
  const day = 24 * 60 * 60 * 1000;
  return {
    totalUsers: users.length,
    activeWeek:  users.filter(u => u.lastLoginAt && now - u.lastLoginAt <= 7 * day).length,
    activeMonth: users.filter(u => u.lastLoginAt && now - u.lastLoginAt <= 30 * day).length,
    newWeek:     users.filter(u => u.createdAt && now - u.createdAt <= 7 * day).length,
  };
}
