"use client";

import { useCallback, useEffect, useState } from "react";
import { fetchTrashedProperties, restoreProperty, type TrashedProperty } from "@/lib/properties-db";

/** 지운 매물 보관함 — 실수로 지운 매물을 되살린다 (건의 #124) */
export default function TrashModal({ agencyId, onClose }: { agencyId: string; onClose: () => void }) {
  const [list, setList] = useState<TrashedProperty[] | null>(null);
  const [busy, setBusy] = useState("");

  const load = useCallback(() => {
    fetchTrashedProperties(agencyId).then(setList).catch(() => setList([]));
  }, [agencyId]);
  useEffect(load, [load]);

  const restore = async (p: TrashedProperty) => {
    setBusy(p.id);
    try {
      await restoreProperty(agencyId, p.id);
      load();
    } catch (e) {
      console.error("[trash] 되살리기 실패:", e);
      alert("되살리는 중 문제가 생겼어요. 잠시 후 다시 해주세요.");
    }
    setBusy("");
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white dark:bg-slate-800 rounded-2xl w-full max-w-lg max-h-[80vh] flex flex-col" onClick={e => e.stopPropagation()}>
        <div className="p-4 border-b border-gray-200 dark:border-slate-700 flex items-center justify-between">
          <h2 className="font-bold text-lg">🗑️ 지운 매물 보관함</h2>
          <button onClick={onClose} className="px-3 py-1.5 text-sm whitespace-nowrap">닫기</button>
        </div>
        <div className="overflow-y-auto p-3 space-y-2">
          {list === null && <p className="text-sm text-gray-500 p-4">불러오는 중…</p>}
          {list && list.length === 0 && (
            <p className="text-sm text-gray-500 p-4">보관된 매물이 없어요. (지금부터 지우는 매물이 여기에 남아요)</p>
          )}
          {list?.map(p => (
            <div key={p.id} className="flex items-center gap-2 p-3 rounded-xl border border-gray-200 dark:border-slate-700">
              <div className="min-w-0 flex-1">
                <div className="font-semibold text-sm truncate">
                  {p.address || "(주소 없음)"}{p.dong ? ` ${p.dong}동` : ""}{p.ho ? ` ${p.ho}호` : ""}
                </div>
                <div className="text-xs text-gray-500 truncate">
                  {p.dealType} · {p.price || "-"}{p.deletedAt ? ` · ${new Date(p.deletedAt).toLocaleDateString("ko-KR")} 지움` : ""}
                </div>
              </div>
              <button
                onClick={() => restore(p)}
                disabled={!!busy}
                className="px-3 py-2 rounded-lg text-xs font-semibold bg-emerald-600 text-white whitespace-nowrap shrink-0 disabled:opacity-50"
              >
                {busy === p.id ? "되살리는 중…" : "되살리기"}
              </button>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
