/**
 * 건의 #41 — '망월동 1100번지' 주소를 '망월동 힐스테이트그랑파사쥬(12-1) 호수' 로 통일
 * 대상: 각 agency의 contracts, properties, schedules 의 address 필드
 *
 * 사용법 (기본은 미리보기, 아무것도 저장하지 않음):
 *   node scripts/rename-address-41.js            # 바뀔 내용만 출력
 *   node scripts/rename-address-41.js --apply    # 실제 저장
 * 호수(예: 910호)는 주소 끝에서 찾아 그대로 뒤에 붙인다. 호수를 못 찾는 주소는 건너뛰고 따로 출력한다.
 */
const { initializeApp } = require("firebase-admin/app");
const { getFirestore } = require("firebase-admin/firestore");
const { loadCredential } = require("./admin-credential");

initializeApp({ credential: loadCredential(), projectId: "budongsan-ai" });
const db = getFirestore();
const APPLY = process.argv.includes("--apply");
const NEW_NAME = "망월동 힐스테이트그랑파사쥬(12-1)";

function convert(addr) {
  if (typeof addr !== "string" || !/망월동\s*1100(?:번지)?(?![\d-])/.test(addr)) return null;
  if (addr.includes("힐스테이트그랑파사쥬(12-1)")) return null; // 이미 통일됨
  const m = addr.match(/(\d+)\s*호\s*$/);
  return m ? `${NEW_NAME} ${m[1]}호` : undefined; // undefined = 호수 못 찾음
}

(async () => {
  let changed = 0, skipped = 0;
  const agencies = await db.collection("agencies").get();
  for (const a of agencies.docs) {
    for (const col of ["contracts", "properties", "schedules"]) {
      const snap = await a.ref.collection(col).get();
      for (const d of snap.docs) {
        const before = d.get("address");
        const after = convert(before);
        if (after === null) continue;
        if (after === undefined) { skipped++; console.log(`⚠️ 호수 못 찾음(건너뜀) ${col}/${d.id}: ${before}`); continue; }
        changed++;
        console.log(`${col}/${d.id}: ${before}  →  ${after}`);
        if (APPLY) await d.ref.update({ address: after });
      }
    }
  }
  console.log(`\n${APPLY ? "저장 완료" : "미리보기"}: 변경 ${changed}건, 건너뜀 ${skipped}건`);
})();
