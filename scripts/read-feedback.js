/**
 * 건의함 읽기 — Firebase Admin SDK로 /feedback 전체를 번호와 함께 출력
 *
 * 사용:
 *   1) Firebase 콘솔 → 프로젝트 설정 → 서비스 계정 → "새 비공개 키 생성"
 *   2) 받은 JSON을 프로젝트 루트에 serviceAccountKey.json 으로 저장 (이미 .gitignore 처리됨)
 *      (클라우드 세션은 환경 변수 FIREBASE_SERVICE_ACCOUNT 에 JSON 내용 전체)
 *   3) node scripts/read-feedback.js            # 처리 대상 후보만 (읽기 절약)
 *      node scripts/read-feedback.js --all      # 전체 (읽기 많음)
 *      node scripts/read-feedback.js --open     # 미완료(문의/진행중)만 (전체 읽음)
 *      node scripts/read-feedback.js 5          # #5만 전체 대화
 *
 * 번호 규칙: 등록순(오래된 게 #1). 앱 화면의 #N과 동일.
 */
const { initializeApp } = require("firebase-admin/app");
const { loadCredential } = require("./admin-credential");
const { getFirestore } = require("firebase-admin/firestore");

initializeApp({
  credential: loadCredential(),
  projectId: "budongsan-ai",
});
const dbf = getFirestore();
const { toMs, loadAll, findByNo, findPending } = require("./feedback-lib");

const STATUS = { pending: "🆕 문의", in_progress: "🔧 진행중", done: "✅ 완료" };

function fmt(ts) {
  const d = new Date(ts);
  if (isNaN(d)) return "?";
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")} ${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

(async () => {
  const args = process.argv.slice(2);
  const onlyNo = args.find(a => /^\d+$/.test(a));
  const full = args.includes("--all") || args.includes("--open") || args.includes("--full");

  let items, total;
  if (onlyNo && !args.includes("--full")) {
    // 번호 지정: 전체를 읽지 않고 그 글만
    const f = await findByNo(dbf, Number(onlyNo));
    items = f ? [{ doc: f.doc, no: f.no, createdAt: toMs(f.doc.data().createdAt) }] : [];
    total = f ? f.total : 0;
  } else if (full) {
    ({ items, total } = await loadAll(dbf));
  } else {
    // 기본: 처리 대상 후보(🆕 문의 + 사용자가 마지막으로 쓴 글)만 — 전체를 읽지 않음
    ({ items, total } = await findPending(dbf));
  }

  const mapped = items.map(it => {
    const x = it.doc.data();
    const createdAt = it.createdAt;
    const thread = Array.isArray(x.thread) ? x.thread : [];
    if (thread.length === 0 && x.text) thread.push({ sender: "user", senderName: x.submittedBy?.name, text: x.text, createdAt });
    return { no: it.no, status: x.status || "pending", createdAt, thread, by: x.submittedBy?.name || x.submittedBy?.email || "?", lastReplyBy: x.lastReplyBy };
  });

  const onlyOpen = args.includes("--open");
  let list = mapped;
  if (onlyOpen) list = mapped.filter(it => it.status !== "done");
  // 출력은 최신순(번호 큰 것부터)
  list.sort((a, b) => b.no - a.no);

  console.log(`\n📮 건의함 — 전체 ${total}건`);
  if (!onlyNo && !full) console.log("   (처리 대상 후보만 표시: 🆕 문의 + 사용자가 마지막으로 쓴 글. 전체는 --all)");
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
