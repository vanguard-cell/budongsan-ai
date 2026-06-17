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
  date: "2026-06-16",
  day: "화",
  category: "버그·디버그",
  work: "건의함 처리: ①만기 이전 시 잔금일정 사라짐 → 스케줄에 contracts 구독 추가(계약일/중도금/잔금 표시, 패널은 만기로 연결). ②실거래 최고가 6개월·매매전세월세 max 정상 확인. ③건의함 카드 접이식 전환(기본 접힘+미리보기, 클릭 펼침, 미처리/확인대기는 자동 펼침)",
  commit: "80c77c6",
  note: "매출 빠짐은 이미 contracts 집계로 정상이었음",
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
      found.getCell(4).value = prev ? prev + " / 건의함3건처리" : "건의함3건처리";
    } else {
      sum.insertRow(2, [ENTRY.date, ENTRY.day, 1, "건의함3건처리"]);
    }
  }

  await wb.xlsx.writeFile(FILE);
  console.log("작업일지 업데이트 완료");
})().catch(e => { console.error(e.message); process.exit(1); });
