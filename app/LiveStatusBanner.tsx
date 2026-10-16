"use client";
import { useEffect, useState } from "react";
import { LIVE_STATUS_EVENT, liveHasError } from "@/lib/live";

/**
 * 서버 연결이 끊겼을 때(사용 한도 초과·인터넷 끊김 등) 화면 위에 안내
 * — 목록이 안 바뀌거나 비어 보여도 데이터가 지워진 게 아니라는 걸 알려줌. 다시 연결되면 자동으로 사라짐.
 */
export default function LiveStatusBanner() {
  const [error, setError] = useState(false);

  useEffect(() => {
    const on = (e: Event) => setError(!(e as CustomEvent<{ ok: boolean }>).detail.ok);
    window.addEventListener(LIVE_STATUS_EVENT, on);
    if (liveHasError()) queueMicrotask(() => setError(true));
    return () => window.removeEventListener(LIVE_STATUS_EVENT, on);
  }, []);

  if (!error) return null;
  return (
    <div className="fixed top-8 inset-x-0 z-[70] pointer-events-none flex justify-center px-3">
      <span className="px-3 py-1.5 rounded-xl bg-red-50 border border-red-200 text-red-700 text-xs font-semibold shadow text-center">
        ⚠️ 지금 서버 연결이 원활하지 않아 최신 내용을 못 불러오고 있어요.<br />
        데이터는 지워지지 않았어요. 잠시 후 자동으로 다시 연결돼요.
      </span>
    </div>
  );
}
