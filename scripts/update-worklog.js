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
  category: "UX 개선",
  work: "고객 관리 상단 타임라인 → 축소 파이프라인 보드로 통합(중복 제거). 같은 자리에 보드 상시 노출(접기 가능), 높이 42vh 제한+단일 스크롤로 아래 고객 목록이 걸쳐 보이게. 우측 패널 잘림 수정: push 시작 폭 xl→lg + SideDrawer pushAt prop 추가(딤 배경 동기화). 뷰 토글 보드버튼 제거(카드/표만), ?view=board 딥링크는 카드+보드펼침 매핑. 고아 CustomerTimeline.tsx 삭제.",
  commit: "a4b06b7",
  note: "메뉴 사용량 추적 기능 작동 점검(보안규칙·빌드 OK)도 같이 진행",
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
      found.getCell(4).value = prev ? prev + " / 타임라인→보드 통합·패널잘림 수정" : "타임라인→보드 통합·패널잘림 수정";
    } else {
      sum.insertRow(2, [ENTRY.date, ENTRY.day, 1, "타임라인→보드 통합·패널잘림 수정"]);
    }
  }

  await wb.xlsx.writeFile(FILE);
  console.log("작업일지 업데이트 완료");
})().catch(e => { console.error(e.message); process.exit(1); });
