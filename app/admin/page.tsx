"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth-context";
import { fetchAllUsersUsage, summarize, ADMIN_EMAIL, type UserUsage, type UsageSummary } from "@/lib/admin-db";
import { fetchProperties, type Property } from "@/lib/properties-db";

function fmtDate(ms: number): string {
  if (!ms) return "—";
  return new Date(ms).toLocaleDateString("ko-KR", { year: "2-digit", month: "2-digit", day: "2-digit" });
}
function fmtRelative(ms: number): string {
  if (!ms) return "접속 기록 없음";
  const diff = Date.now() - ms;
  const day = 24 * 60 * 60 * 1000;
  const days = Math.floor(diff / day);
  if (days === 0) return "오늘";
  if (days === 1) return "어제";
  if (days < 7) return `${days}일 전`;
  if (days < 30) return `${Math.floor(days / 7)}주 전`;
  return `${Math.floor(days / 30)}개월 전`;
}

export default function AdminPage() {
  const router = useRouter();
  const { user, loading: authLoading, signOut } = useAuth();
  const isAdmin = user?.email === ADMIN_EMAIL;

  const [users, setUsers] = useState<UserUsage[]>([]);
  const [summary, setSummary] = useState<UsageSummary | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState("");
  // 매물 열람 모달
  const [viewing, setViewing] = useState<{ user: UserUsage; props: Property[] } | null>(null);
  const [viewLoading, setViewLoading] = useState(false);

  const openUserProperties = async (u: UserUsage) => {
    if (!u.agencyId) return;
    setViewLoading(true);
    try {
      const props = await fetchProperties(u.agencyId);
      setViewing({ user: u, props });
    } catch (e) {
      alert("매물 열람 실패: " + (e instanceof Error ? e.message : String(e)));
    } finally {
      setViewLoading(false);
    }
  };

  useEffect(() => {
    if (!authLoading && !user) router.replace("/login?redirect=/admin");
  }, [authLoading, user, router]);

  useEffect(() => {
    if (!user || !isAdmin) return;
    (async () => {
      try {
        const list = await fetchAllUsersUsage();
        setUsers(list);
        setSummary(summarize(list));
      } catch (e) {
        console.error("[admin] 조회 실패:", e);
        setError(e instanceof Error ? e.message : String(e));
      } finally {
        setLoaded(true);
      }
    })();
  }, [user, isAdmin]);

  if (authLoading || !user) {
    return <div className="min-h-screen flex items-center justify-center text-gray-400 text-sm">불러오는 중…</div>;
  }

  // 관리자 아니면 차단
  if (!isAdmin) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-3 text-center px-4">
        <div className="text-5xl">🔒</div>
        <div className="text-base font-semibold text-gray-900">관리자 전용 페이지입니다</div>
        <Link href="/dashboard" className="text-sm px-4 py-2 rounded-full border-2 border-blue-500 bg-blue-50 text-blue-700 font-semibold">← 대시보드로</Link>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-purple-50">
      <div className="max-w-3xl mx-auto px-3 sm:px-4 py-5 sm:py-8">

        {/* 사용자 바 */}
        <div className="flex items-center justify-end gap-2 mb-3 text-[11px] text-gray-500">
          <span className="px-2 py-0.5 rounded-full bg-purple-100 text-purple-700 font-medium">👑 관리자</span>
          <span>{user.email}</span>
          <span className="text-gray-300">·</span>
          <button onClick={() => { if (confirm("로그아웃?")) signOut(); }} className="hover:text-blue-600 hover:underline">로그아웃</button>
        </div>

        {/* 헤더 */}
        <div className="text-center mb-6">
          <div className="inline-flex items-center gap-2 bg-purple-600 text-white px-4 py-1.5 rounded-full text-sm font-medium mb-3">📊 유저 사용 현황</div>
          <h1 className="text-xl sm:text-2xl font-bold text-gray-900 mb-1">전체 유저 관리</h1>
          <p className="text-gray-500 text-xs sm:text-sm mb-4">접속·데이터량 — 유료 전환 검토용</p>
          <div className="flex flex-wrap gap-2 justify-center">
            <Link href="/dashboard" className="text-xs sm:text-sm px-3 sm:px-4 py-2 rounded-full border border-gray-300 hover:border-blue-500 hover:text-blue-600 transition-colors">← 대시보드</Link>
            <Link href="/feedback" className="text-xs sm:text-sm px-3 sm:px-4 py-2 rounded-full border border-gray-300 hover:border-purple-500 hover:text-purple-600 transition-colors">📬 건의함</Link>
          </div>
        </div>

        {/* 요약 카드 */}
        {summary && (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mb-5">
            {[
              { label: "전체 유저", value: summary.totalUsers, color: "text-gray-900" },
              { label: "주간 활성", value: summary.activeWeek, color: "text-emerald-600" },
              { label: "월간 활성", value: summary.activeMonth, color: "text-blue-600" },
              { label: "신규(7일)", value: summary.newWeek, color: "text-purple-600" },
            ].map(s => (
              <div key={s.label} className="bg-white rounded-2xl border border-gray-200 p-3 text-center">
                <div className={`text-2xl font-bold ${s.color}`}>{s.value}</div>
                <div className="text-[11px] text-gray-500 mt-0.5">{s.label}</div>
              </div>
            ))}
          </div>
        )}

        {error && (
          <div className="bg-red-50 border border-red-200 rounded-2xl px-4 py-3 mb-4 text-xs text-red-700">
            ⚠️ 조회 오류: {error}<br />
            <span className="text-red-500">규칙 배포가 안 됐거나 권한 문제일 수 있어요.</span>
          </div>
        )}

        {/* 유저 목록 */}
        {!loaded ? (
          <div className="text-center text-gray-400 py-12">불러오는 중…</div>
        ) : users.length === 0 ? (
          <div className="bg-white rounded-3xl border border-gray-200 p-8 text-center text-gray-500">아직 가입한 유저가 없습니다</div>
        ) : (
          <div className="space-y-2.5">
            {users.map(u => (
              <div key={u.uid} className="bg-white rounded-2xl border border-gray-200 p-3.5">
                <div className="flex items-start justify-between gap-2 mb-2">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-semibold text-gray-900 truncate">{u.displayName || "(이름없음)"}</span>
                      {u.email === ADMIN_EMAIL && <span className="text-[10px] px-1.5 py-0.5 rounded bg-purple-100 text-purple-700">관리자</span>}
                    </div>
                    <div className="text-xs text-gray-500 truncate">{u.email}</div>
                  </div>
                  <div className="text-right shrink-0">
                    <div className="text-[11px] font-medium text-gray-700">{fmtRelative(u.lastLoginAt)}</div>
                    <div className="text-[10px] text-gray-400">가입 {fmtDate(u.createdAt)}</div>
                  </div>
                </div>

                {/* 사용량 */}
                <div className="flex flex-wrap gap-1.5 text-[11px] mb-2.5">
                  <span className="px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-100">🏘️ 매물 {u.properties}</span>
                  <span className="px-2 py-0.5 rounded-full bg-blue-50 text-blue-700 border border-blue-100">⏰ 계약 {u.contracts}</span>
                  <span className="px-2 py-0.5 rounded-full bg-orange-50 text-orange-700 border border-orange-100">👥 손님 {u.customers}</span>
                  <span className="px-2 py-0.5 rounded-full bg-gray-50 text-gray-600 border border-gray-100">📅 일정 {u.schedules}</span>
                  <span className="px-2 py-0.5 rounded-full bg-purple-50 text-purple-700 border border-purple-100 font-medium ml-auto">접속 {u.loginCount}회</span>
                </div>

                {/* 매물 열람 버튼 */}
                {u.properties > 0 && (
                  <button
                    onClick={() => openUserProperties(u)}
                    disabled={viewLoading}
                    className="w-full text-[11px] py-1.5 rounded-lg border border-emerald-300 bg-emerald-50 text-emerald-700 font-medium hover:bg-emerald-100 transition-colors disabled:opacity-50"
                  >
                    {viewLoading ? "불러오는 중…" : `🏘️ 이 유저의 매물 ${u.properties}건 열람`}
                  </button>
                )}
              </div>
            ))}
          </div>
        )}

        <p className="text-center text-[11px] text-gray-400 mt-6 leading-relaxed">
          📊 접속 기록은 이 기능 추가 시점부터 누적됩니다 · 데이터량은 실시간 집계
        </p>
      </div>

      {/* 유저 매물 열람 모달 */}
      {viewing && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50 flex items-end sm:items-center justify-center p-0 sm:p-4" onClick={() => setViewing(null)}>
          <div className="bg-white rounded-t-3xl sm:rounded-3xl w-full sm:max-w-lg max-h-[90vh] overflow-y-auto shadow-2xl" onClick={e => e.stopPropagation()}>
            <div className="sticky top-0 bg-white border-b border-gray-100 px-5 py-3 flex items-center justify-between rounded-t-3xl">
              <div>
                <h2 className="text-base font-semibold">🏘️ {viewing.user.displayName || viewing.user.email}의 매물</h2>
                <p className="text-[11px] text-gray-500">{viewing.props.length}건 · 읽기 전용</p>
              </div>
              <button onClick={() => setViewing(null)} className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-gray-100 text-gray-500 text-lg">✕</button>
            </div>
            <div className="p-4 space-y-2">
              {viewing.props.length === 0 ? (
                <p className="text-sm text-gray-400 text-center py-8">매물이 없습니다</p>
              ) : viewing.props.map(p => (
                <div key={p.id} className={`rounded-xl border p-3 ${p.status === "closed" ? "bg-gray-50/60 border-gray-200 opacity-70" : "bg-white border-gray-200"}`}>
                  <div className="flex flex-wrap items-center gap-1.5 mb-1">
                    <span className="text-[10px] px-1.5 py-0.5 rounded bg-emerald-100 text-emerald-700 font-medium">{p.dealType}</span>
                    <span className="text-[10px] px-1.5 py-0.5 rounded bg-gray-100 text-gray-600">{p.propertyType}</span>
                    {p.status === "closed" && <span className="text-[10px] px-1.5 py-0.5 rounded bg-gray-200 text-gray-600">거래완료</span>}
                    <span className="text-sm font-bold text-gray-900 ml-auto">
                      {p.dealType === "월세" ? `${p.price || "0"}/${p.monthly || "0"}만` : p.price ? `${parseInt(p.price.replace(/\D/g,""),10).toLocaleString()}만` : "—"}
                    </span>
                  </div>
                  <div className="text-sm text-gray-800 break-all">{p.address || "—"}</div>
                  <div className="flex flex-wrap gap-x-3 gap-y-0.5 text-[11px] text-gray-500 mt-1">
                    {p.ownerName && <span>집주인 {p.ownerName}</span>}
                    {p.ownerPhone && <span>{p.ownerPhone}</span>}
                    {p.leaseEndDate && <span>임대만기 {p.leaseEndDate}</span>}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
