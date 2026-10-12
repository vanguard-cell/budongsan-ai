/**
 * 건의 #41·#44·#46·#70 데이터 일괄 정리 — 기본은 미리보기, --apply 일 때만 저장
 *
 *  #41·#46  망월동 1100번지(그랑파사쥬 12-1블럭) 표기 → "힐스테이트미사역그랑파사쥬 <동·호 등 뒷부분>"
 *           만기 계약·매물·스케줄의 address / propertyAddress. 마들렌은 다른 건물일 수 있어 제외.
 *  #44      "미사마이움센트럴아케이드" → "마이움센트럴아케이드" (나머지 주소는 그대로)
 *  #70      만기 계약 중 매물 유형이 비어 있고 주소에 (오피스텔)/(상가)가 있으면 그 유형으로 채움
 *
 * 저장 전 바뀌는 필드의 원래 값을 /admin_backups/data-batch-1 문서와 scripts/backup-data-batch-1.json 에 남김.
 *
 * 사용:
 *   node scripts/fix-data-batch-1.js            # 미리보기 (아무것도 저장 안 함)
 *   node scripts/fix-data-batch-1.js --apply    # 백업 후 저장
 */
const { initializeApp } = require("firebase-admin/app");
const { loadCredential } = require("./admin-credential");
const { getFirestore } = require("firebase-admin/firestore");
const fs = require("fs");
const path = require("path");

initializeApp({ credential: loadCredential(), projectId: "budongsan-ai" });
const db = getFirestore();
const APPLY = process.argv.includes("--apply");

// 어머니 사무소만 읽음 (Firebase 읽기 한도 절약)
const AGENCY = "agencies/agency_ZP0FIxYM5Lh8";
const NEW_NAME = "힐스테이트미사역그랑파사쥬";

// 앞부분(시·구·동·번지·건물명) — 뒤에 남는 동·호수는 그대로 둔다
const PREFIX_1100 = /^.*?망월동\s*1100(?![\d-])(?:번지)?\s*,?\s*(?:힐스테이트\s*미사역\s*그랑파[사샤]쥬\s*(?:\(?\s*12-1\s*(?:블럭|블|BL)?\s*\)?)?|망월동공공주택지구중심상업지구\s*12-1블럭\s*업무시설)?\s*,?\s*/;

function fixAddress(a) {
  if (typeof a !== "string" || !a) return null;
  if (/망월동\s*1100(?![\d-])/.test(a) && !/마들렌/.test(a) && !a.startsWith(NEW_NAME)) {
    const tail = a.replace(PREFIX_1100, "").replace(/\s+/g, " ").trim();
    return tail ? `${NEW_NAME} ${tail}` : NEW_NAME;
  }
  if (a.includes("미사마이움센트럴아케이드")) return a.replace("미사마이움센트럴아케이드", "마이움센트럴아케이드");
  return null;
}

const TYPE_RULES = [["(오피스텔)", "오피스텔"], ["(상가)", "상가"]];

(async () => {
  const changes = [];   // { ref, path, patch, before, tags }
  for (const col of ["contracts", "properties", "schedules"]) {
    const snap = await db.doc(AGENCY).collection(col).get();
    for (const d of snap.docs) {
      const x = d.data();
      const patch = {}, before = {}, tags = [];
      for (const field of ["address", "propertyAddress"]) {
        const after = fixAddress(x[field]);
        if (after && after !== x[field]) {
          patch[field] = after; before[field] = x[field];
          tags.push(/마이움/.test(after) ? "#44" : "#41·#46");
        }
      }
      if (col === "contracts" && !x.propertyType) {
        const hit = TYPE_RULES.find(([k]) => String(x.address || "").includes(k));
        if (hit) { patch.propertyType = hit[1]; before.propertyType = x.propertyType ?? null; tags.push("#70"); }
      }
      if (Object.keys(patch).length) changes.push({ ref: d.ref, path: d.ref.path, patch, before, tags });
    }
  }

  const count = {};
  for (const c of changes) {
    for (const t of new Set(c.tags)) count[t] = (count[t] || 0) + 1;
    console.log(`[${[...new Set(c.tags)].join(" ")}] ${c.path.replace(AGENCY + "/", "")}`);
    for (const [k, v] of Object.entries(c.patch)) console.log(`     ${k}: ${c.before[k] ?? "(비어 있음)"}\n   → ${v}`);
  }
  console.log(`\n대상 ${changes.length}건`, count, APPLY ? "(저장)" : "(미리보기 — 저장하려면 --apply)");
  if (!APPLY || changes.length === 0) process.exit(0);

  const backup = { createdAt: Date.now(), items: changes.map(({ path, patch, before }) => ({ path, before, after: patch })) };
  fs.writeFileSync(path.join(__dirname, "backup-data-batch-1.json"), JSON.stringify(backup, null, 2));
  await db.doc("admin_backups/data-batch-1").set(backup);
  console.log("백업 저장: admin_backups/data-batch-1 + scripts/backup-data-batch-1.json");

  for (let i = 0; i < changes.length; i += 400) {
    const batch = db.batch();
    changes.slice(i, i + 400).forEach(c => batch.update(c.ref, c.patch));
    await batch.commit();
  }
  console.log("변경 저장 완료");
  process.exit(0);
})().catch(e => { console.error("실패:", e.message); process.exit(1); });
