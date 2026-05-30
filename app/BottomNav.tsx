"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const TABS = [
  { href: "/",          icon: "🏠", label: "매물" },
  { href: "/expiry",    icon: "⏰", label: "만기" },
  { href: "/customers", icon: "👥", label: "손님" },
  { href: "/feedback",  icon: "📬", label: "건의함" },
];

export default function BottomNav() {
  const pathname = usePathname();

  // 로그인 페이지에서는 숨김
  if (pathname === "/login") return null;

  return (
    <>
      {/* 하단 탭바가 콘텐츠를 가리지 않도록 여백 */}
      <div className="h-20" />

      {/* 하단 탭바 */}
      <nav className="fixed bottom-0 left-0 right-0 z-50 bg-white border-t border-gray-200 shadow-[0_-4px_20px_rgba(0,0,0,0.06)]">
        <div className="max-w-lg mx-auto flex items-center justify-around px-2 pb-safe">
          {TABS.map(tab => {
            const isActive =
              tab.href === "/"
                ? pathname === "/"
                : pathname.startsWith(tab.href);

            return (
              <Link
                key={tab.href}
                href={tab.href}
                className={`flex flex-col items-center gap-1 flex-1 py-3 rounded-2xl transition-colors ${
                  isActive ? "text-blue-600" : "text-gray-400 hover:text-gray-600"
                }`}
              >
                <span className="text-2xl leading-none">{tab.icon}</span>
                <span className={`text-[11px] font-medium ${isActive ? "text-blue-600 font-bold" : ""}`}>
                  {tab.label}
                </span>
                {isActive && (
                  <span className="w-1 h-1 rounded-full bg-blue-600" />
                )}
              </Link>
            );
          })}
        </div>
      </nav>
    </>
  );
}
