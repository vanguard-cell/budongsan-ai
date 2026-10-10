"use client";

/** 메모 추가 입력칸 (건의 #100) — 날짜 자동 메모로 적고 저장하면 기존 메모 아래에 이어 붙임 */

import { useState } from "react";
import DatedMemo from "./DatedMemo";

export default function QuickMemoBox({ onAdd, onCancel }: { onAdd: (text: string) => Promise<void>; onCancel: () => void }) {
  const [draft, setDraft] = useState("");
  const [saving, setSaving] = useState(false);
  const save = async () => {
    const t = draft.split("\n").map(l => l.trimEnd()).filter(l => l.replace(/^\d{2}\.\d{2}\.\d{2} ▶\s*/, "").trim()).join("\n");
    if (!t) { onCancel(); return; }
    setSaving(true);
    try { await onAdd(t); onCancel(); } finally { setSaving(false); }
  };
  return (
    <div>
      <DatedMemo
        value={draft}
        onChange={setDraft}
        placeholder="추가할 메모를 적으세요"
        rows={3}
        className="w-full border border-gray-300 rounded-lg px-2.5 py-1.5 text-xs resize-y focus:outline-none focus:ring-2 focus:ring-blue-300"
      />
      <div className="flex gap-1.5 mt-1.5 justify-end">
        <button onClick={onCancel} className="text-[11px] px-3 py-1 rounded-full border border-gray-300 bg-white text-gray-600 whitespace-nowrap">취소</button>
        <button onClick={save} disabled={saving} className="text-[11px] px-3 py-1 rounded-full bg-blue-600 text-white font-semibold disabled:opacity-50 whitespace-nowrap">{saving ? "저장 중…" : "저장"}</button>
      </div>
    </div>
  );
}
