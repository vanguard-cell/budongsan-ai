/**
 * 사용량 리포트 — 유저별 메뉴 방문(pageViews) + 기능 사용(features) 집계
 * 다이어트(뭘 숨기고 뺄지) 근거 데이터.
 *   node scripts/read-usage.js
 */
const { initializeApp, cert } = require("firebase-admin/app");
const { getFirestore } = require("firebase-admin/firestore");
const path = require("path");
const fs = require("fs");

const KEY = process.env.GOOGLE_APPLICATION_CREDENTIALS || path.join(__dirname, "..", "serviceAccountKey.json");
if (!fs.existsSync(KEY)) { console.error("❌ serviceAccountKey.json 없음"); process.exit(1); }
initializeApp({ credential: cert(require(KEY)), projectId: "budongsan-ai" });
const db = getFirestore();

const PAGE_LABEL = { dashboard: "홈", properties: "매물", expiry: "만기", customers: "고객", schedule: "스케줄", sales: "매출", insights: "인사이트", "market-price": "실거래", team: "직원", feedback: "건의함", admin: "유저관리", more: "더보기", "ai-content": "AI문구" };
const FEAT_LABEL = { prop_add: "매물 등록", prop_edit: "매물 수정", prop_contract: "계약 진행", prop_to_expiry: "만기로 보내기", prop_same: "같은단지 추가", prop_excel: "매물 엑셀", complex_pick: "단지 선택", cust_add: "고객 등록", cust_kakao: "카톡 붙여넣기", cust_stage: "고객 단계이동", cust_log: "고객 여정기록", contract_renew: "재계약", contract_reopen: "매물로 되돌리기", contract_close: "관리 종료", sched_add: "스케줄 추가", sched_done: "스케줄 완료", mp_bulk: "실거래 평형별", mp_manual: "실거래 직접", ai_generate: "AI 문구생성", fb_new: "건의함 작성", cust_view_table: "고객 표뷰", cust_board_open: "고객 보드열기", cust_filter: "고객 필터", prop_view_table: "매물 표뷰", sales_period: "매출 기간선택", insights_period: "인사이트 기간선택", prop_search: "매물 검색", prop_filter: "매물 필터", prop_sort: "매물 정렬", prop_export: "매물 내보내기", cust_edit: "고객 수정", cust_search: "고객 검색", cust_sort: "고객 정렬", cust_drop: "고객 이탈처리", cust_close: "고객 거래완료", cust_match: "고객 매칭", cust_export: "고객 내보내기", expiry_view_table: "만기 표뷰", expiry_filter: "만기 필터", expiry_sort: "만기 정렬", expiry_print: "만기 인쇄", expiry_sms: "만기 문자", expiry_export: "만기 내보내기", sched_filter: "스케줄 필터", sched_date: "스케줄 날짜클릭", ai_copy: "AI 복사", ai_pdf: "AI PDF", fb_reply: "건의함 답글" };

function bars(obj, labels) {
  const e = Object.entries(obj || {}).filter(([, n]) => n > 0).sort((a, b) => b[1] - a[1]);
  if (!e.length) return "    (기록 없음)";
  const max = e[0][1];
  return e.map(([k, n]) => `    ${(labels[k] || k).padEnd(12)} ${"█".repeat(Math.max(1, Math.round(n / max * 24)))} ${n}`).join("\n");
}

(async () => {
  const snap = await db.collection("users").get();
  const agg = { pv: {}, ft: {} };
  for (const d of snap.docs) {
    const x = d.data();
    const name = x.displayName || x.email || d.id.slice(0, 8);
    const pv = x.pageViews || {}, ft = x.features || {};
    const pvTot = Object.values(pv).reduce((a, b) => a + b, 0);
    const ftTot = Object.values(ft).reduce((a, b) => a + b, 0);
    if (pvTot === 0 && ftTot === 0) continue;
    console.log(`\n👤 ${name}  (접속 ${x.loginCount || 0}회)`);
    console.log("  📑 메뉴 방문");
    console.log(bars(pv, PAGE_LABEL));
    console.log("  🛠  기능 사용");
    console.log(bars(ft, FEAT_LABEL));
    for (const [k, n] of Object.entries(pv)) agg.pv[k] = (agg.pv[k] || 0) + n;
    for (const [k, n] of Object.entries(ft)) agg.ft[k] = (agg.ft[k] || 0) + n;
  }
  console.log("\n" + "=".repeat(50));
  console.log("📊 전체 합계 — 메뉴 방문");
  console.log(bars(agg.pv, PAGE_LABEL));
  console.log("📊 전체 합계 — 기능 사용");
  console.log(bars(agg.ft, FEAT_LABEL));
  process.exit(0);
})().catch(e => { console.error(e.message); process.exit(1); });
