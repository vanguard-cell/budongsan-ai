"use client";

/**
 * 알림 종 — 헤더에 표시되는 작은 컨트롤
 *
 * - 클릭하면 알림 설정 모달
 * - 권한 상태 + 켜짐/꺼짐 표시
 * - 페이지 진입 시 자동 알림 발송 (조건 충족 시)
 */

import { useEffect, useState } from "react";
import {
  loadSettings,
  saveSettings,
  getPermissionState,
  requestPermission,
  sendTestNotification,
  sendDailyDigest,
  type NotifySettings,
  type PermissionState,
} from "@/lib/notifications";
import type { Contract } from "./expiry/contracts";
import type { Customer } from "./customers/customer-types";

interface Props {
  contracts: Contract[];
  customers: Customer[];
}

export default function NotifyBell({ contracts, customers }: Props) {
  const [open, setOpen] = useState(false);
  const [perm, setPerm] = useState<PermissionState>("default");
  const [settings, setSettings] = useState<NotifySettings>(loadSettings());

  // 권한 상태 초기 로드
  useEffect(() => {
    setPerm(getPermissionState());
  }, []);

  // 페이지 진입 시 자동 알림 — 조건 충족 시 하루 1번만
  useEffect(() => {
    if (contracts.length === 0 && customers.length === 0) return;
    const id = setTimeout(() => {
      sendDailyDigest(contracts, customers).then(r => {
        if (r.sent) console.log("[알림] 일일 요약 발송됨");
      });
    }, 1500);
    return () => clearTimeout(id);
  }, [contracts, customers]);

  const enable = async () => {
    const p = await requestPermission();
    setPerm(p);
    if (p === "granted") {
      const next = { ...settings, enabled: true };
      setSettings(next);
      saveSettings(next);
      sendTestNotification();
    }
  };

  const toggleField = (field: keyof NotifySettings, value: boolean | number) => {
    const next = { ...settings, [field]: value };
    setSettings(next);
    saveSettings(next);
  };

  const sendNow = async () => {
    const r = await sendDailyDigest(contracts, customers, true);
    if (!r.sent && r.reason) alert(`알림 발송 실패: ${r.reason}`);
  };

  const active = perm === "granted" && settings.enabled;

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        title="알림 설정"
        className={`text-xs px-2.5 py-1 rounded-full border transition-colors ${
          active
            ? "border-green-300 bg-green-50 text-green-700"
            : "border-gray-300 text-gray-500 hover:border-blue-400 hover:text-blue-600"
        }`}
      >
        {active ? "🔔 알림 ON" : "🔕 알림"}
      </button>

      {open && (
        <Modal onClose={() => setOpen(false)} title="알림 설정">
          <div className="space-y-3">
            {perm === "unsupported" && (
              <ErrBox>
                이 브라우저는 알림을 지원하지 않습니다. (Safari 16.4+ 또는 Chrome / Edge 사용 권장)
              </ErrBox>
            )}

            {perm === "denied" && (
              <ErrBox>
                알림이 차단되어 있습니다. 브라우저 설정 → 사이트 권한 → 알림을 허용으로 변경해주세요.
              </ErrBox>
            )}

            {perm === "default" && (
              <div className="bg-blue-50 border border-blue-200 rounded-2xl p-4 text-center">
                <div className="text-2xl mb-2">🔔</div>
                <div className="text-sm font-semibold text-gray-900 mb-1">
                  알림을 켜시면 매일 자동으로 안내해드려요
                </div>
                <div className="text-[11px] text-gray-600 mb-3 leading-relaxed">
                  앱을 열 때 만기·후속 연락 필요 건수를 한 번에 보여줍니다.<br />
                  하루 1회만 알림 (반복 알림 X)
                </div>
                <button
                  onClick={enable}
                  className="px-4 py-2 rounded-full bg-blue-600 text-white text-sm font-semibold hover:bg-blue-700 transition-colors"
                >
                  알림 켜기
                </button>
              </div>
            )}

            {perm === "granted" && (
              <>
                <div className="bg-green-50 border border-green-200 rounded-2xl p-3 text-xs text-green-800">
                  ✅ 알림 권한 허용됨
                </div>

                <ToggleRow
                  label="알림 켜짐"
                  desc="전체 알림을 켜고 끕니다"
                  value={settings.enabled}
                  onChange={(v) => toggleField("enabled", v)}
                />

                <ToggleRow
                  label="매일 1회 통합 알림"
                  desc="앱 열 때 만기·후속 연락 요약 알림 (1일 1회)"
                  value={settings.dailyDigest}
                  onChange={(v) => toggleField("dailyDigest", v)}
                  disabled={!settings.enabled}
                />

                <ToggleRow
                  label="만기 임박 알림"
                  desc={`D-${settings.expiryThresholdDays} 이내 계약이 있을 때 알림`}
                  value={settings.expiryAlert}
                  onChange={(v) => toggleField("expiryAlert", v)}
                  disabled={!settings.enabled}
                />

                <ToggleRow
                  label="후속 연락 알림"
                  desc="오늘·내일 후속 연락 예정 손님 알림"
                  value={settings.followupAlert}
                  onChange={(v) => toggleField("followupAlert", v)}
                  disabled={!settings.enabled}
                />

                <div className="flex gap-2 pt-2">
                  <button
                    onClick={sendTestNotification}
                    className="flex-1 py-2.5 rounded-xl border border-gray-200 text-gray-600 text-sm hover:bg-gray-50 transition-colors"
                  >
                    테스트 알림
                  </button>
                  <button
                    onClick={sendNow}
                    className="flex-1 py-2.5 rounded-xl bg-blue-600 text-white text-sm font-semibold hover:bg-blue-700 transition-colors"
                  >
                    지금 한 번 보내기
                  </button>
                </div>

                <p className="text-[11px] text-gray-500 leading-relaxed pt-1">
                  💡 진짜 백그라운드 푸시(앱 안 켜도 알림)는 Phase 2에서 추가 예정입니다.
                  지금은 앱을 열 때 자동으로 알림이 갑니다.
                </p>
              </>
            )}
          </div>
        </Modal>
      )}
    </>
  );
}

function ToggleRow({
  label, desc, value, onChange, disabled,
}: {
  label: string;
  desc: string;
  value: boolean;
  onChange: (v: boolean) => void;
  disabled?: boolean;
}) {
  return (
    <label className={`flex items-start gap-3 p-3 rounded-xl border border-gray-200 ${disabled ? "opacity-50" : "cursor-pointer hover:bg-gray-50"}`}>
      <input
        type="checkbox"
        checked={value}
        disabled={disabled}
        onChange={(e) => onChange(e.target.checked)}
        className="w-4 h-4 mt-0.5 accent-blue-600"
      />
      <div className="flex-1">
        <div className="text-sm font-semibold text-gray-900">{label}</div>
        <div className="text-[11px] text-gray-500 mt-0.5">{desc}</div>
      </div>
    </label>
  );
}

function ErrBox({ children }: { children: React.ReactNode }) {
  return (
    <div className="text-xs text-red-600 bg-red-50 border border-red-100 rounded-xl px-3 py-2">
      ⚠️ {children}
    </div>
  );
}

function Modal({ children, onClose, title }: { children: React.ReactNode; onClose: () => void; title: string }) {
  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 bg-black/40 backdrop-blur-sm z-[60] flex items-end sm:items-center justify-center p-0 sm:p-4"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-t-3xl sm:rounded-3xl w-full sm:max-w-md max-h-[90vh] overflow-y-auto shadow-2xl"
        onClick={e => e.stopPropagation()}
      >
        <div className="sticky top-0 bg-white border-b border-gray-100 px-5 py-3 flex items-center justify-between rounded-t-3xl">
          <h2 className="text-base font-semibold text-gray-900">{title}</h2>
          <button
            onClick={onClose}
            className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-gray-100 text-gray-500 text-lg leading-none"
            aria-label="닫기"
          >
            ✕
          </button>
        </div>
        <div className="p-5">{children}</div>
      </div>
    </div>
  );
}
