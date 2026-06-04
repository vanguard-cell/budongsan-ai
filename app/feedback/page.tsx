"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth-context";
import {
  subscribeFeedback,
  addFeedback,
  addMessage,
  updateFeedback,
  deleteFeedback,
  ADMIN_EMAIL,
  type FeedbackItem,
} from "@/lib/feedback-db";

/** 이미지 파일 → 압축된 base64 (가로 최대 1024px, jpeg 0.7) */
function compressImage(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = e => {
      const img = new Image();
      img.onload = () => {
        const maxW = 1024;
        const scale = Math.min(1, maxW / img.width);
        const canvas = document.createElement("canvas");
        canvas.width = img.width * scale;
        canvas.height = img.height * scale;
        const ctx = canvas.getContext("2d");
        if (!ctx) return reject(new Error("canvas 오류"));
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        resolve(canvas.toDataURL("image/jpeg", 0.7));
      };
      img.onerror = reject;
      img.src = e.target?.result as string;
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

export default function FeedbackPage() {
  const router = useRouter();
  const { user, loading: authLoading, signOut } = useAuth();

  const [items, setItems] = useState<FeedbackItem[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [text, setText] = useState("");
  const [newImage, setNewImage] = useState("");
  const [submitting, setSubmitting] = useState(false);

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
    if ((!text.trim() && !newImage) || !user) return;
    setSubmitting(true);
    try {
      await addFeedback(
        user.uid,
        user.email || "",
        user.displayName || user.email || "사용자",
        text.trim(),
        newImage || undefined,
      );
      setText("");
      setNewImage("");
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      console.error("[feedback] 등록 실패:", e);
      alert(`등록 중 오류가 발생했습니다.\n\n${msg}\n\n다시 시도해주세요.`);
    } finally {
      setSubmitting(false);
    }
  };

  const handleNewImage = async (file: File | undefined) => {
    if (!file) return;
    try { setNewImage(await compressImage(file)); }
    catch { alert("이미지 처리 실패"); }
  };

  // 스레드에 메시지 추가 (관리자/문의자 공용)
  const handleSendMessage = async (id: string, t: string, image: string) => {
    if (!user) return;
    await addMessage(id, {
      sender: isAdmin ? "admin" : "user",
      senderName: isAdmin ? "관리자" : (user.displayName || user.email || "사용자"),
      text: t,
      image: image || undefined,
    });
  };

  const handleDone = async (item: FeedbackItem) => {
    await updateFeedback(item.id, {
      status: item.status === "done" ? "pending" : "done",
    });
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
          <span>👤 {user.displayName || user.email}</span>
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
              ← DealDone
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
            {/* 이미지 미리보기 */}
            {newImage && (
              <div className="mt-2 relative inline-block">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={newImage} alt="첨부" className="max-h-40 rounded-xl border border-gray-200" />
                <button onClick={() => setNewImage("")} className="absolute -top-2 -right-2 w-6 h-6 rounded-full bg-gray-800 text-white text-xs flex items-center justify-center">✕</button>
              </div>
            )}
            <div className="flex items-center justify-between mt-2">
              <label className="text-xs px-3 py-2 rounded-xl border border-gray-200 text-gray-600 hover:bg-gray-50 cursor-pointer">
                📷 사진 첨부
                <input type="file" accept="image/*" className="hidden"
                  onChange={e => { handleNewImage(e.target.files?.[0]); e.target.value = ""; }} />
              </label>
              <button
                onClick={handleSubmit}
                disabled={submitting || (!text.trim() && !newImage)}
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
              <FeedbackCard
                key={item.id}
                item={item}
                isAdmin={isAdmin}
                isMine={item.submittedBy.uid === user.uid}
                onSend={(t, img) => handleSendMessage(item.id, t, img)}
                onDone={() => handleDone(item)}
                onDelete={() => handleDelete(item.id)}
              />
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

/* ── 건의 카드 (대화 스레드) ── */
function FeedbackCard({ item, isAdmin, isMine, onSend, onDone, onDelete }: {
  item: FeedbackItem;
  isAdmin: boolean;
  isMine: boolean;
  onSend: (text: string, image: string) => Promise<void>;
  onDone: () => void;
  onDelete: () => void;
}) {
  const [msg, setMsg] = useState("");
  const [img, setImg] = useState("");
  const [sending, setSending] = useState(false);
  const [zoom, setZoom] = useState<string | null>(null);

  const pickImage = async (file: File | undefined) => {
    if (!file) return;
    try { setImg(await compressImage(file)); } catch { alert("이미지 처리 실패"); }
  };

  const send = async () => {
    if (!msg.trim() && !img) return;
    setSending(true);
    try { await onSend(msg.trim(), img); setMsg(""); setImg(""); }
    catch (e) { alert("전송 실패: " + (e instanceof Error ? e.message : String(e))); }
    finally { setSending(false); }
  };

  const fmtTime = (ms: number) =>
    new Date(ms).toLocaleString("ko-KR", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" });

  return (
    <div className={`rounded-2xl border p-4 ${item.status === "done" ? "bg-green-50/40 border-green-200" : "bg-white border-gray-200"}`}>
      {/* 헤더 */}
      <div className="flex flex-wrap items-center gap-2 mb-3">
        <span className={`text-[11px] px-2 py-0.5 rounded-full font-medium ${item.status === "done" ? "bg-green-100 text-green-700" : "bg-orange-100 text-orange-700"}`}>
          {item.status === "done" ? "✅ 처리완료" : "⏳ 대기중"}
        </span>
        {isAdmin && (
          <span className="text-[11px] px-2 py-0.5 rounded-full bg-blue-50 text-blue-600 font-medium">
            👤 {item.submittedBy.name || item.submittedBy.email}
          </span>
        )}
      </div>

      {/* 대화 스레드 (카톡 스타일) */}
      <div className="space-y-2 mb-3">
        {item.thread.map((m, i) => {
          // 관리자 화면: 관리자(나) 우측 / 사용자 좌측. 사용자 화면: 본인 우측 / 관리자 좌측
          const mine = isAdmin ? m.sender === "admin" : m.sender === "user";
          return (
            <div key={i} className={`flex ${mine ? "justify-end" : "justify-start"}`}>
              <div className={`max-w-[80%] ${mine ? "items-end" : "items-start"} flex flex-col`}>
                <span className="text-[10px] text-gray-400 mb-0.5 px-1">
                  {m.sender === "admin" ? "💬 관리자" : m.senderName} · {fmtTime(m.createdAt)}
                </span>
                <div className={`rounded-2xl px-3 py-2 ${mine ? "bg-purple-600 text-white" : "bg-gray-100 text-gray-800"}`}>
                  {m.image && (
                    /* eslint-disable-next-line @next/next/no-img-element */
                    <img src={m.image} alt="첨부" onClick={() => setZoom(m.image!)}
                      className="max-h-48 rounded-lg mb-1 cursor-zoom-in" />
                  )}
                  {m.text && <p className="text-sm leading-relaxed whitespace-pre-wrap">{m.text}</p>}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* 메시지 입력 (관리자·본인 모두) */}
      {(isAdmin || isMine) && item.status !== "done" && (
        <div className="border-t border-gray-100 pt-3">
          {img && (
            <div className="mb-2 relative inline-block">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={img} alt="첨부" className="max-h-32 rounded-lg border border-gray-200" />
              <button onClick={() => setImg("")} className="absolute -top-2 -right-2 w-6 h-6 rounded-full bg-gray-800 text-white text-xs flex items-center justify-center">✕</button>
            </div>
          )}
          <textarea
            value={msg}
            onChange={e => setMsg(e.target.value)}
            placeholder={isAdmin ? "답변을 입력하세요…" : "추가 문의나 답변을 입력하세요…"}
            rows={3}
            className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm bg-gray-50 focus:outline-none focus:ring-2 focus:ring-purple-500 resize-y leading-relaxed"
          />
          <div className="flex items-center gap-2 mt-2">
            <label className="text-xs px-3 py-1.5 rounded-lg border border-gray-200 text-gray-600 hover:bg-gray-50 cursor-pointer">
              📷 사진
              <input type="file" accept="image/*" className="hidden"
                onChange={e => { pickImage(e.target.files?.[0]); e.target.value = ""; }} />
            </label>
            <button onClick={send} disabled={sending || (!msg.trim() && !img)}
              className="text-xs px-4 py-1.5 rounded-lg bg-purple-600 text-white font-semibold hover:bg-purple-700 disabled:opacity-50 ml-auto">
              {sending ? "전송 중…" : "전송"}
            </button>
          </div>
        </div>
      )}

      {/* 액션 버튼 */}
      <div className="flex flex-wrap gap-1.5 mt-3 pt-3 border-t border-gray-100">
        {/* 처리완료 — 관리자 또는 본인(질문자). 완료 후엔 기록 보존 위해 되돌리기 없음 */}
        {(isAdmin || isMine) && item.status !== "done" && (
          <button onClick={onDone}
            className="text-[11px] px-2.5 py-1 rounded-full border border-green-300 bg-green-50 text-green-700 font-medium hover:bg-green-100 transition-colors">
            ✅ 해결됨(처리완료)
          </button>
        )}
        {(isAdmin || isMine) && (
          <button onClick={onDelete}
            className="text-[11px] px-2.5 py-1 rounded-full border border-gray-200 text-gray-400 hover:border-red-400 hover:text-red-600 transition-colors ml-auto">
            삭제
          </button>
        )}
      </div>

      {/* 이미지 확대 */}
      {zoom && (
        <div className="fixed inset-0 bg-black/80 z-[60] flex items-center justify-center p-4" onClick={() => setZoom(null)}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={zoom} alt="확대" className="max-w-full max-h-full rounded-lg" />
        </div>
      )}
    </div>
  );
}
