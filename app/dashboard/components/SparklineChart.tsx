"use client";

/**
 * Sparkline 미니 차트 — KPI 카드 우측 상단에 표시
 * - SVG polyline + dasharray 애니메이션
 * - 색은 부모에서 stroke 클래스로 지정
 */

import { useMemo } from "react";

interface Props {
  data: number[];   // 시계열 값 (최소 2개)
  className?: string;
}

export default function SparklineChart({ data, className = "stroke-amber-500" }: Props) {
  const points = useMemo(() => {
    if (data.length < 2) return "0,30 100,5";
    const max = Math.max(...data, 1);
    const min = Math.min(...data, 0);
    const range = Math.max(1, max - min);
    return data
      .map((v, i) => {
        const x = (i / (data.length - 1)) * 100;
        const y = 40 - ((v - min) / range) * 35 - 2;
        return `${x.toFixed(1)},${y.toFixed(1)}`;
      })
      .join(" ");
  }, [data]);

  return (
    <svg
      className={`w-16 h-8 fill-none stroke-2 sparkline-svg ${className}`}
      viewBox="0 0 100 40"
      preserveAspectRatio="none"
    >
      <polyline points={points} strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
