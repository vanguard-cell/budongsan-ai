/**
 * 매물 단지 이전 — 주소에 특정 문구가 들어간 매물을 다른 단지(주소·유형)로 변경
 * 기본은 미리보기(dry-run). 실제 반영은 --apply 를 붙일 때만.
 *
 * 사용:
 *   node scripts/move-property-complex.js            # 대상만 출력
 *   node scripts/move-property-complex.js --apply    # 실제 변경
 */
const { initializeApp } = require("firebase-admin/app");
const { loadCredential } = require("./admin-credential");
const { getFirestore } = require("firebase-admin/firestore");

const MATCH = "망월동 1100";
const NEW_ADDRESS = "힐스테이트미사역그랑파사쥬";
const NEW_TYPE = "오피스텔";
const apply = process.argv.includes("--apply");

initializeApp({ credential: loadCredential(), projectId: "budongsan-ai" });
const dbf = getFirestore();

(async () => {
  const snap = await dbf.collectionGroup("properties").get();
  const norm = (s) => String(s || "").replace(/\s+/g, "");
  const hits = snap.docs.filter((d) => norm(d.get("address")).includes(norm(MATCH)));
  console.log(`대상 ${hits.length}건 (${apply ? "실제 반영" : "미리보기"})`);
  for (const d of hits) {
    console.log(`- ${d.ref.path} | ${d.get("address")} (${d.get("propertyType")}) → ${NEW_ADDRESS} (${NEW_TYPE})`);
    if (apply) await d.ref.update({ address: NEW_ADDRESS, propertyType: NEW_TYPE });
  }
})().catch((e) => { console.error(e.message); process.exit(1); });
