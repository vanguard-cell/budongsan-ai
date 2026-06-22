/**
 * 건의함 답변 — 특정 #번호 글에 관리자 답변을 추가 (앱의 addMessage와 동일 규칙)
 *
 * 사용:
 *   node scripts/reply-feedback.js <번호> [메시지파일]
 *   예) node scripts/reply-feedback.js 34 scripts/reply-message.txt
 *       node scripts/reply-feedback.js 34            # 기본 scripts/reply-message.txt 사용
 *
 * 동작: thread에 {sender:"admin"} 메시지 추가, lastReplyBy="admin",
 *       상태가 문의(pending)면 진행중(in_progress)으로 자동 전환.
 *   --done 플래그를 주면 답변과 함께 완료(done)로 변경.
 */
const { initializeApp, cert } = require("firebase-admin/app");
const { getFirestore } = require("firebase-admin/firestore");
const path = require("path");
const fs = require("fs");

const KEY_PATH = process.env.GOOGLE_APPLICATION_CREDENTIALS || path.join(__dirname, "..", "serviceAccountKey.json");
if (!fs.existsSync(KEY_PATH)) { console.error("❌ serviceAccountKey.json 없음"); process.exit(1); }

const args = process.argv.slice(2);
const targetNo = Number(args.find(a => /^\d+$/.test(a)));
const markDone = args.includes("--done");
const msgFile = args.find(a => a.endsWith(".txt")) || path.join(__dirname, "reply-message.txt");
if (!targetNo) { console.error("❌ 번호를 지정하세요. 예: node scripts/reply-feedback.js 34"); process.exit(1); }
if (!fs.existsSync(msgFile)) { console.error(`❌ 메시지 파일 없음: ${msgFile}`); process.exit(1); }
const text = fs.readFileSync(msgFile, "utf8").trim();
if (!text) { console.error("❌ 메시지가 비어있음"); process.exit(1); }

initializeApp({ credential: cert(require(KEY_PATH)), projectId: "budongsan-ai" });
const dbf = getFirestore();

(async () => {
  const snap = await dbf.collection("feedback").get();
  const items = snap.docs.map(d => {
    const x = d.data();
    const createdAt = x.createdAt?.toMillis ? x.createdAt.toMillis() : (x.createdAt || 0);
    return { ref: d.ref, data: x, createdAt };
  });
  items.sort((a, b) => a.createdAt - b.createdAt).forEach((it, i) => (it.no = i + 1));
  const target = items.find(it => it.no === targetNo);
  if (!target) { console.error(`❌ #${targetNo} 없음 (전체 ${items.length}건)`); process.exit(1); }

  const x = target.data;
  // 기존 thread 확보 (레거시 text/reply 복원)
  const thread = Array.isArray(x.thread) ? [...x.thread] : [];
  if (thread.length === 0) {
    const createdAt = target.createdAt;
    if (x.text) thread.push({ sender: "user", senderName: x.submittedBy?.name || "사용자", text: x.text, createdAt });
    if (x.reply) thread.push({ sender: "admin", senderName: "관리자", text: x.reply, createdAt: createdAt + 1 });
  }
  thread.push({ sender: "admin", senderName: "관리자", text, createdAt: Date.now() });

  const patch = { thread, lastReplyBy: "admin" };
  const cur = x.status || "pending";
  if (markDone) { patch.status = "done"; patch.userConfirmed = false; }
  else if (cur === "pending") patch.status = "in_progress";

  await target.ref.update(patch);
  console.log(`✅ #${targetNo} 답변 등록 완료${patch.status ? ` (상태→${patch.status})` : ""}`);
  console.log("─".repeat(50));
  console.log(text);
  process.exit(0);
})().catch(e => { console.error("실패:", e.message); process.exit(1); });
