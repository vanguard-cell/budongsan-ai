"use client";

/**
 * 공용 슬라이드 패널 (DealDone 리디자인 3단계 — 방식 A: 밀어내기)
 *
 * - xl 이상(넓은 화면): 본문이 패널 폭(380px)만큼 자동 축소 (push) — 배경 어둡게 안 함
 *   · 부모에서 본문 래퍼에 `xl:pr-[380px]` 토글로 처리
 * - sm ~ xl 미만(좁은 창): overlay + 배경 dim (본문 찌그러짐 방지)
 * - sm 미만(폰): 바텀시트 (아래서 올라옴)
 * - ESC / 배경 클릭 / X 버튼으로 닫기
 *
 * 매물·손님·일정 어디서든 재사용.
 */

import { useEffect } from "react";
import Link from "next/link";

interface Props {
  open: boolean;
  onClose: () => void;
  title: string;
  /** Material Symbols 아이콘 */
  icon?: string;
  /** 상단 색 띠 + 아이콘 색 (상태색) */
  accent?: string;
  /** 건수 표시 (제목 옆) */
  count?: number;
  /** "전체 보기" 링크 — 해당 페이지로 이동 */
  moreHref?: string;
  children: React.ReactNode;
}

export const DRAWER_WIDTH_CLASS = "xl:pr-[380px]";

export default function SideDrawer({ open, onClose, title, icon, accent = "#2563EB", count, moreHref, children }: Props) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <>
      {/* 배경 dim — 폰(바텀시트)·중간 폭(overlay)에서만. xl+는 push라 불필요 */}
      <div
        className="fixed inset-0 z-40 bg-black/30 xl:hidden animate-[backdrop-fade_.2s_ease-out]"
        onClick={onClose}
      />

      <aside
        className="fixed z-50 bg-white dark:bg-slate-900 shadow-2xl flex flex-col
          max-sm:inset-x-0 max-sm:bottom-0 max-sm:max-h-[78vh] max-sm:rounded-t-2xl max-sm:animate-[drawer-in-up_.25s_ease-out]
          sm:top-0 sm:right-0 sm:bottom-0 sm:w-[380px] sm:border-l sm:border-gray-200 sm:dark:border-slate-700 sm:animate-[drawer-in-right_.25s_ease-out]"
        style={{ borderTop: `3px solid ${accent}` }}
      >
        {/* 폰: 끌기 핸들 */}
        <div className="sm:hidden flex justify-center pt-2">
          <span className="w-10 h-1 rounded-full bg-gray-300 dark:bg-slate-600" />
        </div>

        {/* 헤더 */}
        <div className="flex items-center gap-2 px-4 py-3 border-b border-gray-100 dark:border-slate-800">
          {icon && (
            <span className="material-symbols-outlined text-[20px]" style={{ color: accent }}>{icon}</span>
          )}
          <h3 className="font-bold text-base text-gray-900 dark:text-gray-100">
            {title}
            {typeof count === "number" && (
              <span className="ml-1.5 text-sm font-bold" style={{ color: accent }}>{count}건</span>
            )}
          </h3>
          <div className="ml-auto flex items-center gap-1">
            {moreHref && (
              <Link
                href={moreHref}
                className="text-xs font-semibold text-gray-400 hover:text-[var(--brand-blue)] dark:hover:text-blue-400 px-2 py-1 rounded-lg transition-colors"
              >
                전체 보기 →
              </Link>
            )}
            <button
              onClick={onClose}
              title="닫기"
              className="w-8 h-8 flex items-center justify-center rounded-full text-gray-400 hover:bg-gray-100 dark:hover:bg-slate-800 hover:text-gray-700 dark:hover:text-gray-200 transition-colors"
            >
              <span className="material-symbols-outlined text-[20px]">close</span>
            </button>
          </div>
        </div>

        {/* 내용 */}
        <div className="flex-1 overflow-y-auto p-3 space-y-2 pb-6">
          {children}
        </div>
      </aside>
    </>
  );
}

/* ── 패널 내부 공용 부품 ── */

/** 연락 칩 색 — 역할별 구분 (임차인·매수인=파랑 / 임대인·집주인·매도인=주황 / 그 외=초록) */
const CHIP_STYLES = {
  tenant: "bg-blue-50 dark:bg-blue-950/40 text-blue-700 dark:text-blue-300 hover:bg-blue-100 dark:hover:bg-blue-950/70",
  owner:  "bg-amber-50 dark:bg-amber-950/40 text-amber-700 dark:text-amber-300 hover:bg-amber-100 dark:hover:bg-amber-950/70",
  etc:    "bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 hover:bg-emerald-100 dark:hover:bg-emerald-950/70",
} as const;

export type ContactKind = keyof typeof CHIP_STYLES;

/** 항목 한 장 — 제목 + 부가정보 + D-day 배지 + 전화/문자 칩 + 상세 링크 */
export function DrawerItem({ title, sub, badge, badgeColor, contacts, detailHref }: {
  title: string;
  sub?: string;
  badge?: string;
  badgeColor?: string;
  /** 전화 연결 대상 (역할+이름 라벨 + 번호) — 번호 없는 항목은 자동 제외 */
  contacts?: { label: string; phone?: string; kind?: ContactKind }[];
  detailHref?: string;
}) {
  const valid = (contacts || []).filter(c => c.phone);
  return (
    <div className="p-3.5 rounded-xl border border-gray-200/80 dark:border-slate-700 bg-white dark:bg-slate-800">
      <div className="flex items-start justify-between gap-2">
        <p className="font-bold text-sm text-gray-900 dark:text-gray-100 break-all">{title}</p>
        {badge && (
          <span
            className="text-[10px] px-1.5 py-0.5 rounded-full font-bold text-white shrink-0"
            style={{ backgroundColor: badgeColor || "#9ca3af" }}
          >
            {badge}
          </span>
        )}
      </div>
      {sub && <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5 break-all">{sub}</p>}

      {(valid.length > 0 || detailHref) && (
        <div className="flex flex-wrap items-center gap-1.5 mt-2.5">
          {valid.map(c => {
            const style = CHIP_STYLES[c.kind || "etc"];
            return (
              <span key={c.phone} className="inline-flex items-center rounded-full overflow-hidden border border-gray-200 dark:border-slate-600">
                <a
                  href={`tel:${c.phone}`}
                  className={`inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-bold transition-colors ${style}`}
                >
                  <span className="material-symbols-outlined text-[14px]">call</span>
                  {c.label}
                </a>
                <a
                  href={`sms:${c.phone}`}
                  title={`${c.label}에게 문자`}
                  className={`inline-flex items-center px-2 py-1.5 text-xs font-bold transition-colors border-l border-gray-200 dark:border-slate-600 ${style}`}
                >
                  <span className="material-symbols-outlined text-[14px]">sms</span>
                </a>
              </span>
            );
          })}
          {detailHref && (
            <Link
              href={detailHref}
              className="ml-auto inline-flex items-center gap-0.5 text-xs font-semibold text-gray-400 hover:text-[var(--brand-blue)] dark:hover:text-blue-400 transition-colors"
            >
              상세
              <span className="material-symbols-outlined text-[14px]">chevron_right</span>
            </Link>
          )}
        </div>
      )}
    </div>
  );
}

/** 빈 상태 */
export function DrawerEmpty({ text }: { text: string }) {
  return (
    <div className="py-12 text-center text-sm text-gray-400 dark:text-gray-500">
      ✨ {text}
    </div>
  );
}
