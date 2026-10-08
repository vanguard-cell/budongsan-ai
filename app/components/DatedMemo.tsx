"use client";

/**
 * 날짜 자동 메모 칸 (건의 #36)
 *
 * 상담 내용을 일자별로 쌓아 쓰는 메모 — 수정 모달의 메모 칸에 사용.
 * - 빈 칸을 누르면 오늘 날짜("26.10.02 ▶ ")가 자동으로 들어감
 * - 엔터 = 다음 줄로 넘어가면서 오늘 날짜가 붙음
 * - Shift+엔터 = 날짜 없이 줄바꿈 (같은 날 내용 이어 쓰기)
 * - 날짜만 쓰고 내용 없이 나가면 그 빈 날짜 줄은 지워짐
 */

import { useRef } from "react";

function pad(n: number) { return String(n).padStart(2, "0"); }
/** 오늘 날짜 머리말 — "26.10.02 ▶ " (▶ 뒤부터 내가 쓰는 내용, 숫자와 안 헷갈리게) */
export function memoStamp(d = new Date()): string {
  return `${String(d.getFullYear()).slice(2)}.${pad(d.getMonth() + 1)}.${pad(d.getDate())} ▶ `;
}

interface Props {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  rows?: number;
  className?: string;
}

export default function DatedMemo({ value, onChange, placeholder, rows = 3, className }: Props) {
  const ref = useRef<HTMLTextAreaElement>(null);

  const moveCursor = (pos: number) => {
    requestAnimationFrame(() => {
      const el = ref.current;
      if (el) { el.selectionStart = el.selectionEnd = pos; }
    });
  };

  const onFocus = () => {
    if (value) return;
    const s = memoStamp();
    onChange(s);
    moveCursor(s.length);
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key !== "Enter" || e.shiftKey || e.ctrlKey || e.metaKey || e.altKey) return;
    if (e.nativeEvent.isComposing) return;   // 한글 조합 중 엔터는 글자 확정용 — 건드리지 않음
    e.preventDefault();
    const el = e.currentTarget;
    const insert = `\n${memoStamp()}`;
    const next = value.slice(0, el.selectionStart) + insert + value.slice(el.selectionEnd);
    onChange(next);
    moveCursor(el.selectionStart + insert.length);
  };

  // 내용 없이 날짜만 남은 줄 정리 (실수로 엔터 친 것·그냥 눌러본 것)
  const onBlur = () => {
    const cleaned = value
      .split("\n")
      .filter(line => !/^\d{2}\.\d{2}\.\d{2}(\s*▶)?\s*$/.test(line))
      .join("\n");
    if (cleaned !== value) onChange(cleaned);
  };

  return (
    <textarea
      ref={ref}
      value={value}
      onChange={e => onChange(e.target.value)}
      onFocus={onFocus}
      onKeyDown={onKeyDown}
      onBlur={onBlur}
      placeholder={placeholder}
      rows={rows}
      className={className}
    />
  );
}
