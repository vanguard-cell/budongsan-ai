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
  work: "고객 보드 정비: ① 상단 타임라인→축소 파이프라인 보드 통합(중복 제거, 높이 42vh+아래 목록 걸침). ② 우측 패널 잘림 수정(push xl→lg, SideDrawer pushAt prop). ③ 헤더 옆 단계별 한눈 요약 알약(문의·연락·보여줌·협상·계약·실패 건수). ④ 계약 성사 칸은 최근 30일 완료만 표시(지난 완료는 '완료' 필터 보존, '지난 완료 N건 더보기' 링크). 뷰토글 보드버튼 제거, 고아 CustomerTimeline.tsx 삭제.",
  commit: "4035bf9",
  note: "메뉴 사용량 추적 기능 작동 점검(보안규칙·빌드 OK)도 같이 진행. 커밋 a4b06b7→a7847fc→4035bf9",
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
      found.getCell(4).value = prev ? prev + " / 고객 보드 정비(통합·요약·완료처리)" : "고객 보드 정비(통합·요약·완료처리)";
    } else {
      sum.insertRow(2, [ENTRY.date, ENTRY.day, 1, "고객 보드 정비(통합·요약·완료처리)"]);
    }
  }

  await wb.xlsx.writeFile(FILE);
  console.log("작업일지 업데이트 완료");
})().catch(e => { console.error(e.message); process.exit(1); });
