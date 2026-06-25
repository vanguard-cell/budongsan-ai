"use client";

import { useState, useEffect, useMemo } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth-context";
import SideDrawer from "@/app/components/SideDrawer";
import { fetchAllUsersUsage, summarize, ADMIN_EMAIL, type UserUsage, type UsageSummary } from "@/lib/admin-db";
import { fetchProperties, type Property } from "@/lib/properties-db";

function fmtDate(ms: number): string {
  if (!ms) return "—";
  return new Date(ms).toLocaleDateString("ko-KR", { year: "2-digit", month: "2-digit", day: "2-digit" });
}
function fmtRelative(ms: number): string {
  if (!ms) return "기록 없음";
  const diff = Date.now() - ms;
  const day = 24 * 60 * 60 * 1000;
  const days = Math.floor(diff / day);
  if (days === 0) return "오늘";
  if (days === 1) return "어제";
  if (days < 7) return `${days}일 전`;
  if (days < 30) return `${Math.floor(days / 7)}주 전`;
  return `${Math.floor(days / 30)}개월 전`;
}

type SortKey = "recent" | "name" | "props" | "loginDays" | "created";
const VIEW_KEY = "dealdone_admin_view";

export default function AdminPage() {
  const router = useRouter();
  const { user, loading: authLoading, signOut } = useAuth();
  const isAdmin = user?.email === ADMIN_EMAIL;

  const [users, setUsers] = useState<UserUsage[]>([]);
  const [summary, setSummary] = useState<UsageSummary | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState("");
  const [viewStyle, setViewStyle] = useState<"card" | "table">("table");
  const [sortBy, setSortBy] = useState<SortKey>("recent");

  // 우측 패널
  const [panelUser, setPanelUser] = useState<UserUsage | null>(null);
  const [panelProps, setPanelProps] = useState<Property[] | null>(null);
  const [panelLoading, setPanelLoading] = useState(false);

  useEffect(() => {
    try { const v = localStorage.getItem(VIEW_KEY); if (v === "card" || v === "table") setViewStyle(v); } catch {}
  }, []);
  const changeView = (v: "card" | "table") => { setViewStyle(v); try { localStorage.setItem(VIEW_KEY, v); } catch {} };

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

  const openPanel = (u: UserUsage) => { setPanelUser(u); setPanelProps(null); };
  const loadPanelProps = async () => {
    if (!panelUser?.agencyId) return;
    setPanelLoading(true);
    try { setPanelProps(await fetchProperties(panelUser.agencyId)); }
    catch (e) { alert("매물 열람 실패: " + (e instanceof Error ? e.message : String(e))); }
    finally { setPanelLoading(false); }
  };

  const sorted = useMemo(() => {
    const arr = [...users];
    switch (sortBy) {
      case "name":      arr.sort((a, b) => (a.displayName || a.email).localeCompare(b.displayName || b.email)); break;
      case "props":     arr.sort((a, b) => b.properties - a.properties); break;
      case "loginDays": arr.sort((a, b) => b.loginDaysTotal - a.loginDaysTotal); break;
      case "created":   arr.sort((a, b) => b.createdAt - a.createdAt); break;
      default:          arr.sort((a, b) => b.lastLoginAt - a.lastLoginAt);
    }
    return arr;
  }, [users, sortBy]);

  if (authLoading || !user) {
    return <div className="min-h-screen flex items-center justify-center text-gray-400 text-sm">불러오는 중…</div>;
  }
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
    <div className="min-h-screen bg-white">
      <div className={`px-6 sm:px-10 lg:px-24 pt-6 sm:pt-8 pb-12 transition-[padding] duration-300 ${panelUser ? "xl:pr-[400px]" : ""}`}>

        {/* 상단 바 */}
        <div className="flex items-center justify-between gap-2 mb-4">
          <span className="inline-flex items-center gap-1.5 bg-purple-600 text-white px-3 py-1.5 rounded-full text-sm font-bold">
            <span className="material-symbols-outlined text-base">monitoring</span> 유저 사용 현황
          </span>
          <div className="flex items-center gap-2 text-[11px] text-gray-500">
            <Link href="/dashboard" className="px-2.5 py-1 rounded-lg border border-gray-200 hover:border-blue-400 hover:text-blue-600 transition-colors">← 홈</Link>
            <Link href="/feedback" className="px-2.5 py-1 rounded-lg border border-gray-200 hover:border-purple-400 hover:text-purple-600 transition-colors">건의함</Link>
            <button onClick={() => { if (confirm("로그아웃?")) signOut(); }} className="hover:text-blue-600">로그아웃</button>
          </div>
        </div>

        <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-3 mb-5">
          <div>
            <h1 className="text-xl sm:text-2xl font-bold text-gray-900">전체 유저 관리</h1>
            <p className="text-gray-500 text-xs sm:text-sm mt-1">접속·데이터량 — 유료 전환 검토용</p>
          </div>
          {/* 카드/표 토글 */}
          <div className="inline-flex self-start sm:self-auto rounded-lg border border-gray-200 overflow-hidden text-xs font-semibold">
            <button onClick={() => changeView("card")} className={`px-3 py-2 flex items-center gap-1 transition-colors ${viewStyle === "card" ? "bg-purple-50 text-purple-700" : "bg-white text-gray-500 hover:text-gray-800"}`}>
              <span className="material-symbols-outlined text-[15px] leading-none">grid_view</span>카드
            </button>
            <button onClick={() => changeView("table")} className={`px-3 py-2 flex items-center gap-1 transition-colors ${viewStyle === "table" ? "bg-purple-50 text-purple-700" : "bg-white text-gray-500 hover:text-gray-800"}`}>
              <span className="material-symbols-outlined text-[15px] leading-none">table_rows</span>표
            </button>
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

        {!loaded ? (
          <div className="text-center text-gray-400 py-12">불러오는 중…</div>
        ) : users.length === 0 ? (
          <div className="bg-white rounded-xl border border-gray-200 p-8 text-center text-gray-500">아직 가입한 유저가 없습니다</div>
        ) : viewStyle === "table" ? (
          /* ── 표 뷰 ── */
          <div className="overflow-x-auto border border-gray-200 rounded-2xl bg-white">
            <table className="w-full text-xs" style={{ minWidth: 720 }}>
              <thead>
                <tr className="bg-gray-50 text-gray-500 text-left">
                  <Th label="유저" onClick={() => setSortBy("name")} active={sortBy === "name"} />
                  <Th label="마지막 접속" onClick={() => setSortBy("recent")} active={sortBy === "recent"} />
                  <th className="px-2 py-2.5 font-medium text-center">오늘</th>
                  <Th label="주·월·누적" onClick={() => setSortBy("loginDays")} active={sortBy === "loginDays"} center />
                  <Th label="매물" onClick={() => setSortBy("props")} active={sortBy === "props"} right />
                  <th className="px-2 py-2.5 font-medium text-right">계약</th>
                  <th className="px-2 py-2.5 font-medium text-right">고객</th>
                  <th className="px-2 py-2.5 font-medium text-right">일정</th>
                  <Th label="가입" onClick={() => setSortBy("created")} active={sortBy === "created"} />
                </tr>
              </thead>
              <tbody>
                {sorted.map(u => (
                  <tr key={u.uid} onClick={() => openPanel(u)}
                    className={`border-t border-gray-100 cursor-pointer transition-colors ${panelUser?.uid === u.uid ? "bg-purple-50" : "hover:bg-gray-50"}`}>
                    <td className="px-3 py-2.5">
                      <div className="flex items-center gap-1.5">
                        <span className="font-semibold text-gray-900">{u.displayName || "(이름없음)"}</span>
                        {u.email === ADMIN_EMAIL && <span className="text-[10px] px-1.5 py-0.5 rounded bg-purple-100 text-purple-700">관리자</span>}
                      </div>
                      <div className="text-[11px] text-gray-400 truncate max-w-[180px]">{u.email}</div>
                    </td>
                    <td className={`px-2 py-2.5 ${u.lastLoginAt && Date.now() - u.lastLoginAt < 86400000 ? "text-emerald-600 font-medium" : "text-gray-500"}`}>{fmtRelative(u.lastLoginAt)}</td>
                    <td className="px-2 py-2.5 text-center">
                      <span className={`inline-block w-2 h-2 rounded-full ${u.loginDaysToday ? "bg-emerald-500" : "bg-gray-200"}`} />
                    </td>
                    <td className="px-2 py-2.5 text-center text-gray-600 tabular-nums">{u.loginDaysWeek} · {u.loginDaysMonth} · {u.loginDaysTotal}</td>
                    <td className="px-2 py-2.5 text-right font-semibold text-gray-900 tabular-nums">{u.properties}</td>
                    <td className="px-2 py-2.5 text-right text-gray-600 tabular-nums">{u.contracts}</td>
                    <td className="px-2 py-2.5 text-right text-gray-600 tabular-nums">{u.customers}</td>
                    <td className="px-2 py-2.5 text-right text-gray-600 tabular-nums">{u.schedules}</td>
                    <td className="px-3 py-2.5 text-gray-400">{fmtDate(u.createdAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          /* ── 카드 뷰 ── */
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
            {sorted.map(u => (
              <div key={u.uid} onClick={() => openPanel(u)}
                className={`bg-white rounded-2xl border p-3.5 cursor-pointer transition-all hover:shadow-sm ${panelUser?.uid === u.uid ? "border-purple-400 ring-1 ring-purple-300" : "border-gray-200 hover:border-purple-300"}`}>
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
                <div className="flex flex-wrap gap-1.5 text-[11px]">
                  <span className="px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-100">🏘️ {u.properties}</span>
                  <span className="px-2 py-0.5 rounded-full bg-blue-50 text-blue-700 border border-blue-100">⏰ {u.contracts}</span>
                  <span className="px-2 py-0.5 rounded-full bg-orange-50 text-orange-700 border border-orange-100">👥 {u.customers}</span>
                  <span className="px-2 py-0.5 rounded-full bg-gray-50 text-gray-600 border border-gray-100">📅 {u.schedules}</span>
                  <span className="px-2 py-0.5 rounded-full bg-indigo-50 text-indigo-700 border border-indigo-100">접속 누적 {u.loginDaysTotal}일</span>
                </div>
              </div>
            ))}
          </div>
        )}

        <p className="text-center text-[11px] text-gray-400 mt-6 leading-relaxed">
          📊 접속 기록은 이 기능 추가 시점부터 누적됩니다 · 데이터량은 실시간 집계
        </p>
      </div>

      {/* 우측 상세 패널 */}
      {panelUser && (
        <SideDrawer open onClose={() => setPanelUser(null)} title={panelUser.displayName || panelUser.email} icon="person" accent="#534AB7">
          <div className="px-1 space-y-4">
            {/* 기본 정보 */}
            <div>
              <div className="flex items-center gap-2">
                <span className="font-bold text-[15px] text-gray-900">{panelUser.displayName || "(이름없음)"}</span>
                {panelUser.email === ADMIN_EMAIL && <span className="text-[10px] px-1.5 py-0.5 rounded bg-purple-100 text-purple-700">관리자</span>}
              </div>
              <div className="text-xs text-gray-500 break-all">{panelUser.email}</div>
              <div className="text-[11px] text-gray-400 mt-1">가입 {fmtDate(panelUser.createdAt)} · 마지막 접속 {fmtRelative(panelUser.lastLoginAt)}</div>
            </div>

            {/* 접속일 */}
            <div>
              <div className="text-[11px] font-bold text-gray-500 mb-1.5">접속일</div>
              <div className="grid grid-cols-4 gap-1.5 text-center">
                {[
                  { l: "오늘", v: panelUser.loginDaysToday ? "접속" : "미접속", on: !!panelUser.loginDaysToday },
                  { l: "주", v: `${panelUser.loginDaysWeek}일`, on: true },
                  { l: "월", v: `${panelUser.loginDaysMonth}일`, on: true },
                  { l: "누적", v: `${panelUser.loginDaysTotal}일`, on: true },
                ].map(x => (
                  <div key={x.l} className={`rounded-xl border py-2 ${x.on ? "bg-indigo-50 border-indigo-100" : "bg-gray-50 border-gray-100"}`}>
                    <div className={`text-sm font-bold ${x.on ? "text-indigo-700" : "text-gray-400"}`}>{x.v}</div>
                    <div className="text-[10px] text-gray-400">{x.l}</div>
                  </div>
                ))}
              </div>
            </div>

            {/* 데이터 내역 */}
            <div>
              <div className="text-[11px] font-bold text-gray-500 mb-1.5">데이터 내역</div>
              <div className="grid grid-cols-4 gap-1.5 text-center">
                {[
                  { l: "매물", v: panelUser.properties, c: "text-emerald-700 bg-emerald-50 border-emerald-100" },
                  { l: "계약", v: panelUser.contracts, c: "text-blue-700 bg-blue-50 border-blue-100" },
                  { l: "고객", v: panelUser.customers, c: "text-orange-700 bg-orange-50 border-orange-100" },
                  { l: "일정", v: panelUser.schedules, c: "text-gray-600 bg-gray-50 border-gray-100" },
                ].map(x => (
                  <div key={x.l} className={`rounded-xl border py-2 ${x.c}`}>
                    <div className="text-sm font-bold tabular-nums">{x.v}</div>
                    <div className="text-[10px] opacity-70">{x.l}</div>
                  </div>
                ))}
              </div>
            </div>

            {/* 메뉴별 사용량 — 단순화 근거 (많이 쓰는 순) */}
            {(() => {
              const PAGE_LABEL: Record<string, string> = {
                dashboard: "홈", properties: "매물", expiry: "만기", customers: "고객",
                schedule: "스케줄", sales: "매출", insights: "인사이트", "market-price": "실거래",
                team: "직원", feedback: "건의함", admin: "유저관리", more: "더보기", "ai-content": "AI문구",
              };
              const entries = Object.entries(panelUser.pageViews || {})
                .filter(([, n]) => n > 0)
                .sort((a, b) => b[1] - a[1]);
              const max = entries[0]?.[1] || 1;
              return (
                <div>
                  <div className="text-[11px] font-bold text-gray-500 mb-1.5">메뉴별 사용량 (많이 쓰는 순)</div>
                  {entries.length === 0 ? (
                    <div className="text-[11px] text-gray-400 py-2">아직 사용 기록이 없습니다 — 이 기능 추가 후 방문부터 누적됩니다.</div>
                  ) : (
                    <div className="space-y-1">
                      {entries.map(([key, n]) => (
                        <div key={key} className="flex items-center gap-2">
                          <div className="w-14 text-[11px] text-gray-600 shrink-0 text-right">{PAGE_LABEL[key] || key}</div>
                          <div className="flex-1 h-4 rounded bg-gray-100 overflow-hidden">
                            <div className="h-4 rounded bg-indigo-400" style={{ width: `${Math.max(4, (n / max) * 100)}%` }} />
                          </div>
                          <div className="w-10 text-[11px] text-gray-500 tabular-nums text-right shrink-0">{n}회</div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              );
            })()}

            {/* 기능별 사용량 — 단순화 근거 (메뉴 방문보다 정밀, 많이 쓰는 순) */}
            {(() => {
              const FEATURE_LABEL: Record<string, string> = {
                prop_add: "매물 등록", prop_edit: "매물 수정", prop_contract: "계약 진행",
                prop_to_expiry: "만기로 보내기", prop_same: "같은단지 추가", prop_excel: "매물 엑셀업로드",
                complex_pick: "단지 선택", cust_add: "고객 등록", cust_kakao: "카톡 붙여넣기",
                cust_stage: "고객 단계이동", cust_log: "고객 여정기록",
                contract_renew: "재계약(연장)", contract_reopen: "매물로 되돌리기", contract_close: "관리 종료",
                sched_add: "스케줄 추가", sched_done: "스케줄 완료",
                mp_bulk: "실거래 평형별조회", mp_manual: "실거래 직접입력",
                ai_generate: "AI 문구생성", fb_new: "건의함 작성",
                cust_view_table: "고객 표뷰", cust_board_open: "고객 보드열기", cust_filter: "고객 필터",
                prop_view_table: "매물 표뷰", sales_period: "매출 기간선택", insights_period: "인사이트 기간선택",
              };
              const entries = Object.entries(panelUser.features || {})
                .filter(([, n]) => n > 0)
                .sort((a, b) => b[1] - a[1]);
              const max = entries[0]?.[1] || 1;
              return (
                <div>
                  <div className="text-[11px] font-bold text-gray-500 mb-1.5">기능별 사용량 (실제 행동, 많이 쓰는 순)</div>
                  {entries.length === 0 ? (
                    <div className="text-[11px] text-gray-400 py-2">아직 기능 사용 기록이 없습니다 — 이 기능 추가 후 행동부터 누적됩니다.</div>
                  ) : (
                    <div className="space-y-1">
                      {entries.map(([key, n]) => (
                        <div key={key} className="flex items-center gap-2">
                          <div className="w-20 text-[11px] text-gray-600 shrink-0 text-right">{FEATURE_LABEL[key] || key}</div>
                          <div className="flex-1 h-4 rounded bg-gray-100 overflow-hidden">
                            <div className="h-4 rounded bg-emerald-400" style={{ width: `${Math.max(4, (n / max) * 100)}%` }} />
                          </div>
                          <div className="w-10 text-[11px] text-gray-500 tabular-nums text-right shrink-0">{n}회</div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              );
            })()}

            {/* 매물 열람 */}
            <div>
              {panelProps === null ? (
                panelUser.properties > 0 ? (
                  <button onClick={loadPanelProps} disabled={panelLoading}
                    className="w-full text-[12px] py-2.5 rounded-lg border border-emerald-300 bg-emerald-50 text-emerald-700 font-bold hover:bg-emerald-100 disabled:opacity-50 flex items-center justify-center gap-1.5">
                    <span className="material-symbols-outlined text-[16px]">domain</span>
                    {panelLoading ? "불러오는 중…" : `이 유저의 매물 ${panelUser.properties}건 열람`}
                  </button>
                ) : (
                  <div className="text-[11px] text-gray-400 text-center py-2">등록된 매물이 없습니다</div>
                )
              ) : (
                <div>
                  <div className="text-[11px] font-bold text-gray-500 mb-1.5">매물 {panelProps.length}건 (읽기 전용)</div>
                  <div className="space-y-1.5 max-h-[40vh] overflow-y-auto pr-0.5">
                    {panelProps.map(p => (
                      <div key={p.id} className={`rounded-lg border p-2 ${p.status === "closed" ? "bg-gray-50/60 border-gray-200 opacity-70" : "bg-white border-gray-200"}`}>
                        <div className="flex items-center gap-1.5 mb-0.5">
                          <span className="text-[10px] px-1.5 py-0.5 rounded bg-emerald-100 text-emerald-700 font-medium">{p.dealType}</span>
                          <span className="text-[10px] px-1.5 py-0.5 rounded bg-gray-100 text-gray-600">{p.propertyType}</span>
                          <span className="text-[12px] font-bold text-gray-900 ml-auto">
                            {p.dealType === "월세" ? `${p.price || "0"}/${p.monthly || "0"}만` : p.price ? `${parseInt(p.price.replace(/\D/g, ""), 10).toLocaleString()}만` : "—"}
                          </span>
                        </div>
                        <div className="text-[12px] text-gray-700 break-all">{p.address || "—"}</div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        </SideDrawer>
      )}
    </div>
  );
}

/* 정렬 가능한 헤더 셀 */
function Th({ label, onClick, active, right, center }: { label: string; onClick: () => void; active: boolean; right?: boolean; center?: boolean }) {
  return (
    <th className={`px-2 py-2.5 font-medium whitespace-nowrap ${right ? "text-right" : center ? "text-center" : "text-left"}`}>
      <button onClick={e => { e.stopPropagation(); onClick(); }} className={`inline-flex items-center gap-0.5 hover:text-purple-600 transition-colors ${active ? "text-purple-700 font-bold" : ""}`}>
        {label}
        {active && <span className="material-symbols-outlined text-[13px]">arrow_downward</span>}
      </button>
    </th>
  );
}
