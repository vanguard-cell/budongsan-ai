"use client";

import { useState } from "react";

/**
 * 메모 보기 (건의 #76)
 *
 * 날짜("26.10.02 ▶ ")로 시작하는 줄마다 새 칸으로 나누고, 칸 사이에 가는 실선을 그어 보여줌.
 * 날짜가 없는 옛 메모는 선 없이 그대로 보임.
 */
const DATE_LINE = /^\d{2}\.\d{2}\.\d{2}(\s|$)/;
// 다른 곳(만기 관리 등)에서 넘어온 메모의 날짜 모양도 인식 — 2026.10.02 / 26-10-02 / 26/10/02 / 10/2 / 10.2 (건의 #144)
const LOOSE_DATE_LINE = /^(\d{2}|\d{4})[./-]\d{1,2}[./-]\d{1,2}(\D|$)|^\d{1,2}[./]\d{1,2}(\s|$|[▶:-])/;

export function splitMemo(memo: string): string[] {
  const lines = memo.split("\n");
  const entries: string[] = [];
  for (const line of lines) {
    const t = line.trim();
    if (entries.length === 0 || DATE_LINE.test(t) || LOOSE_DATE_LINE.test(t)) entries.push(line);
    else entries[entries.length - 1] += "\n" + line;
  }
  // 날짜가 하나도 없는 여러 줄 메모는 한 줄씩 한 칸으로 봄
  if (entries.length === 1 && lines.filter(l => l.trim()).length > 1) {
    return lines.filter(l => l.trim());
  }
  return entries;
}

export default function MemoText({ memo, collapsible = false }: { memo: string; collapsible?: boolean }) {
  const [open, setOpen] = useState(false);
  const entries = splitMemo(memo);
  // 접기 가능: 메모가 2개 이상이면 마지막 것만 보이고 나머지는 펼치기 (건의 #137)
  const fold = collapsible && entries.length > 1 && !open;
  const shown = fold ? entries.slice(-1) : entries;
  return (
    <>
      {collapsible && entries.length > 1 && (
        <button
          type="button"
          onClick={e => { e.stopPropagation(); setOpen(v => !v); }}
          className="whitespace-nowrap text-[11px] text-blue-600 dark:text-blue-400 font-semibold mb-0.5"
        >
          {open ? "▲ 접기" : `▼ 이전 메모 ${entries.length - 1}개 펼치기`}
        </button>
      )}
      {shown.map((e, i) => (
        <div
          key={i}
          className={`whitespace-pre-wrap ${i > 0 ? "border-t border-gray-300 dark:border-slate-600 mt-1 pt-1" : ""}`}
        >
          {e}
        </div>
      ))}
    </>
  );
}
