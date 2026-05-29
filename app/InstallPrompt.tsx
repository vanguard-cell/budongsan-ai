"use client";

/**
 * 앱 설치 가이드 — 폰 기종 자동 감지
 *
 * - 안드로이드 크롬: 원클릭 설치 (beforeinstallprompt 이벤트)
 * - iOS Safari: 시각 가이드 모달 (애플이 자동 설치 차단함)
 * - 이미 설치된 경우: 자동 숨김
 * - 닫으면 7일간 다시 안 보임
 */

import { useEffect, useState } from "react";

type Platform = "ios-safari" | "ios-chrome" | "android" | "desktop" | "installed" | "unknown";

interface BIPEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

const DISMISS_KEY = "budongsan_install_dismissed";
const DISMISS_DAYS = 7;

function detectPlatform(): Platform {
  if (typeof window === "undefined") return "unknown";

  // 이미 PWA로 실행중
  const isStandalone =
    window.matchMedia("(display-mode: standalone)").matches ||
    (window.navigator as Navigator & { standalone?: boolean }).standalone === true;
  if (isStandalone) return "installed";

  const ua = window.navigator.userAgent;
  const isIOS = /iPhone|iPad|iPod/.test(ua);
  const isAndroid = /Android/.test(ua);
  const isSafari = /Safari/.test(ua) && !/Chrome|CriOS|FxiOS/.test(ua);
  const isIOSChrome = /CriOS/.test(ua);

  if (isIOS && isSafari) return "ios-safari";
  if (isIOS && isIOSChrome) return "ios-chrome";
  if (isAndroid) return "android";
  return "desktop";
}

function isDismissed(): boolean {
  if (typeof window === "undefined") return true;
  const ts = localStorage.getItem(DISMISS_KEY);
  if (!ts) return false;
  const dismissedAt = parseInt(ts, 10);
  const elapsedDays = (Date.now() - dismissedAt) / (1000 * 60 * 60 * 24);
  return elapsedDays < DISMISS_DAYS;
}

function setDismissed() {
  if (typeof window === "undefined") return;
  localStorage.setItem(DISMISS_KEY, Date.now().toString());
}

export default function InstallPrompt() {
  const [platform, setPlatform] = useState<Platform>("unknown");
  const [showBar, setShowBar] = useState(false);
  const [showModal, setShowModal] = useState(false);
  const [bip, setBip] = useState<BIPEvent | null>(null);

  useEffect(() => {
    const p = detectPlatform();
    setPlatform(p);

    // 이미 설치됐거나 7일 내 거부했으면 숨김
    if (p === "installed" || p === "unknown") return;
    if (isDismissed()) return;

    setShowBar(true);

    // 안드로이드: 설치 프롬프트 이벤트 캐치
    const handler = (e: Event) => {
      e.preventDefault();
      setBip(e as BIPEvent);
    };
    window.addEventListener("beforeinstallprompt", handler);
    return () => window.removeEventListener("beforeinstallprompt", handler);
  }, []);

  if (platform === "installed" || !showBar) return null;

  const handleAndroidInstall = async () => {
    if (!bip) {
      // 이벤트가 아직 안 떴으면 그냥 가이드 보여줌
      setShowModal(true);
      return;
    }
    await bip.prompt();
    const result = await bip.userChoice;
    if (result.outcome === "accepted") {
      setShowBar(false);
    }
  };

  const handleDismiss = () => {
    setDismissed();
    setShowBar(false);
  };

  return (
    <>
      {/* 상단 배너 */}
      <div className="mb-3 bg-gradient-to-r from-blue-50 to-indigo-50 border border-blue-200 rounded-2xl px-4 py-3 flex items-center gap-3">
        <div className="text-2xl flex-shrink-0">📲</div>
        <div className="flex-1 min-w-0">
          <div className="text-xs sm:text-sm font-semibold text-gray-900">
            앱처럼 설치하면 더 빠르게 쓰실 수 있어요
          </div>
          <div className="text-[10px] sm:text-[11px] text-gray-600">
            바탕화면에 아이콘 추가 · 전체 화면 · 알림 받기
          </div>
        </div>
        {platform === "android" ? (
          <button
            onClick={handleAndroidInstall}
            className="flex-shrink-0 text-xs sm:text-sm px-3 sm:px-4 py-2 rounded-full bg-blue-600 text-white font-semibold hover:bg-blue-700 transition-colors whitespace-nowrap"
          >
            설치하기
          </button>
        ) : (
          <button
            onClick={() => setShowModal(true)}
            className="flex-shrink-0 text-xs sm:text-sm px-3 sm:px-4 py-2 rounded-full bg-blue-600 text-white font-semibold hover:bg-blue-700 transition-colors whitespace-nowrap"
          >
            설치 방법
          </button>
        )}
        <button
          onClick={handleDismiss}
          className="flex-shrink-0 w-6 h-6 text-gray-400 hover:text-gray-600 text-lg leading-none"
          aria-label="닫기"
        >
          ✕
        </button>
      </div>

      {showModal && (
        <GuideModal platform={platform} onClose={() => setShowModal(false)} />
      )}
    </>
  );
}

/* ───────── 시각 가이드 모달 ───────── */
function GuideModal({ platform, onClose }: { platform: Platform; onClose: () => void }) {
  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50 flex items-end sm:items-center justify-center p-0 sm:p-4"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-t-3xl sm:rounded-3xl w-full sm:max-w-md max-h-[90vh] overflow-y-auto shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="sticky top-0 bg-white border-b border-gray-100 px-5 py-3 flex items-center justify-between rounded-t-3xl">
          <h2 className="text-base font-semibold text-gray-900">📲 폰에 앱처럼 설치하기</h2>
          <button
            onClick={onClose}
            className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-gray-100 text-gray-500 text-lg leading-none"
            aria-label="닫기"
          >
            ✕
          </button>
        </div>

        <div className="p-5">
          {platform === "ios-safari" && <IOSSafariGuide />}
          {platform === "ios-chrome" && <IOSChromeGuide />}
          {platform === "android" && <AndroidGuide />}
          {platform === "desktop" && <DesktopGuide />}

          <button
            onClick={onClose}
            className="w-full mt-4 py-2.5 rounded-xl border border-gray-200 text-gray-600 text-sm hover:bg-gray-50 transition-colors"
          >
            완료
          </button>
        </div>
      </div>
    </div>
  );
}

/* ───────── iOS Safari 가이드 ───────── */
function IOSSafariGuide() {
  return (
    <div className="space-y-4">
      <div className="bg-blue-50 border border-blue-100 rounded-2xl p-3 text-xs text-blue-900">
        💡 아이폰은 <b>Safari (사파리)</b>로만 설치 가능합니다.
        다른 브라우저면 먼저 Safari로 다시 열어주세요.
      </div>

      <Step
        num={1}
        title="화면 하단 가운데 공유 버튼"
        desc="가로 화면이면 우측 상단에 있을 수 있어요"
        visual={<ShareIconBox />}
      />

      <Step
        num={2}
        title='"홈 화면에 추가" 찾기'
        desc="메뉴를 위로 스크롤하면 보입니다"
        visual={<AddHomeBox />}
      />

      <Step
        num={3}
        title='우측 상단 "추가" 버튼'
        desc="이름은 그대로 두고 추가만 누르세요"
        visual={
          <div className="bg-blue-100 text-blue-700 px-4 py-2 rounded-lg text-sm font-bold inline-block">
            추가
          </div>
        }
      />

      <div className="bg-green-50 border border-green-100 rounded-2xl p-3 text-xs text-green-800">
        ✅ 끝! 홈 화면에 🏠 아이콘이 생기면 성공입니다.
        앞으로는 그 아이콘 한 번 누르면 바로 열려요.
      </div>
    </div>
  );
}

function IOSChromeGuide() {
  return (
    <div className="space-y-3">
      <div className="bg-orange-50 border border-orange-200 rounded-2xl p-3 text-xs text-orange-900">
        ⚠️ 아이폰 크롬은 PWA 설치를 지원하지 않습니다.<br />
        Safari로 다시 열어서 설치해주세요.
      </div>

      <Step
        num={1}
        title="주소창 길게 눌러서 주소 복사"
        desc=""
        visual={<div className="bg-gray-100 text-gray-700 px-3 py-1.5 rounded-lg text-xs font-mono">budongsan-ai.vercel.app</div>}
      />

      <Step
        num={2}
        title="Safari 앱 열기"
        desc="홈 화면에 있는 나침반 모양 아이콘"
        visual={<div className="text-3xl">🧭</div>}
      />

      <Step
        num={3}
        title="주소 붙여넣기 후 위 안내대로 설치"
        desc=""
        visual={null}
      />
    </div>
  );
}

function AndroidGuide() {
  return (
    <div className="space-y-4">
      <div className="bg-green-50 border border-green-100 rounded-2xl p-3 text-xs text-green-900">
        ✅ 안드로이드는 보통 자동으로 설치 버튼이 떴을 거예요.
        안 떴으면 아래 방법으로 수동 설치하시면 됩니다.
      </div>

      <Step
        num={1}
        title='우상단 점 3개 메뉴 ⋮'
        desc="크롬 주소창 오른쪽 끝"
        visual={<div className="text-2xl tracking-tight">⋮</div>}
      />

      <Step
        num={2}
        title='"앱 설치" 또는 "홈 화면에 추가"'
        desc="메뉴에서 찾기"
        visual={<div className="bg-blue-100 text-blue-700 px-3 py-1.5 rounded-lg text-xs font-bold">앱 설치</div>}
      />

      <Step
        num={3}
        title='"설치" 확인 버튼'
        desc=""
        visual={
          <div className="bg-blue-600 text-white px-4 py-2 rounded-lg text-sm font-bold inline-block">
            설치
          </div>
        }
      />

      <div className="bg-green-50 border border-green-100 rounded-2xl p-3 text-xs text-green-800">
        ✅ 끝! 홈 화면에 아이콘 생기면 성공.
      </div>
    </div>
  );
}

function DesktopGuide() {
  return (
    <div className="space-y-4">
      <div className="bg-blue-50 border border-blue-100 rounded-2xl p-3 text-xs text-blue-900">
        💡 PC도 앱처럼 설치할 수 있어요. 크롬·엣지 추천.
      </div>

      <Step
        num={1}
        title="주소창 우측 끝 ⬇ 또는 ⊕ 아이콘"
        desc="설치 가능한 사이트에만 보임"
        visual={<div className="text-2xl">⬇</div>}
      />

      <Step
        num={2}
        title='"설치" 클릭'
        desc=""
        visual={
          <div className="bg-blue-600 text-white px-4 py-2 rounded-lg text-sm font-bold inline-block">
            설치
          </div>
        }
      />

      <Step
        num={3}
        title="바탕화면 / 작업 표시줄에 추가됨"
        desc="이제 앱처럼 실행 가능"
        visual={<div className="text-2xl">🏠</div>}
      />
    </div>
  );
}

/* ───────── 시각 컴포넌트 ───────── */
function Step({ num, title, desc, visual }: { num: number; title: string; desc: string; visual: React.ReactNode }) {
  return (
    <div className="flex items-start gap-3 p-3 rounded-2xl border border-gray-200 bg-gray-50/50">
      <div className="flex-shrink-0 w-7 h-7 rounded-full bg-blue-600 text-white text-sm font-bold flex items-center justify-center">
        {num}
      </div>
      <div className="flex-1 min-w-0">
        <div className="text-sm font-semibold text-gray-900">{title}</div>
        {desc && <div className="text-[11px] text-gray-500 mt-0.5">{desc}</div>}
      </div>
      {visual && (
        <div className="flex-shrink-0 flex items-center justify-center min-w-[44px]">
          {visual}
        </div>
      )}
    </div>
  );
}

/* iOS Safari 공유 아이콘 (실제 모양) */
function ShareIconBox() {
  return (
    <div className="w-12 h-12 bg-gradient-to-b from-gray-100 to-gray-200 rounded-xl border border-gray-300 flex items-center justify-center shadow-sm">
      <svg width="24" height="28" viewBox="0 0 24 28" fill="none">
        <path d="M12 1 L12 18 M5 8 L12 1 L19 8" stroke="#007AFF" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
        <path d="M3 12 L3 25 Q3 27 5 27 L19 27 Q21 27 21 25 L21 12" stroke="#007AFF" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" fill="none" />
      </svg>
    </div>
  );
}

/* "홈 화면에 추가" 메뉴 항목 시각화 */
function AddHomeBox() {
  return (
    <div className="bg-white border border-gray-300 rounded-xl px-3 py-2 flex items-center gap-2 shadow-sm">
      <div className="w-7 h-7 rounded-md border-2 border-gray-400 flex items-center justify-center">
        <span className="text-xs leading-none">＋</span>
      </div>
      <span className="text-[10px] font-semibold text-gray-800">홈 화면에 추가</span>
    </div>
  );
}
