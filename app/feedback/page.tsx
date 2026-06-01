"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth-context";
import {
  subscribeFeedback,
  addFeedback,
  updateFeedback,
  deleteFeedback,
  ADMIN_EMAIL,
  type FeedbackItem,
} from "@/lib/feedback-db";

export default function FeedbackPage() {
  const router = useRouter();
  const { user, loading: authLoading, signOut } = useAuth();

  const [items, setItems] = useState<FeedbackItem[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [text, setText] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [replyingId, setReplyingId] = useState<string | null>(null);
  const [replyText, setReplyText] = useState("");

  const isAdmin = user?.email === ADMIN_EMAIL;

  /* 로그인 가드 */
  useEffect(() => {
    if (!authLoading && !user) router.replace("/login?redirect=/feedback");
  }, [authLoading, user, router]);

  /* 실시간 구독 */
  useEffect(() => {
    if (!user) return;
    const unsub = subscribeFeedback(user.uid, isAdmin, list => {
      setItems(list);
      setLoaded(true);
    });
    return () => unsub();
  }, [user, isAdmin]);

  const handleSubmit = async () => {
    if (!text.trim() || !user) return;
    setSubmitting(true);
    try {
      await addFeedback(
        user.uid,
        user.email || "",
        user.displayName || user.email || "사용자",
        text.trim(),
      );
      setText("");
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      console.error("[feedback] 등록 실패:", e);
      alert(`등록 중 오류가 발생했습니다.\n\n${msg}\n\n다시 시도해주세요.`);
    } finally {
      setSubmitting(false);
    }
  };

  const handleDone = async (item: FeedbackItem) => {
    await updateFeedback(item.id, {
      status: item.status === "done" ? "pending" : "done",
    });
  };

  const handleReplySubmit = async (id: string) => {
    if (!replyText.trim()) return;
    await updateFeedback(id, { reply: replyText.trim() });
    setReplyingId(null);
    setReplyText("");
  };

  const handleDelete = async (id: string) => {
    if (!confirm("이 건의 내용을 삭제할까요?")) return;
    await deleteFeedback(id);
  };

  if (authLoading || !user) {
    return <div className="min-h-screen flex items-center justify-center text-gray-400 text-sm">불러오는 중…</div>;
  }

  const pendingCount = items.filter(i => i.status === "pending").length;

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-purple-50">
      <div className="max-w-2xl mx-auto px-3 sm:px-4 py-5 sm:py-8">

        {/* 사용자 바 */}
        <div className="flex items-center justify-end gap-2 mb-3 text-[11px] text-gray-500">
          {isAdmin && (
            <span className="px-2 py-0.5 rounded-full bg-purple-100 text-purple-700 font-medium">
              👑 관리자
            </span>
          )}
          <span>👤 {user.displayName || user.email} ({user.email})</span>
          <span className="text-gray-300">·</span>
          <button
            onClick={() => { if (confirm("로그아웃 하시겠어요?")) signOut(); }}
            className="hover:text-blue-600 hover:underline"
          >
            로그아웃
          </button>
        </div>

        {/* 헤더 */}
        <div className="text-center mb-6">
          <div className="inline-flex items-center gap-2 bg-purple-600 text-white px-4 py-1.5 rounded-full text-sm font-medium mb-3">
            📬 건의함
          </div>
          <h1 className="text-xl sm:text-2xl font-bold text-gray-900 mb-1">
            {isAdmin ? "전체 건의사항 관리" : "수정 요청 / 건의사항"}
          </h1>
          <p className="text-gray-500 text-xs sm:text-sm mb-4">
            {isAdmin
              ? `처리 대기 ${pendingCount}건 · 전체 ${items.length}건`
              : "불편한 점이나 바꿔줬으면 하는 것을 적어주세요"}
          </p>
          <div className="flex flex-wrap gap-2 justify-center">
            <Link href="/expiry" className="text-xs sm:text-sm px-3 sm:px-4 py-2 rounded-full border border-gray-300 hover:border-blue-500 hover:text-blue-600 transition-colors">
              ⏰ 만기 관리
            </Link>
            <Link href="/customers" className="text-xs sm:text-sm px-3 sm:px-4 py-2 rounded-full border border-gray-300 hover:border-blue-500 hover:text-blue-600 transition-colors">
              👥 손님 관리
            </Link>
            <Link href="/" className="text-xs sm:text-sm px-3 sm:px-4 py-2 rounded-full border border-gray-300 hover:border-blue-500 hover:text-blue-600 transition-colors">
              ← 매물 도우미
            </Link>
          </div>
        </div>

        {/* 새 건의 입력 (일반 사용자만) */}
        {!isAdmin && (
          <div className="bg-white rounded-3xl border border-gray-200 shadow-sm p-4 sm:p-5 mb-5">
            <div className="text-sm font-semibold text-gray-800 mb-3">✏️ 새 건의사항 작성</div>
            <textarea
              value={text}
              onChange={e => setText(e.target.value)}
              placeholder={"예: 만기 알림에서 메모 칸을 더 크게 해줬으면 좋겠어요\n예: 엑셀 업로드할 때 오류 메시지가 떠요"}
              rows={4}
              className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm bg-gray-50 focus:outline-none focus:ring-2 focus:ring-purple-500 resize-none leading-relaxed"
            />
            <div className="flex justify-end mt-2">
              <button
                onClick={handleSubmit}
                disabled={submitting || !text.trim()}
                className="px-5 py-2.5 rounded-xl bg-purple-600 text-white text-sm font-semibold hover:bg-purple-700 disabled:opacity-50 transition-colors"
              >
                {submitting ? "등록 중…" : "등록하기"}
              </button>
            </div>
          </div>
        )}

        {/* 관리자 — 빠른 입력 (테스트용) */}
        {isAdmin && (
          <div className="bg-purple-50 border border-purple-200 rounded-2xl px-4 py-3 mb-5 text-xs text-purple-700">
            👑 관리자 모드 — 모든 사용자의 건의사항이 표시됩니다. 답변 달기 및 처리완료 표시 가능.
          </div>
        )}

        {/* 목록 */}
        {!loaded ? (
          <div className="text-center text-gray-400 py-12">불러오는 중…</div>
        ) : items.length === 0 ? (
          <div className="bg-white rounded-3xl border border-gray-200 shadow-sm p-8 text-center">
            <div className="text-5xl mb-3">📭</div>
            <div className="text-base font-semibold text-gray-900 mb-1">
              {isAdmin ? "아직 건의사항이 없습니다" : "아직 작성한 건의사항이 없습니다"}
            </div>
            <div className="text-xs text-gray-500">
              {isAdmin ? "사용자들이 건의사항을 등록하면 여기에 표시됩니다" : "불편한 점이나 수정 요청을 위에 작성해주세요"}
            </div>
          </div>
        ) : (
          <div className="space-y-2.5">
            {items.map(item => (
              <div
                key={item.id}
                className={`rounded-2xl border p-4 ${
                  item.status === "done"
                    ? "bg-green-50/50 border-green-200 opacity-80"
                    : "bg-white border-gray-200"
                }`}
              >
                <div className="flex items-start gap-3">
                  <div className="flex-1 min-w-0">

                    {/* 상태 + 날짜 + (관리자면 제출자 정보) */}
                    <div className="flex flex-wrap items-center gap-2 mb-1.5">
                      <span className={`text-[11px] px-2 py-0.5 rounded-full font-medium ${
                        item.status === "done"
                          ? "bg-green-100 text-green-700"
                          : "bg-orange-100 text-orange-700"
                      }`}>
                        {item.status === "done" ? "✅ 처리완료" : "⏳ 대기중"}
                      </span>
                      {isAdmin && (
                        <span className="text-[11px] px-2 py-0.5 rounded-full bg-blue-50 text-blue-600 font-medium">
                          👤 {item.submittedBy.name || item.submittedBy.email}
                        </span>
                      )}
                      <span className="text-[11px] text-gray-400">
                        {new Date(item.createdAt).toLocaleDateString("ko-KR", {
                          month: "long", day: "numeric", hour: "2-digit", minute: "2-digit",
                        })}
                      </span>
                    </div>

                    <p className="text-sm text-gray-800 leading-relaxed whitespace-pre-wrap">{item.text}</p>

                    {/* 답변 */}
                    {item.reply && (
                      <div className="mt-2 bg-blue-50 border border-blue-100 rounded-xl px-3 py-2">
                        <div className="text-[10px] font-semibold text-blue-700 mb-0.5">💬 관리자 답변</div>
                        <p className="text-xs text-gray-700 leading-relaxed whitespace-pre-wrap">{item.reply}</p>
                      </div>
                    )}

                    {/* 답변 입력 폼 (관리자만) */}
                    {isAdmin && replyingId === item.id && (
                      <div className="mt-2 space-y-1.5">
                        <textarea
                          value={replyText}
                          onChange={e => setReplyText(e.target.value)}
                          placeholder="답변 내용을 입력하세요"
                          rows={2}
                          className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm bg-gray-50 focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
                        />
                        <div className="flex gap-1.5">
                          <button
                            onClick={() => { setReplyingId(null); setReplyText(""); }}
                            className="text-xs px-3 py-1.5 rounded-full border border-gray-200 text-gray-600 hover:bg-gray-50"
                          >
                            취소
                          </button>
                          <button
                            onClick={() => handleReplySubmit(item.id)}
                            disabled={!replyText.trim()}
                            className="text-xs px-3 py-1.5 rounded-full bg-blue-600 text-white font-medium hover:bg-blue-700 disabled:opacity-50"
                          >
                            답변 저장
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                </div>

                {/* 액션 버튼 */}
                <div className="flex flex-wrap gap-1.5 mt-3 pt-3 border-t border-gray-100">
                  {/* 관리자 전용 버튼 */}
                  {isAdmin && (
                    <>
                      <button
                        onClick={() => handleDone(item)}
                        className={`text-[11px] px-2.5 py-1 rounded-full border transition-colors ${
                          item.status === "done"
                            ? "border-gray-200 text-gray-500 hover:border-orange-400 hover:text-orange-600"
                            : "border-gray-200 text-gray-600 hover:border-green-400 hover:text-green-600"
                        }`}
                      >
                        {item.status === "done" ? "대기중으로 되돌리기" : "처리완료 표시"}
                      </button>
                      <button
                        onClick={() => {
                          setReplyingId(item.id);
                          setReplyText(item.reply || "");
                        }}
                        className="text-[11px] px-2.5 py-1 rounded-full border border-gray-200 text-gray-600 hover:border-blue-400 hover:text-blue-600 transition-colors"
                      >
                        {item.reply ? "답변 수정" : "답변 달기"}
                      </button>
                    </>
                  )}
                  {/* 본인 글 삭제 (관리자 또는 본인) */}
                  {(isAdmin || item.submittedBy.uid === user.uid) && (
                    <button
                      onClick={() => handleDelete(item.id)}
                      className="text-[11px] px-2.5 py-1 rounded-full border border-gray-200 text-gray-400 hover:border-red-400 hover:text-red-600 transition-colors ml-auto"
                    >
                      삭제
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}

        <p className="text-center text-[11px] text-gray-400 mt-6">
          ☁️ 내용은 클라우드에 저장되어 PC·폰에서 모두 확인 가능합니다
        </p>
      </div>
    </div>
  );
}
