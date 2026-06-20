/**
 * 페이지별 고유 색상 시스템
 *
 * 사용자가 "지금 어느 영역에 있는지" 색으로 즉시 인지하게 하는 디자인 토큰.
 * 모든 페이지·컴포넌트가 같은 매핑을 참조.
 *
 * Stitch 4차 시안 + 사용자 결정 반영.
 */

export type PageKey =
  | "home"
  | "properties"
  | "expiry"
  | "customers"
  | "schedule"
  | "sales"
  | "ai-content";

export interface PageTheme {
  /** 이름 */
  label: string;
  /** 아이콘 (Material Symbols) */
  icon: string;
  /** 이모지 (보조 — 모바일·토스트 등) */
  emoji: string;
  /** 라우트 */
  href: string;
  /** Tailwind 색 prefix (예: "emerald") */
  color: string;
  /** 강조 색 (라이트) */
  light: {
    bg: string;        // bg-emerald-50
    border: string;    // border-emerald-200
    text: string;      // text-emerald-700
    icon: string;      // text-emerald-600 (아이콘 fg)
    iconBg: string;    // bg-emerald-100 (아이콘 배경)
    badge: string;     // bg-emerald-100 text-emerald-700
    active: string;    // bg-emerald-50 text-emerald-800 (사이드바 활성)
    barLeft: string;   // border-l-4 border-emerald-600 (활성 좌측 바)
    solid: string;     // bg-emerald-600 (CTA·진하게)
  };
  /** 강조 색 (다크 — prefers-color-scheme: dark 또는 .dark 클래스) */
  dark: {
    bg: string;
    border: string;
    text: string;
    icon: string;
    iconBg: string;
    badge: string;
    active: string;
    barLeft: string;
    solid: string;
  };
}

export const PAGE_THEMES: Record<PageKey, PageTheme> = {
  "home": {
    label: "홈",
    icon: "home",
    emoji: "🏠",
    href: "/dashboard",
    color: "green",
    light: {
      bg: "bg-green-50", border: "border-green-200", text: "text-green-700",
      icon: "text-green-600", iconBg: "bg-green-100",
      badge: "bg-green-100 text-green-700",
      active: "bg-green-50 text-green-800",
      barLeft: "border-l-4 border-green-600",
      solid: "bg-green-600",
    },
    dark: {
      bg: "dark:bg-green-950/40", border: "dark:border-green-800",
      text: "dark:text-green-300", icon: "dark:text-green-400",
      iconBg: "dark:bg-green-900/50",
      badge: "dark:bg-green-900/50 dark:text-green-300",
      active: "dark:bg-green-950/60 dark:text-green-200",
      barLeft: "dark:border-green-400",
      solid: "dark:bg-green-500",
    },
  },
  "properties": {
    label: "내 매물 관리",
    icon: "domain",
    emoji: "🏘️",
    href: "/properties",
    color: "emerald",
    light: {
      bg: "bg-emerald-50", border: "border-emerald-200", text: "text-emerald-700",
      icon: "text-emerald-600", iconBg: "bg-emerald-100",
      badge: "bg-emerald-100 text-emerald-700",
      active: "bg-emerald-50 text-emerald-800",
      barLeft: "border-l-4 border-emerald-600",
      solid: "bg-emerald-600",
    },
    dark: {
      bg: "dark:bg-emerald-950/40", border: "dark:border-emerald-800",
      text: "dark:text-emerald-300", icon: "dark:text-emerald-400",
      iconBg: "dark:bg-emerald-900/50",
      badge: "dark:bg-emerald-900/50 dark:text-emerald-300",
      active: "dark:bg-emerald-950/60 dark:text-emerald-200",
      barLeft: "dark:border-emerald-400",
      solid: "dark:bg-emerald-500",
    },
  },
  "expiry": {
    label: "만기 관리",
    icon: "event_busy",
    emoji: "⏰",
    href: "/expiry",
    color: "orange",
    light: {
      bg: "bg-orange-50", border: "border-orange-200", text: "text-orange-700",
      icon: "text-orange-600", iconBg: "bg-orange-100",
      badge: "bg-orange-100 text-orange-700",
      active: "bg-orange-50 text-orange-800",
      barLeft: "border-l-4 border-orange-500",
      solid: "bg-orange-500",
    },
    dark: {
      bg: "dark:bg-orange-950/40", border: "dark:border-orange-800",
      text: "dark:text-orange-300", icon: "dark:text-orange-400",
      iconBg: "dark:bg-orange-900/50",
      badge: "dark:bg-orange-900/50 dark:text-orange-300",
      active: "dark:bg-orange-950/60 dark:text-orange-200",
      barLeft: "dark:border-orange-400",
      solid: "dark:bg-orange-500",
    },
  },
  "customers": {
    label: "고객 관리",
    icon: "group",
    emoji: "👥",
    href: "/customers",
    color: "blue",
    light: {
      bg: "bg-blue-50", border: "border-blue-200", text: "text-blue-700",
      icon: "text-blue-600", iconBg: "bg-blue-100",
      badge: "bg-blue-100 text-blue-700",
      active: "bg-blue-50 text-blue-800",
      barLeft: "border-l-4 border-blue-600",
      solid: "bg-blue-600",
    },
    dark: {
      bg: "dark:bg-blue-950/40", border: "dark:border-blue-800",
      text: "dark:text-blue-300", icon: "dark:text-blue-400",
      iconBg: "dark:bg-blue-900/50",
      badge: "dark:bg-blue-900/50 dark:text-blue-300",
      active: "dark:bg-blue-950/60 dark:text-blue-200",
      barLeft: "dark:border-blue-400",
      solid: "dark:bg-blue-500",
    },
  },
  "schedule": {
    label: "스케줄",
    icon: "calendar_month",
    emoji: "📅",
    href: "/schedule",
    color: "purple",
    light: {
      bg: "bg-purple-50", border: "border-purple-200", text: "text-purple-700",
      icon: "text-purple-600", iconBg: "bg-purple-100",
      badge: "bg-purple-100 text-purple-700",
      active: "bg-purple-50 text-purple-800",
      barLeft: "border-l-4 border-purple-600",
      solid: "bg-purple-600",
    },
    dark: {
      bg: "dark:bg-purple-950/40", border: "dark:border-purple-800",
      text: "dark:text-purple-300", icon: "dark:text-purple-400",
      iconBg: "dark:bg-purple-900/50",
      badge: "dark:bg-purple-900/50 dark:text-purple-300",
      active: "dark:bg-purple-950/60 dark:text-purple-200",
      barLeft: "dark:border-purple-400",
      solid: "dark:bg-purple-500",
    },
  },
  "sales": {
    label: "매출 관리",
    icon: "payments",
    emoji: "💰",
    href: "/sales",
    color: "amber",
    light: {
      bg: "bg-amber-50", border: "border-amber-200", text: "text-amber-700",
      icon: "text-amber-600", iconBg: "bg-amber-100",
      badge: "bg-amber-100 text-amber-700",
      active: "bg-amber-50 text-amber-800",
      barLeft: "border-l-4 border-amber-500",
      solid: "bg-amber-500",
    },
    dark: {
      bg: "dark:bg-amber-950/40", border: "dark:border-amber-800",
      text: "dark:text-amber-300", icon: "dark:text-amber-400",
      iconBg: "dark:bg-amber-900/50",
      badge: "dark:bg-amber-900/50 dark:text-amber-300",
      active: "dark:bg-amber-950/60 dark:text-amber-200",
      barLeft: "dark:border-amber-400",
      solid: "dark:bg-amber-500",
    },
  },
  "ai-content": {
    label: "AI 문구 생성",
    icon: "smart_toy",
    emoji: "✨",
    href: "/",
    color: "pink",
    light: {
      bg: "bg-pink-50", border: "border-pink-200", text: "text-pink-700",
      icon: "text-pink-600", iconBg: "bg-pink-100",
      badge: "bg-pink-100 text-pink-700",
      active: "bg-pink-50 text-pink-800",
      barLeft: "border-l-4 border-pink-500",
      solid: "bg-pink-500",
    },
    dark: {
      bg: "dark:bg-pink-950/40", border: "dark:border-pink-800",
      text: "dark:text-pink-300", icon: "dark:text-pink-400",
      iconBg: "dark:bg-pink-900/50",
      badge: "dark:bg-pink-900/50 dark:text-pink-300",
      active: "dark:bg-pink-950/60 dark:text-pink-200",
      barLeft: "dark:border-pink-400",
      solid: "dark:bg-pink-500",
    },
  },
};

/** 메뉴 순서 (사이드바·탭바 공용) */
export const PAGE_ORDER: PageKey[] = [
  "home", "properties", "expiry", "customers",
  "schedule", "sales", "ai-content",
];

/** 헬퍼 — 클래스 모음 한 번에 가져오기 */
export function pageClasses(key: PageKey, variant: "light" | "dark" = "light") {
  return PAGE_THEMES[key][variant];
}

/** 라이트+다크 한꺼번에 (대시보드 카드 등에서 사용) */
export function bothClasses(key: PageKey) {
  const l = PAGE_THEMES[key].light;
  const d = PAGE_THEMES[key].dark;
  return {
    bg: `${l.bg} ${d.bg}`,
    border: `${l.border} ${d.border}`,
    text: `${l.text} ${d.text}`,
    icon: `${l.icon} ${d.icon}`,
    iconBg: `${l.iconBg} ${d.iconBg}`,
    badge: `${l.badge} ${d.badge}`,
    solid: `${l.solid} ${d.solid}`,
  };
}
