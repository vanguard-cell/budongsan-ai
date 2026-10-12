"use client";
import { useState } from "react";
import { useAuth } from "@/lib/auth-context";
import { saveOfficeName } from "@/lib/office";

/** 더보기 — 사무소 이름 (문자 인사말·인쇄물·사이드바에 표시) */
export default function OfficeNameCard() {
  const { user } = useAuth();
  const [name, setName] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  if (!user) return null;
  const value = name ?? user.officeName ?? "";
  const changed = value.trim() !== (user.officeName ?? "");

  const save = async () => {
    setSaving(true);
    try {
      await saveOfficeName(user.agencyId, value);
      window.location.reload();   // 로그인 정보(사무소 이름)를 다시 불러옴
    } catch (e) {
      console.error("[office] 저장 실패:", e);
      alert("저장하지 못했어요. 잠시 후 다시 해주세요.");
      setSaving(false);
    }
  };

  return (
    <div className="rounded-2xl border border-gray-200 bg-white p-4">
      <div className="flex items-center gap-3">
        <span className="text-3xl">🏢</span>
        <div className="min-w-0">
          <div className="text-sm font-semibold text-gray-900">사무소 이름</div>
          <div className="text-xs text-gray-500 mt-0.5">문자 인사말·인쇄물·메뉴에 나와요</div>
        </div>
      </div>
      <div className="flex gap-2 mt-3">
        <input value={value} onChange={e => setName(e.target.value)} placeholder="예: 행복공인중개사"
          className="flex-1 min-w-0 border border-gray-200 rounded-xl px-3 py-2.5 text-sm bg-gray-50 focus:outline-none focus:ring-2 focus:ring-blue-500" />
        <button onClick={save} disabled={!changed || saving}
          className="px-4 py-2.5 rounded-xl bg-blue-600 text-white text-sm font-semibold whitespace-nowrap disabled:opacity-40">
          {saving ? "저장 중…" : "저장"}
        </button>
      </div>
    </div>
  );
}
