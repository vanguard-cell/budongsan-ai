"use client";
import { useEffect } from "react";
import { useAuth } from "@/lib/auth-context";

/**
 * 직원(파트너) 권한 — 스케줄은 자유롭게, 매물·매수자·실거래는 등록·수정까지, 삭제·만기 계약·사무실 설정은 대표만
 * (실제 제한은 firestore.rules, 여기는 화면 안내)
 * - <body data-readonly> 를 켜서 data-owner-only 버튼(엑셀 업로드·전체 삭제·되살리기 등)을 숨김 (globals.css)
 * - 그래도 막힌 작업을 시도해 보안 규칙에 걸리면(permission-denied) 쉬운 말로 안내
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
      alert("직원 계정은 이 작업을 할 수 없어요.\n삭제·만기 계약 수정·전체 작업은 대표님만 할 수 있어요.");
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
        👤 직원 — 삭제·만기 계약은 대표님만
      </span>
    </div>
  );
}
