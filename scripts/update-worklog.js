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
  date: '2026-06-22',
  day: '월',
  category: '버그·디버그',
  work: '[건의 #32] 매출 중복 집계 차단. 원인: 만기→매물 되돌리기 시 원 계약이 closed로 보존되며 수수료 유지 → computeSalesStats가 status 무관 집계라 재계약 반복 시 같은 거래가 다중 계약으로 매출 2~3배. 수정: 정규화 주소+거래종류 dedup(최신 잔금일 1건). 관리자 키로 라이브 데이터 진단(마들렌 910호 3중복·미사헤리움 2중복 확인). 데이터 보존, 화면 자동교정. #32 답변 등록 후 완료.',
  commit: '(이번 세션)',
  note: '건의 #32~#34 모두 처리·답변 완료. 남은 미완료 건의 없음.',
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
