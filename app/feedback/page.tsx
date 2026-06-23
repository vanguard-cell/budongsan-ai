"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useAuth, recordFeatureUse } from "@/lib/auth-context";
import SideDrawer from "@/app/components/SideDrawer";
import {
  subscribeFeedback,
  addFeedback,
  addMessage,
  setStatus,
  confirmByUser,
  deleteFeedback,
  ADMIN_EMAIL,
  type FeedbackItem,
  type FeedbackStatus,
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

/** 칸반 칼럼 정의 */
const COLUMNS: { key: FeedbackStatus; label: string; dot: string; head: string }[] = [
  { key: "pending",     label: "문의",   dot: "bg-gray-400",   head: "text-gray-600" },
  { key: "in_progress", label: "진행중", dot: "bg-blue-500",   head: "text-blue-700" },
  { key: "done",        label: "완료",   dot: "bg-emerald-500", head: "text-emerald-700" },
];
const STATUS_ACCENT: Record<FeedbackStatus, string> = {
  pending: "#888780", in_progress: "#2383E2", done: "#1D9E75",
};

const fmtTime = (ms: number) =>
  new Date(ms).toLocaleString("ko-KR", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" });

export default function FeedbackPage() {
  const router = useRouter();
  const { user, loading: authLoading, signOut } = useAuth();

  const [items, setItems] = useState<FeedbackItem[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [text, setText] = useState("");
  const [newImage, setNewImage] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [showCompose, setShowCompose] = useState(false);
  const [panelId, setPanelId] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState<FeedbackStatus | null>(null);

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
      recordFeatureUse(user.uid, "fb_new");
      setText("");
      setNewImage("");
      setShowCompose(false);
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

  const handleSendMessage = async (id: string, t: string, image: string) => {
    if (!user) return;
    await addMessage(id, {
      sender: isAdmin ? "admin" : "user",
      senderName: isAdmin ? "관리자" : (user.displayName || user.email || "사용자"),
      text: t,
      image: image || undefined,
    });
  };

  const handleSetStatus = async (id: string, status: FeedbackStatus) => {
    await setStatus(id, status);
  };
  const handleConfirm = async (id: string) => { await confirmByUser(id); };
  const handleDelete = async (id: string) => {
    if (!confirm("이 건의 내용을 삭제할까요?")) return;
    await deleteFeedback(id);
    setPanelId(null);
  };

  if (authLoading || !user) {
    return <div className="min-h-screen flex items-center justify-center text-gray-400 text-sm">불러오는 중…</div>;
  }

  const byStatus = (s: FeedbackStatus) => items.filter(i => i.status === s);
  const counts = { pending: byStatus("pending").length, in_progress: byStatus("in_progress").length, done: byStatus("done").length };
  const selected = items.find(i => i.id === panelId) || null;
  // "새 답글" — 상대가 마지막으로 답한 건
  const hasNewReply = (it: FeedbackItem) =>
    !!it.lastReplyBy && (isAdmin ? it.lastReplyBy === "user" : it.lastReplyBy === "admin");

  // 문의 번호 — 등록순(오래된 게 #1). 사용자·관리자·개발자가 같은 건을 #N으로 지칭하기 위함.
  const orderNo = new Map<string, number>();
  [...items].sort((a, b) => a.createdAt - b.createdAt).forEach((it, i) => orderNo.set(it.id, i + 1));

  return (
    <div className="min-h-screen bg-white">
      <div className={`px-6 sm:px-10 lg:px-24 pt-6 sm:pt-8 pb-12 transition-[padding] duration-300 ${panelId ? "xl:pr-[400px]" : ""}`}>

        {/* 상단 바 */}
        <div className="flex items-center justify-between gap-2 mb-4">
          <div className="flex items-center gap-2">
            <span className="inline-flex items-center gap-1.5 bg-purple-600 text-white px-3 py-1.5 rounded-full text-sm font-bold">
              <span className="material-symbols-outlined text-base">forum</span> 건의함
            </span>
            {isAdmin && <span className="px-2 py-0.5 rounded-full bg-purple-100 text-purple-700 text-[11px] font-medium">👑 관리자</span>}
          </div>
          <div className="flex items-center gap-2 text-[11px] text-gray-500">
            <span className="hidden sm:inline">👤 {user.displayName || user.email}</span>
            <Link href="/dashboard" className="px-2.5 py-1 rounded-lg border border-gray-200 hover:border-blue-400 hover:text-blue-600 transition-colors">← 홈</Link>
            <button onClick={() => { if (confirm("로그아웃 하시겠어요?")) signOut(); }} className="hover:text-blue-600">로그아웃</button>
          </div>
        </div>

        {/* 헤더 + 새 건의 버튼 */}
        <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-3 mb-5">
          <div>
            <h1 className="text-xl sm:text-2xl font-bold text-gray-900">
              {isAdmin ? "전체 건의사항 관리" : "수정 요청 / 건의사항"}
            </h1>
            <p className="text-gray-500 text-xs sm:text-sm mt-1">
              {isAdmin
                ? `문의 ${counts.pending} · 진행중 ${counts.in_progress} · 완료 ${counts.done}`
                : "불편한 점이나 바꿔줬으면 하는 것을 적어주세요. 카드를 누르면 대화로 이어집니다."}
            </p>
          </div>
          {!isAdmin && (
            <button onClick={() => setShowCompose(v => !v)}
              className="self-start sm:self-auto inline-flex items-center gap-1.5 px-4 py-2.5 rounded-xl bg-purple-600 text-white text-sm font-bold hover:bg-purple-700 transition-colors shadow-sm">
              <span className="material-symbols-outlined text-lg">{showCompose ? "close" : "add"}</span>
              {showCompose ? "닫기" : "새 건의 작성"}
            </button>
          )}
        </div>

        {/* 새 건의 작성 (일반 사용자, 토글) */}
        {!isAdmin && showCompose && (
          <div className="bg-white rounded-2xl border border-purple-200 shadow-sm p-4 mb-5">
            <div className="text-sm font-semibold text-gray-800 mb-2">✏️ 새 건의사항 작성</div>
            <textarea
              value={text}
              onChange={e => setText(e.target.value)}
              placeholder={"예: 만기 알림에서 메모 칸을 더 크게 해줬으면 좋겠어요\n예: 엑셀 업로드할 때 오류 메시지가 떠요"}
              rows={4}
              className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm bg-gray-50 focus:outline-none focus:ring-2 focus:ring-purple-500 resize-none leading-relaxed"
            />
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
              <button onClick={handleSubmit} disabled={submitting || (!text.trim() && !newImage)}
                className="px-5 py-2.5 rounded-xl bg-purple-600 text-white text-sm font-semibold hover:bg-purple-700 disabled:opacity-50 transition-colors">
                {submitting ? "등록 중…" : "등록"}
              </button>
            </div>
          </div>
        )}

        {/* 칸반 보드 */}
        {!loaded ? (
          <div className="text-center text-gray-400 py-16">불러오는 중…</div>
        ) : items.length === 0 ? (
          <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-10 text-center">
            <div className="text-5xl mb-3">📭</div>
            <div className="text-base font-semibold text-gray-900 mb-1">
              {isAdmin ? "아직 건의사항이 없습니다" : "아직 작성한 건의사항이 없습니다"}
            </div>
            <div className="text-xs text-gray-500">
              {isAdmin ? "사용자들이 건의사항을 등록하면 여기에 표시됩니다" : "위 [새 건의 작성]으로 의견을 남겨주세요"}
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            {COLUMNS.map(col => {
              const list = byStatus(col.key);
              return (
                <div
                  key={col.key}
                  onDragOver={e => { if (isAdmin) { e.preventDefault(); setDragOver(col.key); } }}
                  onDragLeave={() => setDragOver(d => d === col.key ? null : d)}
                  onDrop={e => {
                    if (!isAdmin) return;
                    e.preventDefault();
                    const id = e.dataTransfer.getData("text/plain");
                    setDragOver(null);
                    if (id) handleSetStatus(id, col.key);
                  }}
                  className={`rounded-2xl p-2.5 min-h-[120px] transition-colors ${dragOver === col.key ? "bg-blue-50 ring-2 ring-blue-300" : "bg-gray-50/70"}`}
                >
                  <div className={`flex items-center gap-1.5 px-1.5 py-1 mb-2 text-xs font-bold ${col.head}`}>
                    <span className={`w-2 h-2 rounded-full ${col.dot}`} />
                    {col.label}
                    <span className="text-gray-400 font-medium">{list.length}</span>
                  </div>
                  <div className="space-y-2">
                    {list.map(item => {
                      const preview = item.thread[0]?.text || item.text || (item.thread[0]?.image ? "📷 사진" : "(내용 없음)");
                      const lastAt = item.thread[item.thread.length - 1]?.createdAt || item.createdAt;
                      return (
                        <div
                          key={item.id}
                          draggable={isAdmin}
                          onDragStart={e => { e.dataTransfer.setData("text/plain", item.id); e.dataTransfer.effectAllowed = "move"; }}
                          onClick={() => setPanelId(item.id)}
                          className={`group bg-white rounded-xl border p-2.5 cursor-pointer hover:border-blue-300 hover:shadow-sm transition-all ${
                            panelId === item.id ? "border-blue-400 ring-1 ring-blue-300" : "border-gray-200"
                          }`}
                        >
                          <div className="flex items-center gap-1 mb-1">
                            <span className="text-[10px] font-bold text-purple-700 bg-purple-100 rounded px-1.5 py-0.5 shrink-0">#{orderNo.get(item.id)}</span>
                            {isAdmin && (
                              <span className="text-[10px] text-blue-600 flex items-center gap-0.5 truncate">
                                <span className="material-symbols-outlined text-[13px]">person</span>
                                {item.submittedBy.name || item.submittedBy.email}
                              </span>
                            )}
                          </div>
                          <div className="text-[13px] text-gray-800 leading-snug line-clamp-2">{preview}</div>
                          <div className="flex items-center gap-2 mt-2 text-[10px] text-gray-400">
                            <span className="flex items-center gap-0.5"><span className="material-symbols-outlined text-[13px]">chat_bubble</span>{item.thread.length}</span>
                            <span>{fmtTime(lastAt)}</span>
                            {hasNewReply(item) && (
                              <span className="ml-auto px-1.5 py-0.5 rounded-full bg-amber-100 text-amber-700 font-bold">새 답글</span>
                            )}
                            {col.key === "done" && !hasNewReply(item) && (
                              item.userConfirmed
                                ? <span className="ml-auto text-emerald-600 font-medium flex items-center gap-0.5"><span className="material-symbols-outlined text-[13px]">how_to_reg</span>확인됨</span>
                                : <span className="ml-auto text-amber-600 font-medium flex items-center gap-0.5"><span className="material-symbols-outlined text-[13px]">hourglass_top</span>확인 대기</span>
                            )}
                          </div>
                        </div>
                      );
                    })}
                    {list.length === 0 && (
                      <div className="text-center text-[11px] text-gray-300 py-4">{isAdmin ? "여기로 카드를 끌어 옮기세요" : "없음"}</div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {isAdmin && items.length > 0 && (
          <p className="text-[11px] text-gray-400 mt-4 flex items-center gap-1.5">
            <span className="material-symbols-outlined text-sm">drag_indicator</span>
            카드를 끌어 칸을 옮기거나, 카드를 눌러 대화하세요. (관리자가 첫 답변을 달면 자동으로 진행중)
          </p>
        )}
      </div>

      {/* 우측 상세 패널 */}
      {selected && (
        <FeedbackPanel
          key={selected.id}
          item={selected}
          no={orderNo.get(selected.id)}
          isAdmin={isAdmin}
          isMine={selected.submittedBy.uid === user.uid}
          onClose={() => setPanelId(null)}
          onSend={(t, img) => handleSendMessage(selected.id, t, img)}
          onSetStatus={s => handleSetStatus(selected.id, s)}
          onConfirm={() => handleConfirm(selected.id)}
          onDelete={() => handleDelete(selected.id)}
        />
      )}
    </div>
  );
}

/* ── 우측 채팅 패널 ── */
function FeedbackPanel({ item, no, isAdmin, isMine, onClose, onSend, onSetStatus, onConfirm, onDelete }: {
  item: FeedbackItem;
  no?: number;
  isAdmin: boolean;
  isMine: boolean;
  onClose: () => void;
  onSend: (text: string, image: string) => Promise<void>;
  onSetStatus: (status: FeedbackStatus) => void;
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

  const baseTitle = item.thread[0]?.text?.slice(0, 22) || "건의 내용";
  const title = no ? `#${no} · ${baseTitle}` : baseTitle;

  return (
    <SideDrawer open onClose={onClose} title={title} icon="forum" accent={STATUS_ACCENT[item.status]}>
      <div className="px-1 space-y-3">

        {/* 상태 전환 */}
        {isAdmin ? (
          <div className="flex gap-1.5">
            {COLUMNS.map(col => {
              const active = item.status === col.key;
              return (
                <button key={col.key} onClick={() => onSetStatus(col.key)}
                  className={`flex-1 py-2 rounded-lg text-[12px] font-bold border transition-colors flex items-center justify-center gap-1 ${
                    active
                      ? col.key === "pending" ? "bg-gray-600 text-white border-gray-600"
                        : col.key === "in_progress" ? "bg-blue-600 text-white border-blue-600"
                        : "bg-emerald-600 text-white border-emerald-600"
                      : "bg-white text-gray-600 border-gray-200 hover:border-gray-300"
                  }`}>
                  <span className={`w-1.5 h-1.5 rounded-full ${col.dot}`} />{col.label}
                </button>
              );
            })}
          </div>
        ) : (
          <div className="flex items-center gap-2">
            <span className="text-[12px] text-gray-500">상태</span>
            <span className={`text-[12px] font-bold px-2 py-0.5 rounded-full ${
              item.status === "done" ? "bg-emerald-100 text-emerald-700"
              : item.status === "in_progress" ? "bg-blue-100 text-blue-700" : "bg-gray-100 text-gray-600"
            }`}>
              {item.status === "done" ? "완료" : item.status === "in_progress" ? "진행중" : "문의"}
            </span>
          </div>
        )}

        {/* 문의자(본인) — 처리완료 미확인 시 확인 버튼 */}
        {isMine && item.status === "done" && !item.userConfirmed && (
          <div className="rounded-xl bg-emerald-50 border border-emerald-200 px-3 py-2 flex items-center gap-2">
            <span className="material-symbols-outlined text-emerald-600">check_circle</span>
            <span className="text-xs text-emerald-800 flex-1">처리완료됐어요! 확인하셨으면 눌러주세요</span>
            <button onClick={onConfirm} className="text-[11px] px-3 py-1.5 rounded-full bg-[var(--brand-blue)] text-white font-bold hover:bg-[var(--brand-blue-dark)] shrink-0">확인했어요</button>
          </div>
        )}
        {item.status === "done" && item.userConfirmed && (
          <div className="rounded-xl bg-emerald-50 border border-emerald-200 px-3 py-2 text-xs text-emerald-700 flex items-center gap-1.5">
            <span className="material-symbols-outlined text-emerald-600 text-base">how_to_reg</span> 문의자가 확인 완료한 건입니다
          </div>
        )}

        {/* 대화 스레드 */}
        <div className="space-y-2">
          {item.thread.map((m, i) => {
            const mine = isAdmin ? m.sender === "admin" : m.sender === "user";
            return (
              <div key={i} className={`flex ${mine ? "justify-end" : "justify-start"}`}>
                <div className={`max-w-[82%] flex flex-col ${mine ? "items-end" : "items-start"}`}>
                  <span className="text-[10px] text-gray-400 mb-0.5 px-1">
                    {m.sender === "admin" ? "💬 관리자" : m.senderName} · {fmtTime(m.createdAt)}
                  </span>
                  <div className={`rounded-2xl px-3 py-2 ${mine ? "bg-purple-600 text-white" : "bg-gray-100 text-gray-800"}`}>
                    {m.image && (
                      /* eslint-disable-next-line @next/next/no-img-element */
                      <img src={m.image} alt="첨부" onClick={() => setZoom(m.image!)} className="max-h-48 rounded-lg mb-1 cursor-zoom-in" />
                    )}
                    {m.text && <p className="text-sm leading-relaxed whitespace-pre-wrap break-words">{m.text}</p>}
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        {/* 메시지 입력 — 완료된 건도 추가 대화 허용 */}
        <div className="rounded-2xl bg-purple-50/60 border border-purple-200 p-2.5">
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
            placeholder={isAdmin ? "답변을 입력하세요…" : "여기에 답글을 이어서 작성하세요…"}
            rows={3}
            className="w-full border border-purple-200 rounded-xl px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-purple-500 resize-y leading-relaxed"
          />
          <div className="flex items-center gap-2 mt-2">
            <label className="text-xs px-3 py-1.5 rounded-lg border border-purple-200 bg-white text-purple-600 hover:bg-purple-50 cursor-pointer font-medium">
              📷 사진
              <input type="file" accept="image/*" className="hidden"
                onChange={e => { pickImage(e.target.files?.[0]); e.target.value = ""; }} />
            </label>
            <button onClick={send} disabled={sending || (!msg.trim() && !img)}
              className="text-xs px-4 py-1.5 rounded-lg bg-purple-600 text-white font-bold hover:bg-purple-700 disabled:opacity-50 ml-auto shadow-sm">
              {sending ? "전송 중…" : "답글 보내기"}
            </button>
          </div>
        </div>

        {/* 완료/삭제 액션 — 관리자·본인 둘 다 완료 가능 */}
        <div className="flex items-center gap-2 pt-1">
          {item.status !== "done" ? (
            <button onClick={() => onSetStatus("done")}
              className="flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-lg bg-emerald-600 text-white text-[12px] font-bold hover:bg-emerald-700">
              <span className="material-symbols-outlined text-[16px]">task_alt</span> 완료로 보내기
            </button>
          ) : (
            <button onClick={() => onSetStatus("in_progress")}
              className="flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-lg border border-gray-200 text-gray-600 text-[12px] font-bold hover:bg-gray-50">
              <span className="material-symbols-outlined text-[16px]">undo</span> 다시 진행중으로
            </button>
          )}
          {(isAdmin || isMine) && (
            <button onClick={onDelete} title="삭제"
              className="w-10 shrink-0 flex items-center justify-center py-2.5 rounded-lg border border-gray-200 text-gray-400 hover:text-red-600 hover:border-red-300">
              <span className="material-symbols-outlined text-[18px]">delete</span>
            </button>
          )}
        </div>
      </div>

      {/* 이미지 확대 */}
      {zoom && (
        <div className="fixed inset-0 bg-black/80 z-[70] flex items-center justify-center p-4" onClick={() => setZoom(null)}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={zoom} alt="확대" className="max-w-full max-h-full rounded-lg" />
        </div>
      )}
    </SideDrawer>
  );
}
