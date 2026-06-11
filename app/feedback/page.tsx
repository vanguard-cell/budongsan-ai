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
  markDone,
  markPending,
  confirmByUser,
  ADMIN_EMAIL,
  type FeedbackItem,
} from "@/lib/feedback-db";

type FeedbackFilter = "all" | "pending" | "done";

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
  const [filter, setFilter] = useState<FeedbackFilter>("all");   // 관리자 필터 탭

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

  // 처리완료 토글 — done 시 유저 확인 대기 리셋, 되돌리면 pending
  const handleDone = async (item: FeedbackItem) => {
    if (item.status === "done") await markPending(item.id);
    else await markDone(item.id);
  };

  // 문의자가 "확인했어요" 누름
  const handleConfirm = async (id: string) => {
    await confirmByUser(id);
  };

  const handleDelete = async (id: string) => {
    if (!confirm("이 건의 내용을 삭제할까요?")) return;
    await deleteFeedback(id);
  };

  if (authLoading || !user) {
    return <div className="min-h-screen flex items-center justify-center text-gray-400 text-sm">불러오는 중…</div>;
  }

  const pendingCount = items.filter(i => i.status === "pending").length;
  const doneCount = items.filter(i => i.status === "done").length;
  // 관리자: 완료했지만 유저가 아직 확인 안 한 건 (닥달 대상)
  const unconfirmedDone = items.filter(i => i.status === "done" && !i.userConfirmed);
  // 유저: 확인 대기중인 처리완료 건 (본인 글)
  const myAwaitingConfirm = items.filter(i => i.status === "done" && !i.userConfirmed && i.submittedBy.uid === user.uid);

  // 필터 적용 (관리자만 탭 사용)
  const visibleItems = isAdmin
    ? items.filter(i => filter === "all" ? true : i.status === filter)
    : items;

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
            <div className="flex items-center justify-between mb-2">
              <div className="text-sm font-semibold text-gray-800">✏️ 새 건의사항 작성</div>
              {items.length > 0 && (
                <span className="text-[10px] text-purple-600 bg-purple-50 px-2 py-0.5 rounded-full font-medium">
                  💡 기존 건의는 아래 카드에서 답글로 추가
                </span>
              )}
            </div>
            {/* 안내문 — 같은 건의에 추가 의견은 답글로 */}
            {items.length > 0 && (
              <div className="mb-3 p-2.5 rounded-xl bg-gradient-to-r from-purple-50 to-pink-50 border border-purple-200 text-[11px] text-purple-800 leading-relaxed">
                💬 <b>새로운 주제</b>일 때만 여기에 작성하세요.<br />
                기존 건의에 <b>이어서 의견 추가</b>는 아래 각 카드 안의 <b>「추가 메시지 입력」</b>란을 사용하면 같은 글에서 대화처럼 이어집니다.
              </div>
            )}
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
                {submitting ? "등록 중…" : "새 주제로 등록"}
              </button>
            </div>
          </div>
        )}

        {/* 유저 — 확인 대기중인 처리완료 건 배너 (확인 독촉) */}
        {!isAdmin && myAwaitingConfirm.length > 0 && (
          <div className="mb-5 rounded-3xl border-2 border-emerald-300 bg-gradient-to-br from-emerald-50 to-teal-50 p-4 shadow-sm">
            <div className="flex items-start gap-2 mb-2">
              <span className="text-2xl">✅</span>
              <div className="flex-1">
                <div className="text-sm font-bold text-emerald-800">
                  처리완료된 건의 {myAwaitingConfirm.length}건이 있어요!
                </div>
                <div className="text-xs text-emerald-700 mt-0.5">
                  아래 글을 확인하시고 <b>「확인했어요」</b> 버튼을 눌러주세요 👇
                </div>
              </div>
            </div>
            <div className="space-y-1.5 mt-2">
              {myAwaitingConfirm.map(it => (
                <div key={it.id} className="flex items-center gap-2 bg-white rounded-xl px-3 py-2 border border-emerald-200">
                  <span className="material-symbols-outlined text-emerald-600 text-base">check_circle</span>
                  <span className="text-xs text-gray-700 flex-1 min-w-0 truncate">{it.thread[0]?.text || it.text}</span>
                  <button
                    onClick={() => handleConfirm(it.id)}
                    className="text-[11px] px-3 py-1.5 rounded-full bg-[var(--brand-blue)] text-white font-bold hover:bg-[var(--brand-blue-dark)] shrink-0"
                  >
                    확인했어요
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* 관리자 — 모드 안내 + 미확인 완료건 추적 */}
        {isAdmin && (
          <div className="space-y-3 mb-5">
            <div className="bg-purple-50 border border-purple-200 rounded-2xl px-4 py-3 text-xs text-purple-700">
              👑 관리자 모드 — 모든 사용자 건의 표시. 답변·처리완료·확인 추적 가능.
            </div>
            {/* 닥달 대상: 처리완료했지만 유저 미확인 */}
            {unconfirmedDone.length > 0 && (
              <div className="rounded-2xl border-2 border-amber-300 bg-amber-50 px-4 py-3">
                <div className="flex items-center gap-2 text-sm font-bold text-amber-800">
                  <span className="material-symbols-outlined text-amber-600">notifications_active</span>
                  처리완료 후 유저 미확인 {unconfirmedDone.length}건
                </div>
                <div className="text-[11px] text-amber-700 mt-1">
                  유저가 아직 확인 안 한 완료건이에요. 답글로 「확인 부탁드려요」 한 번 더 남겨보세요.
                </div>
              </div>
            )}
          </div>
        )}

        {/* 관리자 — 전체/미처리/완료 필터 탭 */}
        {isAdmin && items.length > 0 && (
          <div className="flex gap-1.5 mb-4">
            {([
              { key: "all" as const,     label: "전체",   count: items.length,  color: "purple" },
              { key: "pending" as const, label: "미처리", count: pendingCount,  color: "orange" },
              { key: "done" as const,    label: "완료",   count: doneCount,     color: "green" },
            ]).map(t => {
              const active = filter === t.key;
              return (
                <button
                  key={t.key}
                  onClick={() => setFilter(t.key)}
                  className={`flex-1 py-2.5 rounded-2xl text-sm font-bold border transition-all ${
                    active
                      ? t.color === "purple" ? "bg-purple-600 text-white border-purple-600"
                      : t.color === "orange" ? "bg-orange-500 text-white border-orange-500"
                      : "bg-green-600 text-white border-green-600"
                      : "bg-white text-gray-600 border-gray-200 hover:border-gray-300"
                  }`}
                >
                  {t.label} <span className={active ? "opacity-90" : "text-gray-400"}>{t.count}</span>
                </button>
              );
            })}
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
        ) : visibleItems.length === 0 ? (
          <div className="bg-white rounded-3xl border border-gray-200 shadow-sm p-8 text-center text-sm text-gray-500">
            {filter === "pending" ? "미처리 건의가 없습니다 🎉" : filter === "done" ? "완료된 건의가 없습니다" : "표시할 건의가 없습니다"}
          </div>
        ) : (
          <div className="space-y-2.5">
            {visibleItems.map(item => (
              <FeedbackCard
                key={item.id}
                item={item}
                isAdmin={isAdmin}
                isMine={item.submittedBy.uid === user.uid}
                onSend={(t, img) => handleSendMessage(item.id, t, img)}
                onDone={() => handleDone(item)}
                onConfirm={() => handleConfirm(item.id)}
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
function FeedbackCard({ item, isAdmin, isMine, onSend, onDone, onConfirm, onDelete }: {
  item: FeedbackItem;
  isAdmin: boolean;
  isMine: boolean;
  onSend: (text: string, image: string) => Promise<void>;
  onDone: () => void;
  onConfirm: () => void;
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
        {/* 확인 상태 배지 — 처리완료 건만 */}
        {item.status === "done" && (
          item.userConfirmed ? (
            <span className="text-[11px] px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-700 font-medium flex items-center gap-0.5">
              <span className="material-symbols-outlined text-xs">how_to_reg</span> 확인됨
            </span>
          ) : (
            <span className="text-[11px] px-2 py-0.5 rounded-full bg-amber-100 text-amber-700 font-bold flex items-center gap-0.5 animate-pulse">
              <span className="material-symbols-outlined text-xs">hourglass_top</span> 확인 대기
            </span>
          )
        )}
        {isAdmin && (
          <span className="text-[11px] px-2 py-0.5 rounded-full bg-blue-50 text-blue-600 font-medium">
            👤 {item.submittedBy.name || item.submittedBy.email}
          </span>
        )}
      </div>

      {/* 유저(본인) — 처리완료 미확인 시 확인 버튼 강조 */}
      {!isAdmin && isMine && item.status === "done" && !item.userConfirmed && (
        <div className="mb-3 rounded-xl bg-emerald-50 border border-emerald-200 px-3 py-2 flex items-center gap-2">
          <span className="text-lg">✅</span>
          <span className="text-xs text-emerald-800 flex-1">처리완료됐어요! 내용 확인하셨으면 눌러주세요</span>
          <button onClick={onConfirm} className="text-[11px] px-3 py-1.5 rounded-full bg-[var(--brand-blue)] text-white font-bold hover:bg-[var(--brand-blue-dark)] shrink-0">
            확인했어요
          </button>
        </div>
      )}

      {/* 대화 스레드 라벨 */}
      <div className="flex items-center gap-1.5 mb-2 text-[11px] text-gray-500">
        <span>💬 대화</span>
        <span className="px-1.5 py-0.5 rounded-full bg-gray-100 text-gray-600 font-semibold">{item.thread.length}</span>
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

      {/* 메시지 입력 (관리자·본인 모두) — 강조 박스 + 친절 placeholder */}
      {(isAdmin || isMine) && item.status !== "done" && (
        <div className="rounded-2xl bg-purple-50/60 border-2 border-dashed border-purple-300 p-3 mt-3">
          <div className="flex items-center gap-1.5 mb-2 text-[11px] font-bold text-purple-700">
            <span className="text-base leading-none">⬇️</span>
            {isAdmin ? "💬 답변 작성" : "💬 이 글에 메시지 추가 (대화 이어가기)"}
          </div>
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
            placeholder={isAdmin ? "답변을 입력하세요…" : "여기에 추가 의견·답글 작성 — 새 글 만들지 않고 이어서 대화!"}
            rows={3}
            className="w-full border-2 border-purple-200 rounded-xl px-3 py-2.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-purple-500 resize-y leading-relaxed placeholder:text-purple-400"
          />
          <div className="flex items-center gap-2 mt-2">
            <label className="text-xs px-3 py-1.5 rounded-lg border border-purple-200 bg-white text-purple-600 hover:bg-purple-50 cursor-pointer font-medium">
              📷 사진
              <input type="file" accept="image/*" className="hidden"
                onChange={e => { pickImage(e.target.files?.[0]); e.target.value = ""; }} />
            </label>
            <button onClick={send} disabled={sending || (!msg.trim() && !img)}
              className="text-xs px-5 py-1.5 rounded-lg bg-purple-600 text-white font-bold hover:bg-purple-700 disabled:opacity-50 ml-auto shadow-sm">
              {sending ? "전송 중…" : "💬 답글 보내기"}
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
