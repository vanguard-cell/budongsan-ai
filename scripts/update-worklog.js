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
  category: "신규 기능",
  work: "인사이트 보강+사이드바 깨짐 수정: 사이드바 nav에 min-h-0(항목 많아도 축소·스크롤, 하단 겹침 방지). 파이프라인 퍼널을 Pipedrive식 가로진행(단계 막대+다음단계 전환% 화살표)으로 재설계. 처리현황 가로 스택바(진행중/성사/실패) 추가. (앞서 보드+대시보드 구현, 단계정의·포기연동)",
  commit: "a773a21",
  note: "동시 작업분(손님→고객 명칭통일·페이지추적·또다른 사이드바픽스)과 rebase 머지",
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
      found.getCell(4).value = prev ? prev + " / 인사이트 보강+사이드바픽스" : "인사이트 보강+사이드바픽스";
    } else {
      sum.insertRow(2, [ENTRY.date, ENTRY.day, 1, "인사이트 보강+사이드바픽스"]);
    }
  }

  await wb.xlsx.writeFile(FILE);
  console.log("작업일지 업데이트 완료");
})().catch(e => { console.error(e.message); process.exit(1); });
