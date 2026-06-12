"use client";

import { useState, useEffect, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { useAuth } from "@/lib/auth-context";

export default function LoginPage() {
  return (
    <Suspense fallback={<div className="min-h-screen flex items-center justify-center text-gray-400 text-sm">불러오는 중…</div>}>
      <LoginInner />
    </Suspense>
  );
}

/** 인앱 브라우저 감지 — Google이 OAuth 차단하는 환경 */
function detectInAppBrowser(): { isInApp: boolean; appName: string } {
  if (typeof window === "undefined") return { isInApp: false, appName: "" };
  const ua = window.navigator.userAgent.toLowerCase();
  const patterns: Array<{ key: string; name: string }> = [
    { key: "kakaotalk",   name: "카카오톡" },
    { key: "naver(",      name: "네이버" },
    { key: "naverapp",    name: "네이버" },
    { key: "inapp",       name: "네이버" },
    { key: "fb_iab",      name: "페이스북" },
    { key: "fbav",        name: "페이스북" },
    { key: "fban",        name: "페이스북" },
    { key: "instagram",   name: "인스타그램" },
    { key: "line/",       name: "라인" },
    { key: "band/",       name: "밴드" },
    { key: "kakaostory",  name: "카카오스토리" },
    { key: "daumapps",    name: "다음" },
    { key: "everytimeapp",name: "에브리타임" },
  ];
  for (const { key, name } of patterns) {
    if (ua.includes(key)) return { isInApp: true, appName: name };
  }
  return { isInApp: false, appName: "" };
}

function LoginInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const redirect = searchParams.get("redirect") || "/expiry";

  const { user, loading, signInGoogle, signInEmail, signUpEmail } = useAuth();
  const [mode, setMode] = useState<"login" | "signup">("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [inAppInfo, setInAppInfo] = useState<{ isInApp: boolean; appName: string }>({ isInApp: false, appName: "" });
  const [copied, setCopied] = useState(false);

  // 이미 로그인됐으면 리다이렉트
  useEffect(() => {
    if (!loading && user) router.replace(redirect);
  }, [loading, user, redirect, router]);

  // 인앱 브라우저 감지
  useEffect(() => {
    setInAppInfo(detectInAppBrowser());
  }, []);

  const copyUrl = async () => {
    try {
      await navigator.clipboard.writeText(window.location.href);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // fallback
      const el = document.createElement("textarea");
      el.value = window.location.href;
      document.body.appendChild(el);
      el.select();
      document.execCommand("copy");
      document.body.removeChild(el);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const openExternalBrowser = () => {
    const url = window.location.href;
    const ua = navigator.userAgent.toLowerCase();
    // 카카오톡: 외부 브라우저 열기 스킴 지원
    if (ua.includes("kakaotalk")) {
      window.location.href = `kakaotalk://web/openExternal?url=${encodeURIComponent(url)}`;
      return;
    }
    // Android Chrome intent
    if (/android/i.test(ua)) {
      window.location.href = `intent://${url.replace(/^https?:\/\//, "")}#Intent;scheme=https;package=com.android.chrome;end`;
      return;
    }
    // iOS Safari: 직접 열기 안 됨 → 클립보드 복사 + 안내
    copyUrl();
    alert("URL이 복사되었습니다.\n\nSafari를 열고 주소창에 붙여넣기(꾹 누르기 → 붙여넣기) 해주세요.");
  };

  const handleGoogle = async () => {
    setErr(null);
    setBusy(true);
    try {
      await signInGoogle();
    } catch (e) {
      setErr(humanError(e));
    } finally {
      setBusy(false);
    }
  };

  const handleEmail = async () => {
    setErr(null);
    if (!email || !password) {
      setErr("이메일과 비밀번호를 입력해주세요");
      return;
    }
    if (mode === "signup" && !displayName.trim()) {
      setErr("표시할 이름을 입력해주세요");
      return;
    }
    setBusy(true);
    try {
      if (mode === "signup") {
        await signUpEmail(email, password, displayName);
      } else {
        await signInEmail(email, password);
      }
    } catch (e) {
      setErr(humanError(e));
    } finally {
      setBusy(false);
    }
  };

  if (loading) {
    return <div className="min-h-screen flex items-center justify-center text-gray-400 text-sm">불러오는 중…</div>;
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-blue-50 flex items-center justify-center px-4 py-10">
      <div className="w-full max-w-sm">
        <div className="text-center mb-6">
          <div className="inline-flex items-center gap-2 bg-blue-600 text-white px-4 py-1.5 rounded-full text-sm font-medium mb-3">
            🏠 DealDone — 부동산 매물 도우미
          </div>
          <h1 className="text-xl font-bold text-gray-900 mb-1">
            {mode === "login" ? "로그인" : "회원가입"}
          </h1>
          <p className="text-gray-500 text-xs">
            여러 기기에서 매물장을 동기화합니다
          </p>
        </div>

        {/* 인앱 브라우저 경고 배너 */}
        {inAppInfo.isInApp && (
          <div className="bg-amber-50 border-2 border-amber-300 rounded-2xl p-4 mb-4">
            <div className="flex items-start gap-2 mb-2">
              <span className="text-xl">⚠️</span>
              <div className="flex-1">
                <div className="text-sm font-bold text-amber-800">{inAppInfo.appName} 앱 안에서는 Google 로그인이 차단됩니다</div>
                <div className="text-[11px] text-amber-700 mt-1 leading-relaxed">
                  Google 보안 정책 (403 disallowed_useragent)으로 카카오톡·네이버·인스타 등 앱 내부 브라우저에서는 Google 로그인이 막혀 있습니다.<br/>
                  <strong>Safari/Chrome 등 일반 브라우저</strong>에서 열어주세요.
                </div>
              </div>
            </div>
            <div className="flex flex-col gap-1.5 mt-3">
              <button
                onClick={openExternalBrowser}
                className="w-full py-2.5 rounded-xl bg-amber-600 text-white text-sm font-semibold hover:bg-amber-700"
              >
                🌐 외부 브라우저로 열기
              </button>
              <button
                onClick={copyUrl}
                className="w-full py-2 rounded-xl border-2 border-amber-400 bg-white text-amber-700 text-xs font-medium hover:bg-amber-50"
              >
                {copied ? "✅ URL 복사됨" : "📋 URL 복사 (Safari 주소창에 붙여넣기)"}
              </button>
            </div>
            <p className="text-[10px] text-amber-600 mt-2 text-center leading-snug">
              💡 아래 이메일 로그인은 인앱에서도 동작합니다
            </p>
          </div>
        )}

        <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-5 space-y-3">
          {/* 구글 로그인 */}
          <button
            onClick={handleGoogle}
            disabled={busy || inAppInfo.isInApp}
            title={inAppInfo.isInApp ? `${inAppInfo.appName} 인앱 브라우저에서는 사용 불가 — 외부 브라우저로 열어주세요` : undefined}
            className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl border-2 border-gray-200 text-sm font-medium text-gray-700 hover:border-blue-400 hover:bg-blue-50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          >
            <GoogleIcon /> Google로 계속하기 {inAppInfo.isInApp && <span className="text-[10px] text-red-500">(인앱 차단)</span>}
          </button>

          {/* 카카오 (준비중) */}
          <button
            disabled
            title="카카오 로그인은 곧 지원됩니다"
            className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl border-2 border-gray-200 text-sm font-medium text-gray-400 cursor-not-allowed bg-gray-50"
          >
            💬 카카오로 계속하기 (준비중)
          </button>

          <div className="flex items-center gap-3 my-2">
            <div className="flex-1 h-px bg-gray-200" />
            <span className="text-[11px] text-gray-400">또는 이메일로</span>
            <div className="flex-1 h-px bg-gray-200" />
          </div>

          {mode === "signup" && (
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">표시 이름</label>
              <input
                type="text"
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                placeholder="예: 미사금빛 김OO"
                className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm bg-gray-50 focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
          )}

          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">이메일</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="example@email.com"
              autoComplete="email"
              className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm bg-gray-50 focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">비밀번호</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleEmail()}
              placeholder="6자 이상"
              autoComplete={mode === "signup" ? "new-password" : "current-password"}
              className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm bg-gray-50 focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          {err && (
            <div className="text-xs text-red-600 bg-red-50 border border-red-100 rounded-xl px-3 py-2">
              ⚠️ {err}
            </div>
          )}

          <button
            onClick={handleEmail}
            disabled={busy}
            className="w-full py-2.5 rounded-xl bg-blue-600 text-white text-sm font-semibold hover:bg-blue-700 disabled:opacity-50 transition-colors"
          >
            {busy ? "처리 중…" : mode === "login" ? "로그인" : "회원가입"}
          </button>

          <div className="text-center text-xs text-gray-500 pt-2">
            {mode === "login" ? "처음이세요? " : "이미 계정이 있으세요? "}
            <button
              onClick={() => { setMode(mode === "login" ? "signup" : "login"); setErr(null); }}
              className="text-blue-600 hover:underline font-medium"
            >
              {mode === "login" ? "회원가입" : "로그인"}
            </button>
          </div>
        </div>

        <div className="text-center mt-4">
          <Link href="/" className="text-xs text-gray-500 hover:text-blue-600">
            ← DealDone으로 돌아가기
          </Link>
        </div>

        <p className="text-center text-[11px] text-gray-400 mt-6 leading-relaxed">
          개인정보는 Google Cloud 서울 데이터센터에 암호화 저장됩니다.
          <br />
          본인 사무실 데이터만 본인만 접근 가능합니다.
        </p>
      </div>
    </div>
  );
}

function GoogleIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" xmlns="http://www.w3.org/2000/svg">
      <path d="M17.64 9.2c0-.637-.057-1.251-.164-1.84H9v3.481h4.844a4.14 4.14 0 0 1-1.796 2.716v2.259h2.908c1.702-1.567 2.684-3.875 2.684-6.615z" fill="#4285F4"/>
      <path d="M9 18c2.43 0 4.467-.806 5.956-2.184l-2.908-2.259c-.806.54-1.837.86-3.048.86-2.344 0-4.328-1.584-5.036-3.711H.957v2.332A8.997 8.997 0 0 0 9 18z" fill="#34A853"/>
      <path d="M3.964 10.706A5.41 5.41 0 0 1 3.682 9c0-.593.102-1.17.282-1.706V4.962H.957A8.996 8.996 0 0 0 0 9c0 1.452.348 2.827.957 4.038l3.007-2.332z" fill="#FBBC05"/>
      <path d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0A8.997 8.997 0 0 0 .957 4.962L3.964 7.294C4.672 5.167 6.656 3.58 9 3.58z" fill="#EA4335"/>
    </svg>
  );
}

function humanError(e: unknown): string {
  const msg = e instanceof Error ? e.message : String(e);
  if (msg.includes("auth/invalid-credential") || msg.includes("auth/wrong-password") || msg.includes("auth/user-not-found"))
    return "이메일 또는 비밀번호가 올바르지 않습니다";
  if (msg.includes("auth/email-already-in-use"))
    return "이미 가입된 이메일입니다. 로그인해주세요";
  if (msg.includes("auth/weak-password"))
    return "비밀번호는 6자 이상이어야 합니다";
  if (msg.includes("auth/invalid-email"))
    return "이메일 형식이 올바르지 않습니다";
  if (msg.includes("auth/popup-closed-by-user"))
    return "로그인이 취소되었습니다";
  if (msg.includes("auth/network-request-failed"))
    return "네트워크 오류 — 인터넷 연결을 확인해주세요";
  return msg;
}
