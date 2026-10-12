"use client";

/**
 * 직원(팀) 관리 — 초대 코드로 사무실 합류
 *
 * - 대표: 초대 코드 발급 + 멤버 목록
 * - 직원: 코드 입력 → 사무실 합류 (파트너)
 */

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth, roleTitle } from "@/lib/auth-context";
import {
  subscribeAgency, createInvite, joinAgency, upsertMyMemberInfo, removeMember,
  type AgencyDoc,
} from "@/lib/team-db";

// 복사 — 클립보드가 막힌 폰/앱 브라우저에서는 대체 방법 → 공유창 → 직접 복사 순으로 시도
async function copyText(text: string) {
  const done = () => alert("초대 안내문이 복사되었습니다.\n카톡으로 붙여넣어 보내세요!");
  try {
    await navigator.clipboard.writeText(text);
    return done();
  } catch {}
  try {
    const ta = document.createElement("textarea");
    ta.value = text;
    ta.setAttribute("readonly", "");
    ta.style.position = "fixed";
    ta.style.opacity = "0";
    document.body.appendChild(ta);
    ta.select();
    ta.setSelectionRange(0, text.length);
    const ok = document.execCommand("copy");
    document.body.removeChild(ta);
    if (ok) return done();
  } catch {}
  try {
    if (navigator.share) {
      await navigator.share({ text });
      return;
    }
  } catch {
    return;
  }
  window.prompt("아래 글을 길게 눌러 복사하세요", text);
}

export default function TeamPage() {
  const router = useRouter();
  const { user, loading: authLoading } = useAuth();
  const [agency, setAgency] = useState<AgencyDoc | null>(null);
  const [loaded, setLoaded] = useState(false);

  // 초대 코드 발급 (대표)
  const [inviteCode, setInviteCode] = useState("");
  const [creating, setCreating] = useState(false);

  // 합류 (직원)
  const [joinCode, setJoinCode] = useState("");
  const [joining, setJoining] = useState(false);
  const [joinMsg, setJoinMsg] = useState("");

  const isOwner = user?.role === "owner";

  useEffect(() => {
    if (!authLoading && !user) router.replace("/login?redirect=/team");
  }, [authLoading, user, router]);

  useEffect(() => {
    if (!user) return;
    const unsub = subscribeAgency(user.agencyId, a => { setAgency(a); setLoaded(true); });
    return () => unsub();
  }, [user]);

  // 내 이름이 memberInfo에 없으면 기록 (목록 표시용 — 최초 1회)
  useEffect(() => {
    if (!user || !agency) return;
    if (!agency.memberInfo?.[user.uid]) {
      upsertMyMemberInfo(user.agencyId, user.uid, user.displayName || "", user.email || "");
    }
  }, [user, agency]);

  const handleCreateInvite = async () => {
    if (!user || !agency) return;
    setCreating(true);
    try {
      const code = await createInvite(user.agencyId, agency.name, user.uid);
      setInviteCode(code);
    } catch (e) {
      alert("초대 코드 생성 실패: " + (e instanceof Error ? e.message : String(e)));
    } finally {
      setCreating(false);
    }
  };

  const copyInvite = () => {
    const text = `[DealDone] ${agency?.name || "사무실"} 초대\n\n1. 아래 주소로 접속 후 회원가입(또는 구글 로그인)\n${window.location.origin}\n2. 메뉴 → 직원 관리 → 초대 코드 입력\n3. 코드: ${inviteCode}\n(7일 안에, 1명만 쓸 수 있어요)`;
    copyText(text);
  };

  const handleRemove = async (uid: string, name: string) => {
    if (!user) return;
    if (!confirm(`${name || "이 직원"}님을 사무실에서 내보낼까요?\n내보내면 우리 사무실 매물·고객·일정을 더 볼 수 없어요.`)) return;
    try {
      await removeMember(user.agencyId, uid);
    } catch (e) {
      alert("내보내지 못했어요: " + (e instanceof Error ? e.message : String(e)));
    }
  };

  const handleJoin = async () => {
    if (!user || !joinCode.trim()) return;
    if (!confirm(`다른 사무실에 합류하면 지금 보던 데이터 대신\n그 사무실의 매물·고객·일정을 보게 됩니다.\n\n합류할까요?`)) return;
    setJoining(true);
    setJoinMsg("");
    try {
      const invite = await joinAgency(joinCode, user.uid, user.displayName || "", user.email || "");
      setJoinMsg(`✅ "${invite.agencyName}" 합류 완료! 잠시 후 새로고침됩니다…`);
      setTimeout(() => window.location.reload(), 1500);
    } catch (e) {
      setJoinMsg("❌ " + (e instanceof Error ? e.message : "합류에 실패했습니다."));
    } finally {
      setJoining(false);
    }
  };

  if (authLoading || !user) {
    return <div className="min-h-screen flex items-center justify-center text-gray-400 text-sm">불러오는 중…</div>;
  }

  const members = agency?.members || [];
  const memberInfo = agency?.memberInfo || {};

  return (
    <div>
      <div className="max-w-2xl mx-auto">

        {/* 헤더 */}
        <section className="mb-6">
          <h2 className="flex items-center gap-2 text-2xl sm:text-3xl font-bold text-gray-900 dark:text-gray-100">
            <span className="material-symbols-outlined text-indigo-600 dark:text-indigo-400" style={{ fontSize: "2rem" }}>groups</span>
            직원 관리
          </h2>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-1.5">
            우리 사무실 멤버 — 매물·고객·일정을 함께 봅니다
          </p>
        </section>

        {/* 멤버 목록 */}
        <div className="bg-white dark:bg-slate-900 rounded-xl border border-gray-200 dark:border-slate-700 shadow-sm overflow-hidden mb-5">
          <div className="px-4 py-3 bg-indigo-50 dark:bg-indigo-950/30 border-b border-indigo-100 dark:border-indigo-900/40 flex items-center gap-2">
            <span className="material-symbols-outlined text-indigo-600 dark:text-indigo-400" style={{ fontVariationSettings: "'FILL' 1" }}>apartment</span>
            <h3 className="font-bold text-gray-900 dark:text-gray-100 flex-1 truncate">{agency?.name || "내 사무실"}</h3>
            <span className="text-[11px] px-2 py-0.5 rounded-full bg-indigo-600 text-white font-bold">{members.length}명</span>
          </div>
          {!loaded ? (
            <div className="p-6 text-center text-gray-400 text-sm">불러오는 중…</div>
          ) : (
            <div className="divide-y divide-gray-100 dark:divide-slate-800">
              {members.map(uid => {
                const info = memberInfo[uid];
                const isAgencyOwner = uid === agency?.owner;
                const isMe = uid === user.uid;
                return (
                  <div key={uid} className="px-4 py-3 flex items-center gap-3">
                    <div className={`w-10 h-10 rounded-full flex items-center justify-center text-white font-bold shrink-0 ${isAgencyOwner ? "bg-indigo-600" : "bg-gray-400 dark:bg-slate-600"}`}>
                      {(info?.name || "?").charAt(0)}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5">
                        <span className="text-sm font-semibold text-gray-900 dark:text-gray-100 truncate">
                          {info?.name || "(이름 미등록)"}
                        </span>
                        {isMe && <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-emerald-100 text-emerald-700 font-medium">나</span>}
                      </div>
                      <div className="text-[11px] text-gray-500 dark:text-gray-400 truncate">{info?.email || uid.slice(0, 8) + "…"}</div>
                    </div>
                    <span className={`text-[11px] px-2.5 py-1 rounded-full font-bold shrink-0 ${
                      isAgencyOwner
                        ? "bg-indigo-100 dark:bg-indigo-900/40 text-indigo-700 dark:text-indigo-300"
                        : "bg-gray-100 dark:bg-slate-800 text-gray-600 dark:text-gray-300"
                    }`}>
                      {isAgencyOwner ? "👑 대표님" : "👀 직원(보기 전용)"}
                    </span>
                    {isOwner && !isAgencyOwner && !isMe && (
                      <button onClick={() => handleRemove(uid, info?.name || "")}
                        className="text-[11px] px-2.5 py-1 rounded-full border border-red-200 text-red-600 font-semibold shrink-0 whitespace-nowrap hover:bg-red-50">
                        내보내기
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* 대표 — 초대 코드 발급 */}
        {isOwner && (
          <div className="bg-white dark:bg-slate-900 rounded-xl border border-gray-200 dark:border-slate-700 shadow-sm p-4 sm:p-5 mb-5">
            <div className="flex items-center gap-1.5 text-sm font-bold text-gray-900 dark:text-gray-100 mb-1">
              <span className="material-symbols-outlined text-indigo-600 text-xl">person_add</span>
              직원 초대하기
            </div>
            <p className="text-xs text-gray-500 dark:text-gray-400 mb-3">
              초대 코드를 만들어 직원에게 카톡으로 보내세요. 직원이 코드를 입력하면 우리 사무실에 합류합니다.
            </p>
            {inviteCode ? (
              <div className="rounded-2xl bg-indigo-50 dark:bg-indigo-950/30 border-2 border-indigo-200 dark:border-indigo-800 p-4 text-center">
                <div className="text-[11px] text-indigo-600 dark:text-indigo-300 font-semibold mb-1">초대 코드</div>
                <div className="text-3xl font-extrabold tracking-[0.3em] text-indigo-700 dark:text-indigo-200 mb-1">{inviteCode}</div>
                <div className="text-[11px] text-indigo-500 dark:text-indigo-300 mb-3">7일 동안, 1명만 쓸 수 있어요 · 합류한 직원은 보기만 할 수 있어요</div>
                <div className="flex gap-2 justify-center">
                  <button onClick={copyInvite} className="text-xs px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-bold flex items-center gap-1">
                    <span className="material-symbols-outlined text-sm">content_copy</span>
                    안내문 복사 (카톡 전송용)
                  </button>
                  <button onClick={handleCreateInvite} disabled={creating} className="text-xs px-4 py-2 rounded-xl border border-indigo-300 text-indigo-700 dark:text-indigo-300 font-semibold">
                    새 코드
                  </button>
                </div>
              </div>
            ) : (
              <button
                onClick={handleCreateInvite}
                disabled={creating}
                className="w-full py-3 rounded-2xl bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-sm disabled:opacity-50 flex items-center justify-center gap-1.5"
              >
                <span className="material-symbols-outlined text-lg">qr_code_2</span>
                {creating ? "생성 중…" : "초대 코드 만들기"}
              </button>
            )}
          </div>
        )}

        {/* 타부동산 초대 — 다른 사무실이 직접 가입해서 쓰도록 가입 링크 전달 */}
        <div className="bg-white dark:bg-slate-900 rounded-xl border border-gray-200 dark:border-slate-700 shadow-sm p-4 sm:p-5 mb-5">
          <div className="flex items-center gap-1.5 text-sm font-bold text-gray-900 dark:text-gray-100 mb-1">
            <span className="material-symbols-outlined text-indigo-600 text-xl">share</span>
            타부동산 초대
          </div>
          <p className="text-xs text-gray-500 dark:text-gray-400 mb-3">
            다른 부동산 사장님께 앱을 소개할 때 쓰세요. 가입 링크를 보내면 빈 화면에서 시작하고, 우리 매물·고객·매출은 보이지 않아요.
          </p>
          <button
            onClick={() => {
              const text = `[DealDone] 부동산 업무 앱 초대\n\n아래 링크로 들어가 회원가입하세요.\n(가입할 때 부동산 이름을 적으면 됩니다)\n${window.location.origin}/login?mode=signup`;
              copyText(text);
            }}
            className="w-full py-3 rounded-2xl bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-sm flex items-center justify-center gap-1.5 whitespace-nowrap"
          >
            <span className="material-symbols-outlined text-lg">content_copy</span>
            가입 링크 복사 (카톡 전송용)
          </button>
        </div>

        {/* 초대 코드로 합류 (모두 — 직원용) */}
        <div className="bg-white dark:bg-slate-900 rounded-xl border border-gray-200 dark:border-slate-700 shadow-sm p-4 sm:p-5">
          <div className="flex items-center gap-1.5 text-sm font-bold text-gray-900 dark:text-gray-100 mb-1">
            <span className="material-symbols-outlined text-[var(--brand-blue)] text-xl">login</span>
            초대 코드로 사무실 합류
          </div>
          <p className="text-xs text-gray-500 dark:text-gray-400 mb-3">
            {roleTitle(user.role)}{isOwner ? " — 다른 사무실에 합류하면 그 사무실 데이터를 보게 됩니다" : " — 대표님께 받은 코드를 입력하세요"}
          </p>
          <div className="flex gap-2">
            <input
              value={joinCode}
              onChange={e => setJoinCode(e.target.value.toUpperCase())}
              placeholder="예: AB3K7M"
              maxLength={8}
              className="flex-1 border border-gray-200 dark:border-slate-700 rounded-xl px-3 py-2.5 text-sm bg-gray-50 dark:bg-slate-800 text-gray-900 dark:text-gray-100 tracking-widest font-bold text-center focus:outline-none focus:ring-2 focus:ring-emerald-500 uppercase"
            />
            <button
              onClick={handleJoin}
              disabled={joining || joinCode.trim().length < 4}
              className="px-5 py-2.5 rounded-xl bg-[var(--brand-blue)] hover:bg-[var(--brand-blue-dark)] text-white font-bold text-sm disabled:opacity-50"
            >
              {joining ? "합류 중…" : "합류"}
            </button>
          </div>
          {joinMsg && (
            <p className={`mt-2 text-xs ${joinMsg.startsWith("✅") ? "text-emerald-700" : "text-red-600"}`}>{joinMsg}</p>
          )}
        </div>

        <p className="text-center text-[11px] text-gray-400 mt-6">
          🔒 멤버만 사무실 데이터를 볼 수 있으며, 초대 코드 없이는 합류할 수 없습니다
        </p>
      </div>
    </div>
  );
}
