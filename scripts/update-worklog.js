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
  date: "2026-06-22",
  day: "월",
  category: "신규 기능",
  work: "건의함 워크플로 + 단지검색(#34): ① 건의함에 문의번호 #N 표시(등록순). ② 서비스계정 키로 건의함 직접 읽기 스크립트(read-feedback.js) — 복붙 없이 #번호로 지칭. ③ [건의 #34] 매물 등록 단지검색 개선: complex-search API에 type 필터(오피스텔→오피스텔만/상가→상가만), POI 잡음 제거(단지만), 이름 끝 오피스텔·아파트 접미사 제거, PropertyModal 후보 주소 숨김+ComplexPicker 위젯 제거.",
  commit: "0fb2091",
  note: "보드 유동폭 그리드(패널 잘림)도 같이. 미완료 건의: #34(완료)·#33(상가검색)·#32(만기 매출중복).",
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
