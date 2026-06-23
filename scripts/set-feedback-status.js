/**
 * 건의함 상태 변경 — 특정 #번호의 status만 바꿈 (메시지 추가 없이)
 *
 * 사용: node scripts/set-feedback-status.js <번호> <pending|in_progress|done>
 *   예) node scripts/set-feedback-status.js 32 in_progress
 *
 * done이 아닌 상태로 바꾸면 userConfirmed는 false로 리셋.
 * (정책: 완료는 어머니가 직접 '확인/완료' 눌렀을 때만 — 관리자가 임의 완료 금지)
 */
const { initializeApp, cert } = require("firebase-admin/app");
const { getFirestore } = require("firebase-admin/firestore");
const path = require("path");
const fs = require("fs");

const KEY_PATH = process.env.GOOGLE_APPLICATION_CREDENTIALS || path.join(__dirname, "..", "serviceAccountKey.json");
if (!fs.existsSync(KEY_PATH)) { console.error("❌ serviceAccountKey.json 없음"); process.exit(1); }

const args = process.argv.slice(2);
const targetNo = Number(args.find(a => /^\d+$/.test(a)));
const status = args.find(a => ["pending", "in_progress", "done"].includes(a));
if (!targetNo || !status) { console.error("사용: node scripts/set-feedback-status.js <번호> <pending|in_progress|done>"); process.exit(1); }

initializeApp({ credential: cert(require(KEY_PATH)), projectId: "budongsan-ai" });
const dbf = getFirestore();

(async () => {
  const snap = await dbf.collection("feedback").get();
  const items = snap.docs.map(d => {
    const x = d.data();
    const createdAt = x.createdAt?.toMillis ? x.createdAt.toMillis() : (x.createdAt || 0);
    return { ref: d.ref, createdAt };
  });
  items.sort((a, b) => a.createdAt - b.createdAt).forEach((it, i) => (it.no = i + 1));
  const t = items.find(it => it.no === targetNo);
  if (!t) { console.error(`❌ #${targetNo} 없음 (전체 ${items.length}건)`); process.exit(1); }
  await t.ref.update(status === "done" ? { status } : { status, userConfirmed: false });
  console.log(`✅ #${targetNo} 상태 → ${status}`);
  process.exit(0);
})().catch(e => { console.error("실패:", e.message); process.exit(1); });
