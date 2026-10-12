"use client";
import { useEffect } from "react";
import { useAuth } from "@/lib/auth-context";

/**
 * 직원(파트너) = 보기 전용
 * - <body data-readonly> 를 켜서 data-owner-only 버튼(등록·업로드·전체 삭제 등)을 숨김 (globals.css)
 * - 그래도 저장을 시도해 보안 규칙에 막히면(permission-denied) 쉬운 말로 안내
 */
export default function ReadOnlyGuard() {
  const { user } = useAuth();
  const readOnly = user?.role === "partner";

  useEffect(() => {
    if (!readOnly) return;
    document.body.dataset.readonly = "1";
    let last = 0;
    const onReject = (e: PromiseRejectionEvent) => {
      const code = (e.reason as { code?: string } | undefined)?.code;
      if (code !== "permission-denied") return;
      e.preventDefault();
      if (Date.now() - last < 3000) return;
      last = Date.now();
      alert("직원 계정은 보기만 할 수 있어요.\n등록·수정·삭제는 대표님만 할 수 있어요.");
    };
    window.addEventListener("unhandledrejection", onReject);
    return () => {
      delete document.body.dataset.readonly;
      window.removeEventListener("unhandledrejection", onReject);
    };
  }, [readOnly]);

  if (!readOnly) return null;
  return (
    <div className="fixed top-0 inset-x-0 z-[70] pointer-events-none flex justify-center">
      <span className="mt-1 px-3 py-1 rounded-full bg-amber-100 text-amber-800 text-xs font-semibold shadow whitespace-nowrap">
        👀 보기 전용 (직원) — 등록·수정은 대표님만
      </span>
    </div>
  );
}
