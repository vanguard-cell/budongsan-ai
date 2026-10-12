"use client";
import { useRef, useState, useSyncExternalStore } from "react";
import { useAuth } from "@/lib/auth-context";
import {
  BACKUP_COLLECTIONS, BACKUP_LABELS, backupNow, countBackup, lastBackupAt, parseBackup, restoreBackup,
} from "@/lib/backup";

const STALE_DAYS = 7;
const subscribeNoop = () => () => {};

function fmt(ms: number) {
  const d = new Date(ms);
  return `${d.getFullYear()}.${d.getMonth() + 1}.${d.getDate()} ${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

/** 더보기 — 데이터 백업 파일 받기 / 백업 파일로 되살리기 */
export default function BackupCard() {
  const { user } = useAuth();
  // 마지막 백업 시각 — 이 기기 localStorage 기준 (서버 렌더에선 null)
  const [rev, setRev] = useState(0);
  const last = useSyncExternalStore(subscribeNoop, lastBackupAt, () => null);
  const [now] = useState(() => Date.now());
  const [busy, setBusy] = useState<"" | "backup" | "restore">("");
  const [msg, setMsg] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);

  if (!user) return null;
  const stale = !last || now - last > STALE_DAYS * 86_400_000;
  void rev;

  const doBackup = async () => {
    setBusy("backup"); setMsg("");
    try {
      const b = await backupNow(user.agencyId);
      const c = countBackup(b);
      setRev(r => r + 1);
      setMsg(`✅ 백업 파일을 받았어요 (${BACKUP_COLLECTIONS.map(n => `${BACKUP_LABELS[n]} ${c[n]}`).join(" · ")})`);
    } catch (e) {
      console.error("[backup]", e);
      setMsg("백업 파일을 만들지 못했어요. 잠시 후 다시 해주세요.");
    } finally {
      setBusy("");
    }
  };

  const doRestore = async (file: File) => {
    setMsg("");
    let b;
    try {
      b = parseBackup(await file.text());
    } catch {
      alert("이 앱에서 받은 백업 파일이 아니에요. 파일을 다시 확인해 주세요.");
      return;
    }
    const c = countBackup(b);
    const summary = BACKUP_COLLECTIONS.map(n => `· ${BACKUP_LABELS[n]} ${c[n]}건`).join("\n");
    const other = b.agencyId !== user.agencyId ? "\n\n⚠️ 다른 사무소에서 받은 백업 파일이에요." : "";
    if (!confirm(
      `${fmt(b.createdAt)}에 받은 백업으로 되살릴까요?\n\n${summary}${other}\n\n` +
      `백업에 있는 항목은 그 당시 내용으로 돌아가요.\n백업 뒤에 새로 등록한 항목은 지워지지 않고 그대로 남아요.`,
    )) return;
    setBusy("restore");
    try {
      // 되살리기 전 지금 상태도 한 번 받아 둠 (되살리기를 되돌릴 수 있게)
      await backupNow(user.agencyId);
      const n = await restoreBackup(user.agencyId, b);
      setRev(r => r + 1);
      setMsg(`✅ ${n}건을 백업 내용으로 되살렸어요. (되살리기 직전 상태도 백업 파일로 받아 뒀어요)`);
    } catch (e) {
      console.error("[restore]", e);
      setMsg("되살리는 중 문제가 생겼어요. 일부만 반영됐을 수 있으니 다시 한 번 해주세요.");
    } finally {
      setBusy("");
    }
  };

  return (
    <div className={`rounded-2xl border p-4 ${stale ? "border-amber-300 bg-amber-50" : "border-gray-200 bg-white"}`}>
      <div className="flex items-center gap-3">
        <span className="text-3xl">💾</span>
        <div className="min-w-0">
          <div className="text-sm font-semibold text-gray-900">데이터 백업</div>
          <div className="text-xs text-gray-500 mt-0.5">
            {last ? `마지막 백업: ${fmt(last)}` : "아직 이 기기에서 백업한 적이 없어요"}
            {stale && " — 일주일에 한 번은 받아 두세요"}
          </div>
        </div>
      </div>
      <div className="flex gap-2 mt-3">
        <button onClick={doBackup} disabled={!!busy}
          className="flex-1 py-2.5 rounded-xl bg-blue-600 text-white text-sm font-semibold whitespace-nowrap disabled:opacity-60">
          {busy === "backup" ? "만드는 중…" : "백업 파일 받기"}
        </button>
        <button data-owner-only onClick={() => fileRef.current?.click()} disabled={!!busy}
          className="flex-1 py-2.5 rounded-xl border border-gray-300 text-gray-700 text-sm font-semibold whitespace-nowrap disabled:opacity-60">
          {busy === "restore" ? "되살리는 중…" : "백업으로 되살리기"}
        </button>
        <input ref={fileRef} type="file" accept="application/json,.json" className="hidden"
          onChange={e => { const f = e.target.files?.[0]; e.target.value = ""; if (f) doRestore(f); }} />
      </div>
      {msg && <div className="text-xs text-gray-700 mt-2">{msg}</div>}
    </div>
  );
}
