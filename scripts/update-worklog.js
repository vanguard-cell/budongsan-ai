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
  date: '2026-09-12',
  day: '토',
  category: '신규 기능',
  work: '건의함 3건 처리 — #38 매물 옵션 칸 추가(자주 쓰는 옵션 8종 칩 + 직접 입력, 쉼표 구분. 카드 칩·상세 줄·엑셀 입출력 반영, AI 광고문구의 옵션 형식과 통일). #37 집주인 통신사 칸 추가(SKT·KT·LG U+·알뜰폰 칩, 다시 누르면 해제. 카드 배지·상세 줄·엑셀 열). #36 메모 엔터 안 되던 문제 — 한 줄 input이던 메모 칸을 여러 줄 textarea로 교체(매물·고객 상세의 활동 메모, 고객 타임라인 메모 수정, 고객 수정 모달), 엔터=줄바꿈·저장은 버튼(Ctrl+엔터도 가능), 저장된 메모·이력이 줄바꿈 그대로 보이도록 표시 수정.',
  commit: 'dad5139',
  note: '건의 #36·#37·#38 (미사금빛TV). 답글은 앱에서 직접(serviceAccountKey.json 없음). 만기 관리의 임대인 통신사는 미적용. 작업일지 저장 경로가 폴더 이동으로 깨져 있어 함께 수정 — 6/2 이후 기록이 빠져 있음.',
  summary: '매물 옵션·집주인 통신사 칸 + 메모 줄바꿈(건의 3건)',
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
