"use client";
import Link from "next/link";
import { useAuth } from "@/lib/auth-context";
import { ADMIN_EMAIL } from "@/lib/admin-db";

const ITEMS = [
  { href: "/schedule", icon: "📅", label: "스케줄",        desc: "약속·계약일·중도금·잔금 통합 캘린더" },
  { href: "/sales",    icon: "💰", label: "매출 관리",     desc: "잔금일 기준 월별 수수료 매출 집계·그래프" },
  // { href: "/ai-content", icon: "✨", label: "AI 문구 생성", desc: "..." },  // 임시 숨김 (미사용)
  { href: "/feedback", icon: "📬", label: "건의함",        desc: "수정 요청 및 건의사항 전달" },
];

const ADMIN_ITEM = { href: "/admin", icon: "📊", label: "유저 사용 현황", desc: "전체 유저 접속·데이터량 (관리자 전용)" };

export default function MorePage() {
  const { user } = useAuth();
  const items = user?.email === ADMIN_EMAIL ? [...ITEMS, ADMIN_ITEM] : ITEMS;
  return (
    <div className="min-h-screen bg-white">
      <div className="max-w-lg mx-auto px-4 py-8">
        <div className="text-center mb-8">
          <div className="inline-flex items-center gap-2 bg-gray-700 text-white px-4 py-1.5 rounded-full text-sm font-medium mb-3">
            ··· 더보기
          </div>
          <h1 className="text-xl font-bold text-gray-900">기타 메뉴</h1>
        </div>
        <div className="space-y-3">
          {items.map(item => (
            <Link key={item.href} href={item.href}
              className="flex items-center gap-4 bg-white rounded-2xl border border-gray-200 p-4 hover:border-blue-400 hover:shadow-sm transition-all">
              <span className="text-3xl">{item.icon}</span>
              <div>
                <div className="text-sm font-semibold text-gray-900">{item.label}</div>
                <div className="text-xs text-gray-500 mt-0.5">{item.desc}</div>
              </div>
              <span className="ml-auto text-gray-400">›</span>
            </Link>
          ))}
        </div>
      </div>
    </div>
  );
}
