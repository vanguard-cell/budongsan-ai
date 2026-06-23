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
  category: 'UX 개선',
  work: '홈 대시보드에 문의 답변 도착 알림 배너 추가. 내 건의함 중 lastReplyBy=admin(아직 내가 답 안 한 관리자 답변)이 있으면 인사말 아래 그라데이션 배너+건수 배지 표시 → 클릭 시 /feedback. 어머니가 홈 진입 시 답변 왔는지 즉시 인지. + 건의함 완료 정책 정정: 관리자 임의 완료 금지(어머니 확인 시에만), #32·#33 진행중 환원, set-feedback-status.js 추가.',
  commit: '(이번 세션)',
  note: '건의 #32~#34 답변 등록·진행중 유지. 답변알림 배너 신규.',
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
