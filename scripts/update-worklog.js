/**
 * 작업일지 엑셀 자동 업데이트 (메모리 규칙)
 * - "작업일지" 시트: 새 행을 맨 위(2행)에 삽입 (시간역순)
 * - "일별 요약" 시트: 해당 날짜 행 커밋수·주요변경 갱신
 */
const ExcelJS = require("exceljs");

const FILE = "C:\\HDS\\01_PERSONAL\\Budongsan_AI_Worklog.xlsx";

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
  date: '2026-10-02',
  day: '금',
  category: '신규 기능',
  work: '건의함 3건 처리 — #39 스케줄에 재계약 일정 추가(일정 종류 \'재계약일\' + 재계약 탭·버튼, 만기관리에서 재계약 처리한 계약은 계약/잔금 두 건 대신 \'재계약\' 한 건으로 표시). 달력에 한국 공휴일(설·추석·대체공휴일·선거일, 2025~2028) 빨간 날짜+이름 표시. 네이버 캘린더 질문 → 실시간 연동은 불가, \'캘린더로 내보내기\'(.ics) 버튼 추가. #36 후속 — 수정 모달 메모 칸(매물·고객·만기)에 날짜 자동: 빈 칸 누르면 오늘 날짜, 엔터=다음 줄+오늘 날짜, Shift+엔터=날짜 없이 줄바꿈. #38 옵션 칸은 9/12 반영분 답변만.',
  commit: '3835d11',
  note: '건의 #36·#38·#39 (미사금빛TV). 답글은 앱에서 직접(serviceAccountKey.json 없음). 공휴일 표는 2028년까지 — 2029년부터는 lib/holidays.ts에 추가 필요.',
  summary: '스케줄 재계약·공휴일·캘린더 내보내기 + 메모 날짜 자동(건의 3건)',
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
      found.getCell(4).value = prev ? prev + " / " + ENTRY.summary : ENTRY.summary;
    } else {
      sum.insertRow(2, [ENTRY.date, ENTRY.day, 1, ENTRY.summary]);
    }
  }

  await wb.xlsx.writeFile(FILE);
  console.log("작업일지 업데이트 완료");
})().catch(e => { console.error(e.message); process.exit(1); });
