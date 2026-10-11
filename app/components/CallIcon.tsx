/** 통화 버튼용 아이콘 — 하늘색 동그라미 + 검은 테두리 전화기 */
export default function CallIcon({ size = 24 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 100 100" aria-hidden="true" className="shrink-0">
      <circle cx="50" cy="50" r="46" fill="#8CC8FF" stroke="#000" strokeWidth="7" />
      <path
        d="M33 25c3-3 8-3 10 1l8 13c2 3 1 6-1 8l-4 5c5 8 11 14 19 19l5-4c2-2 5-3 8-1l13 8c4 2 4 7 1 10l-6 6c-5 5-14 4-24-1C47 82 31 65 25 46c-3-9-2-17 2-21l6 0z"
        transform="translate(-3 -3) scale(0.95)"
        fill="#E8ECEF"
        stroke="#000"
        strokeWidth="5"
        strokeLinejoin="round"
      />
    </svg>
  );
}
