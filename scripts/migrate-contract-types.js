/**
 * 건의 #70 — 만기관리 계약 중 propertyType 이 비어 있고 주소에 (오피스텔)/(상가)가 있으면 해당 종류로 채움.
 *   node scripts/migrate-contract-types.js          # 미리보기(수정 안 함)
 *   node scripts/migrate-contract-types.js --apply  # 실제 반영
 */
const { initializeApp } = require("firebase-admin/app");
const { loadCredential } = require("./admin-credential");
const { getFirestore } = require("firebase-admin/firestore");

initializeApp({ credential: loadCredential(), projectId: "budongsan-ai" });
const db = getFirestore();
const apply = process.argv.includes("--apply");
const RULES = [["(오피스텔)", "오피스텔"], ["(상가)", "상가"]];

(async () => {
  const agencies = await db.collection("agencies").get();
  let n = 0;
  for (const a of agencies.docs) {
    const snap = await a.ref.collection("contracts").get();
    for (const d of snap.docs) {
      const c = d.data();
      if (c.propertyType) continue;
      const addr = String(c.address || "");
      const hit = RULES.find(([k]) => addr.includes(k));
      if (!hit) continue;
      n++;
      console.log(`${apply ? "수정" : "대상"}: ${a.id}/${d.id} "${addr}" → ${hit[1]}`);
      if (apply) await d.ref.update({ propertyType: hit[1] });
    }
  }
  console.log(`${apply ? "반영" : "미리보기"} ${n}건`);
})();
