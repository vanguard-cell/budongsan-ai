/**
 * 건의함 읽기 — Firebase Admin SDK로 /feedback 전체를 번호와 함께 출력
 *
 * 사용:
 *   1) Firebase 콘솔 → 프로젝트 설정 → 서비스 계정 → "새 비공개 키 생성"
 *   2) 받은 JSON을 프로젝트 루트에 serviceAccountKey.json 으로 저장 (이미 .gitignore 처리됨)
 *   3) node scripts/read-feedback.js            # 전체
 *      node scripts/read-feedback.js --open     # 미완료(문의/진행중)만
 *      node scripts/read-feedback.js 5          # #5만 전체 대화
 *
 * 번호 규칙: 등록순(오래된 게 #1). 앱 화면의 #N과 동일.
 */
const { initializeApp, cert } = require("firebase-admin/app");
const { getFirestore } = require("firebase-admin/firestore");
const path = require("path");
const fs = require("fs");

const KEY_PATH =
  process.env.GOOGLE_APPLICATION_CREDENTIALS ||
  path.join(__dirname, "..", "serviceAccountKey.json");

if (!fs.existsSync(KEY_PATH)) {
  console.error(`\n❌ 서비스 계정 키가 없습니다: ${KEY_PATH}`);
  console.error("   Firebase 콘솔 → 프로젝트 설정 → 서비스 계정 → '새 비공개 키 생성'");
  console.error("   받은 JSON을 프로젝트 루트에 serviceAccountKey.json 으로 저장하세요.\n");
  process.exit(1);
}

initializeApp({
  credential: cert(require(KEY_PATH)),
  projectId: "budongsan-ai",
});
const dbf = getFirestore();

const STATUS = { pending: "🆕 문의", in_progress: "🔧 진행중", done: "✅ 완료" };

function fmt(ts) {
  const d = new Date(ts);
  if (isNaN(d)) return "?";
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")} ${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

(async () => {
  const snap = await dbf.collection("feedback").get();
  const items = snap.docs.map(d => {
    const x = d.data();
    const createdAt = x.createdAt?.toMillis ? x.createdAt.toMillis() : (x.createdAt || 0);
    const thread = Array.isArray(x.thread) ? x.thread : [];
    if (thread.length === 0 && x.text) thread.push({ sender: "user", senderName: x.submittedBy?.name, text: x.text, createdAt });
    return { id: d.id, status: x.status || "pending", createdAt, thread, by: x.submittedBy?.name || x.submittedBy?.email || "?", lastReplyBy: x.lastReplyBy };
  });
  // 등록순(오래된 게 #1) — 앱 화면 번호와 동일
  items.sort((a, b) => a.createdAt - b.createdAt).forEach((it, i) => (it.no = i + 1));

  const args = process.argv.slice(2);
  const onlyOpen = args.includes("--open");
  const onlyNo = args.find(a => /^\d+$/.test(a));

  let list = items;
  if (onlyNo) list = items.filter(it => it.no === Number(onlyNo));
  else if (onlyOpen) list = items.filter(it => it.status !== "done");
  // 출력은 최신순(번호 큰 것부터)
  list.sort((a, b) => b.no - a.no);

  const c = { pending: 0, in_progress: 0, done: 0 };
  items.forEach(it => c[it.status]++);
  console.log(`\n📮 건의함 — 전체 ${items.length}건 (🆕 ${c.pending} · 🔧 ${c.in_progress} · ✅ ${c.done})`);
  if (onlyOpen) console.log("   (미완료만 표시)");
  if (onlyNo) console.log(`   (#${onlyNo}만 표시)`);
  console.log("─".repeat(70));

  for (const it of list) {
    const newBadge = it.lastReplyBy === "user" ? "  ❗새 답글" : "";
    console.log(`\n#${it.no}  ${STATUS[it.status]}  · ${it.by} · ${fmt(it.createdAt)}${newBadge}`);
    it.thread.forEach(m => {
      const who = m.sender === "admin" ? "💬 관리자" : `🙋 ${m.senderName || "사용자"}`;
      const img = m.image ? " [📷사진]" : "";
      console.log(`   ${who}: ${(m.text || "").replace(/\n/g, "\n      ")}${img}`);
    });
  }
  console.log("\n" + "─".repeat(70));
  process.exit(0);
})().catch(e => { console.error("읽기 실패:", e.message); process.exit(1); });
