/**
 * 작업일지 엑셀 자동 업데이트 (메모리 규칙)
 * - "작업일지" 시트: 새 행을 맨 위(2행)에 삽입 (시간역순)
 * - "일별 요약" 시트: 해당 날짜 행 커밋수·주요변경 갱신
 */
const ExcelJS = require("exceljs");

const FILE = "C:\\HDS\\01_PERSONAL\\Real Estate\\Budongsan_AI_Worklog.xlsx";

// 카테고리 색 (연핑크 = 디자인)
const CATEGORY_FILL = {
  "신규 기능": "FFD9EAD3",
  "UX 개선":  "FFD0E0F0",
  "버그·디버그": "FFF4CCCC",
  "리팩토링": "FFFFF2CC",
  "기획·문서": "FFE1D5E7",
  "디자인":   "FFFCE4EC",
};

const ENTRY = {
  date: '2026-06-23',
  day: '화',
  category: '기획·문서',
  work: '다이어트(단순화)는 데이터로 결정하기로 — 지금 UI는 안 바꾸고 한 달 사용량 모으기. read-usage.js로 라이브 사용량 확인: 어머니(미사금빛TV)는 사실상 매물 등록+같은단지만 사용, 고객·인사이트·매출·실거래·스케줄 기능 거의 0. 한달치가 의미있도록 추적 커버리지 확장(뷰전환·필터·기간선택·단지검색 등 ~6종 추가, 총 ~26종). 메모리에 재검토(~7/23) 계획 기록.',
  commit: '(이번 세션)',
  note: '사용자: 모든 기능 다 추적하고 한달 사용량 본 뒤 다이어트. 한동수=테스트계정 주의. read-usage.js로 확인.',
};

(async () => {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(FILE);

  // ── 작업일지 시트 ──
  const ws = wb.getWorksheet("작업일지");
  if (!ws) throw new Error("작업일지 시트 없음");
  ws.insertRow(2, [ENTRY.date, ENTRY.day, ENTRY.category, ENTRY.work, ENTRY.commit, ENTRY.note]);
  const row = ws.getRow(2);
  const fill = CATEGORY_FILL[ENTRY.category];
  if (fill) {
    row.getCell(3).fill = { type: "pattern", pattern: "solid", fgColor: { argb: fill } };
  }
  row.alignment = { vertical: "middle", wrapText: true };

  // ── 일별 요약 시트 ──
  const sum = wb.getWorksheet("일별 요약");
  if (sum) {
    let found = null;
    sum.eachRow((r, n) => {
      if (n > 1 && String(r.getCell(1).value) === ENTRY.date) found = r;
    });
    if (found) {
      const cur = Number(found.getCell(3).value) || 0;
      found.getCell(3).value = cur + 1;
      const prev = String(found.getCell(4).value || "");
      found.getCell(4).value = prev ? prev + " / 건의함 번호·자동읽기 + 단지검색(#34)" : "건의함 번호·자동읽기 + 단지검색(#34)";
    } else {
      sum.insertRow(2, [ENTRY.date, ENTRY.day, 1, "건의함 번호·자동읽기 + 단지검색(#34)"]);
    }
  }

  await wb.xlsx.writeFile(FILE);
  console.log("작업일지 업데이트 완료");
})().catch(e => { console.error(e.message); process.exit(1); });
