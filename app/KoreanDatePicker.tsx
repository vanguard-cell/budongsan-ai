"use client";

/**
 * 한국어 커스텀 캘린더 — 어머니 친화 UI
 *
 * - 큰 버튼 + 큰 글자 + 한국어 요일·월
 * - 시간 선택 옵션 (15분 단위)
 * - 입력 필드 클릭 시 큰 캘린더 펼침
 * - 기존 native <input type="date">의 작은 캘린더 아이콘 대체
 *
 * value 형식:
 *   - showTime=false: "YYYY-MM-DD"
 *   - showTime=true:  "YYYY-MM-DDTHH:MM"
 */

import { forwardRef } from "react";
import DatePicker from "react-datepicker";
import { ko } from "date-fns/locale";
import "react-datepicker/dist/react-datepicker.css";

interface Props {
  value: string;
  onChange: (v: string) => void;
  showTime?: boolean;
  placeholder?: string;
  label?: string;
  /** 강조 색상 — purple/pink/red/orange/blue/emerald */
  accent?: "purple" | "pink" | "red" | "orange" | "blue" | "emerald" | "gray";
  /** 라벨 크고 진하게 (계약일용) */
  emphasizeLabel?: boolean;
}

const ACCENT_CLASSES: Record<NonNullable<Props["accent"]>, { border: string; ring: string; label: string }> = {
  purple:  { border: "border-purple-300",  ring: "focus:ring-purple-400",  label: "text-purple-700" },
  pink:    { border: "border-pink-300",    ring: "focus:ring-pink-400",    label: "text-pink-700" },
  red:     { border: "border-red-300",     ring: "focus:ring-red-400",     label: "text-red-700" },
  orange:  { border: "border-orange-300",  ring: "focus:ring-orange-400",  label: "text-orange-700" },
  blue:    { border: "border-blue-300",    ring: "focus:ring-blue-400",    label: "text-blue-700" },
  emerald: { border: "border-emerald-300", ring: "focus:ring-emerald-400", label: "text-emerald-700" },
  gray:    { border: "border-gray-300",    ring: "focus:ring-gray-400",    label: "text-gray-700" },
};

/** 문자열 → Date (ISO 또는 YYYY-MM-DD) */
function parseValue(v: string): Date | null {
  if (!v) return null;
  // "YYYY-MM-DD" 또는 "YYYY-MM-DDTHH:MM" 모두 처리
  const d = new Date(v.length === 10 ? v + "T00:00:00" : v);
  return isNaN(d.getTime()) ? null : d;
}

/** Date → 저장 문자열 */
function formatValue(d: Date | null, withTime: boolean): string {
  if (!d) return "";
  const yyyy = d.getFullYear();
  const mm   = String(d.getMonth() + 1).padStart(2, "0");
  const dd   = String(d.getDate()).padStart(2, "0");
  if (!withTime) return `${yyyy}-${mm}-${dd}`;
  const hh = String(d.getHours()).padStart(2, "0");
  const mi = String(d.getMinutes()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}T${hh}:${mi}`;
}

/* 커스텀 트리거 버튼 — 기존 input 사이즈와 비슷하게 */
type TriggerProps = {
  value?: string;
  onClick?: () => void;
  placeholder?: string;
  borderCls: string;
  ringCls: string;
};
const TriggerButton = forwardRef<HTMLButtonElement, TriggerProps>(function TriggerButton(
  { value, onClick, placeholder, borderCls, ringCls },
  ref,
) {
  return (
    <button
      ref={ref}
      type="button"
      onClick={onClick}
      className={`w-full flex items-center justify-between gap-2 border ${borderCls} rounded-xl px-3 py-2.5 text-sm bg-white focus:outline-none focus:ring-2 ${ringCls} text-left hover:bg-gray-50 transition-colors`}
    >
      <span className={value ? "text-gray-800" : "text-gray-400"}>
        {value || placeholder || "날짜 선택"}
      </span>
      <span className="text-sm flex-shrink-0">📅</span>
    </button>
  );
});

export default function KoreanDatePicker({
  value,
  onChange,
  showTime = false,
  placeholder,
  label,
  accent = "gray",
  emphasizeLabel = false,
}: Props) {
  const cls = ACCENT_CLASSES[accent];
  const date = parseValue(value);

  // 표시용 — 사용자에게 보여줄 한국식 문자열
  const displayValue = date
    ? showTime
      ? `${date.getFullYear()}년 ${date.getMonth() + 1}월 ${date.getDate()}일 ${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`
      : `${date.getFullYear()}년 ${date.getMonth() + 1}월 ${date.getDate()}일`
    : "";

  return (
    <div>
      {label && (
        <label className={`block mb-1.5 ${emphasizeLabel ? "text-lg font-bold" : "text-sm font-medium"} ${cls.label}`}>
          {label}
        </label>
      )}
      <DatePicker
        selected={date}
        onChange={(d: Date | null) => onChange(formatValue(d, showTime))}
        locale={ko}
        dateFormat={showTime ? "yyyy년 MM월 dd일 HH:mm" : "yyyy년 MM월 dd일"}
        showTimeSelect={showTime}
        timeIntervals={15}
        timeCaption="시간"
        placeholderText={placeholder || (showTime ? "날짜·시간 선택" : "날짜 선택")}
        customInput={<TriggerButton value={displayValue} placeholder={placeholder} borderCls={cls.border} ringCls={cls.ring} />}
        popperPlacement="bottom-start"
        wrapperClassName="w-full"
        calendarClassName="korean-datepicker-cal"
      />
    </div>
  );
}
