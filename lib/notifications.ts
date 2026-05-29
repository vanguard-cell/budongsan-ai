/**
 * 브라우저 알림 시스템
 *
 * 1차 구현: 앱 진입 시 알림 (가장 신뢰성 높음)
 *   - 어머니가 폰을 켰을 때 자동으로 그날의 만기·후속 알림 받음
 *   - PC에서 앱 열어두면 매일 한 번 알림 받음
 *
 * 백그라운드 푸시(앱 안 켜도 알림)는 Phase 2:
 *   - Firebase Cloud Messaging 필요 (서버 + 사용자별 디바이스 토큰)
 *   - iOS 16.4+ 만 지원
 */

import type { Contract } from "@/app/expiry/contracts";
import { dDay, severityOf } from "@/app/expiry/contracts";
import type { Customer } from "@/app/customers/customer-types";
import { followUpDDay, followUpSeverity } from "@/app/customers/customer-types";

const NOTIFY_SETTINGS_KEY = "budongsan_notify_settings";
const NOTIFY_LAST_SENT_KEY = "budongsan_notify_last_sent";

export interface NotifySettings {
  enabled: boolean;
  expiryAlert: boolean;       // 만기 임박 알림
  expiryThresholdDays: number; // 며칠 이내 알리기 (기본 30)
  followupAlert: boolean;      // 후속 연락 알림
  dailyDigest: boolean;        // 매일 1회 통합 알림
}

export const DEFAULT_SETTINGS: NotifySettings = {
  enabled: false,
  expiryAlert: true,
  expiryThresholdDays: 30,
  followupAlert: true,
  dailyDigest: true,
};

export function loadSettings(): NotifySettings {
  if (typeof window === "undefined") return DEFAULT_SETTINGS;
  try {
    const raw = localStorage.getItem(NOTIFY_SETTINGS_KEY);
    if (!raw) return DEFAULT_SETTINGS;
    return { ...DEFAULT_SETTINGS, ...JSON.parse(raw) };
  } catch {
    return DEFAULT_SETTINGS;
  }
}

export function saveSettings(s: NotifySettings) {
  if (typeof window === "undefined") return;
  localStorage.setItem(NOTIFY_SETTINGS_KEY, JSON.stringify(s));
}

/** 알림 권한 상태 */
export type PermissionState = "granted" | "denied" | "default" | "unsupported";

export function getPermissionState(): PermissionState {
  if (typeof window === "undefined") return "unsupported";
  if (!("Notification" in window)) return "unsupported";
  return Notification.permission as PermissionState;
}

/** 권한 요청 */
export async function requestPermission(): Promise<PermissionState> {
  if (typeof window === "undefined") return "unsupported";
  if (!("Notification" in window)) return "unsupported";
  if (Notification.permission === "granted") return "granted";
  if (Notification.permission === "denied") return "denied";

  const result = await Notification.requestPermission();
  return result as PermissionState;
}

/** 오늘 이미 알림을 보냈는지 (하루 1회 정책) */
function alreadySentToday(): boolean {
  if (typeof window === "undefined") return true;
  const lastSent = localStorage.getItem(NOTIFY_LAST_SENT_KEY);
  if (!lastSent) return false;
  const today = new Date().toISOString().slice(0, 10);
  return lastSent === today;
}

function markSent() {
  if (typeof window === "undefined") return;
  const today = new Date().toISOString().slice(0, 10);
  localStorage.setItem(NOTIFY_LAST_SENT_KEY, today);
}

/** 일일 통합 알림 발송 — 앱 진입 시 자동 호출 */
export async function sendDailyDigest(
  contracts: Contract[],
  customers: Customer[],
  force = false,
): Promise<{ sent: boolean; reason?: string }> {
  if (typeof window === "undefined") return { sent: false, reason: "SSR" };

  const settings = loadSettings();
  if (!settings.enabled) return { sent: false, reason: "알림 꺼짐" };
  if (!settings.dailyDigest && !force) return { sent: false, reason: "일일 알림 꺼짐" };

  const perm = getPermissionState();
  if (perm !== "granted") return { sent: false, reason: `권한 ${perm}` };

  if (!force && alreadySentToday()) return { sent: false, reason: "오늘 이미 보냄" };

  // 알림 대상 계산
  const expiryUrgent = settings.expiryAlert
    ? contracts.filter(c => c.status === "active" && severityOf(dDay(c.endDate)) === "danger").length
    : 0;
  const expiryWarning = settings.expiryAlert
    ? contracts.filter(c => c.status === "active" && severityOf(dDay(c.endDate)) === "warning").length
    : 0;
  const followupToday = settings.followupAlert
    ? customers.filter(c => {
        if (c.status !== "active") return false;
        const s = followUpSeverity(followUpDDay(c.nextFollowUp));
        return s === "overdue" || s === "today";
      }).length
    : 0;
  const followupSoon = settings.followupAlert
    ? customers.filter(c => c.status === "active" && followUpSeverity(followUpDDay(c.nextFollowUp)) === "soon").length
    : 0;

  if (expiryUrgent === 0 && expiryWarning === 0 && followupToday === 0 && followupSoon === 0) {
    markSent();
    return { sent: false, reason: "알릴 내용 없음" };
  }

  // 메시지 조립
  const lines: string[] = [];
  if (expiryUrgent > 0) lines.push(`🔴 만기 D-30 이내 ${expiryUrgent}건`);
  if (expiryWarning > 0) lines.push(`🟠 만기 D-60 이내 ${expiryWarning}건`);
  if (followupToday > 0) lines.push(`🔔 오늘 후속 연락 ${followupToday}명`);
  if (followupSoon > 0) lines.push(`📅 D-3 이내 후속 ${followupSoon}명`);

  const title = "📋 오늘의 업무 알림";
  const body = lines.join("\n");

  try {
    const notif = new Notification(title, {
      body,
      icon: "/icon-192.png",
      badge: "/icon-192.png",
      tag: "daily-digest",
      requireInteraction: false,
    });

    notif.onclick = () => {
      window.focus();
      // 가장 긴급한 곳으로 이동
      if (expiryUrgent > 0) window.location.href = "/expiry";
      else if (followupToday > 0) window.location.href = "/customers";
      notif.close();
    };

    markSent();
    return { sent: true };
  } catch (e) {
    return { sent: false, reason: e instanceof Error ? e.message : "알림 발송 실패" };
  }
}

/** 알림 권한 + 설정을 묶어서 보여주는 상태 */
export interface NotifyStatus {
  permission: PermissionState;
  settings: NotifySettings;
  canSend: boolean;
}

export function getStatus(): NotifyStatus {
  const permission = getPermissionState();
  const settings = loadSettings();
  return {
    permission,
    settings,
    canSend: permission === "granted" && settings.enabled,
  };
}

/** 테스트 알림 (사용자가 켤 때 확인용) */
export function sendTestNotification(): boolean {
  if (typeof window === "undefined") return false;
  if (getPermissionState() !== "granted") return false;
  try {
    new Notification("✅ 알림 테스트 성공", {
      body: "이제 만기·후속 연락 자동 알림을 받으실 수 있어요",
      icon: "/icon-192.png",
      tag: "test",
    });
    return true;
  } catch {
    return false;
  }
}
