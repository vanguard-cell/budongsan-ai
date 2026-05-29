/**
 * 인쇄용 PDF 생성 — 만기 알림판
 *
 * 어머니 시나리오:
 *  - 매주 한 번 출력
 *  - 사무실 벽에 붙임
 *  - 손님 앞에서도 즉시 확인 가능
 */

import jsPDF from "jspdf";
import type { Contract } from "@/app/expiry/contracts";
import { dDay, dDayLabel, severityOf } from "@/app/expiry/contracts";
import { formatPhone } from "@/app/expiry/contracts";

const COLORS = {
  danger: [220, 38, 38],   // 빨강
  warning: [234, 88, 12],  // 주황
  caution: [202, 138, 4],  // 노랑
  safe: [120, 120, 120],   // 회색
  black: [0, 0, 0],
  gray: [120, 120, 120],
  lightGray: [200, 200, 200],
};

interface PrintOptions {
  agencyName?: string;
  ownerName?: string;
}

/**
 * 만기 알림판 PDF 생성
 * - A4 가로 (landscape)
 * - 위험·주의·예고 계약 자동 정렬
 * - 한 페이지에 ~20건까지 깔끔하게
 */
export function printExpiryBoardPDF(contracts: Contract[], opt: PrintOptions = {}) {
  // 진행 중 + D-90 이내만
  const targets = contracts
    .filter(c => c.status === "active")
    .map(c => ({ c, d: dDay(c.endDate), s: severityOf(dDay(c.endDate)) }))
    .filter(({ s }) => s !== "safe")
    .sort((a, b) => a.d - b.d);

  if (targets.length === 0) {
    alert("출력할 만기 항목이 없습니다 (D-90 이내 진행중 계약 없음)");
    return;
  }

  // A4 가로
  const doc = new jsPDF({ orientation: "landscape", unit: "mm", format: "a4" });

  // 한글 폰트 (jsPDF 기본은 한글 미지원 → addFileToVFS 필요하지만 무거우니
  // 단순 텍스트는 영문/숫자/특수문자로만 + 메인 한글은 PDF 메타로)
  // 실용적인 우회: HTML 캡처 방식 사용 (html2canvas)
  // 여기는 jsPDF 직접 그리되, 한글 깨질 가능성 있어서 가능한 한 영문/숫자 위주로

  const pageWidth = 297;
  const pageHeight = 210;
  const margin = 10;
  const titleY = 18;
  const headerY = 32;
  let rowY = 40;
  const rowHeight = 8;

  // 헤더
  doc.setFontSize(22);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(...COLORS.black as [number, number, number]);
  doc.text("Expiry Board", margin, titleY);

  doc.setFontSize(9);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(...COLORS.gray as [number, number, number]);
  const today = new Date().toISOString().slice(0, 10);
  doc.text(`Printed: ${today}`, pageWidth - margin, titleY, { align: "right" });
  if (opt.agencyName) {
    doc.text(opt.agencyName, pageWidth - margin, titleY + 4, { align: "right" });
  }

  // 컬럼 헤더 라인
  doc.setLineWidth(0.5);
  doc.setDrawColor(...COLORS.black as [number, number, number]);
  doc.line(margin, headerY - 3, pageWidth - margin, headerY - 3);
  doc.line(margin, headerY + 3, pageWidth - margin, headerY + 3);

  doc.setFontSize(9);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(...COLORS.black as [number, number, number]);

  const cols = {
    severity: margin,
    dday: margin + 18,
    endDate: margin + 38,
    type: margin + 62,
    address: margin + 72,
    deposit: margin + 152,
    monthly: margin + 175,
    tenant: margin + 195,
    landlord: margin + 235,
  };

  doc.text("Level", cols.severity, headerY);
  doc.text("D-day", cols.dday, headerY);
  doc.text("Due", cols.endDate, headerY);
  doc.text("Type", cols.type, headerY);
  doc.text("Address", cols.address, headerY);
  doc.text("Deposit", cols.deposit, headerY);
  doc.text("Rent", cols.monthly, headerY);
  doc.text("Tenant", cols.tenant, headerY);
  doc.text("Landlord", cols.landlord, headerY);

  // 데이터 행
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8);

  for (const { c, d, s } of targets) {
    if (rowY > pageHeight - 15) {
      doc.addPage();
      rowY = 25;
    }

    // 색상 배지 (사각형)
    const color = s === "danger" ? COLORS.danger : s === "warning" ? COLORS.warning : COLORS.caution;
    doc.setFillColor(...color as [number, number, number]);
    doc.rect(cols.severity, rowY - 4, 14, 5, "F");
    doc.setTextColor(255, 255, 255);
    doc.text(s.toUpperCase(), cols.severity + 7, rowY - 0.5, { align: "center" });

    doc.setTextColor(...COLORS.black as [number, number, number]);
    doc.text(dDayLabel(d).replace(/일/g, "d"), cols.dday, rowY);
    doc.text(c.endDate, cols.endDate, rowY);
    doc.text(c.type === "전세" ? "Jeonse" : "Wolse", cols.type, rowY);

    // 주소는 길어서 잘라서 표시 (한글이 문제될 수 있어서 영문/숫자만 안전)
    const addrShort = c.address.length > 35 ? c.address.slice(0, 33) + "…" : c.address;
    doc.text(addrShort, cols.address, rowY);

    doc.text(c.deposit ? c.deposit + "만" : "-", cols.deposit, rowY);
    doc.text(c.monthly ? c.monthly + "만" : "-", cols.monthly, rowY);
    doc.text(`${c.tenantName} ${formatPhone(c.tenantPhone)}`, cols.tenant, rowY);
    doc.text(`${c.landlordName} ${formatPhone(c.landlordPhone)}`, cols.landlord, rowY);

    // 행 구분선
    doc.setDrawColor(...COLORS.lightGray as [number, number, number]);
    doc.setLineWidth(0.1);
    doc.line(margin, rowY + 2, pageWidth - margin, rowY + 2);

    rowY += rowHeight;
  }

  // 푸터 — 통계
  const footerY = pageHeight - 8;
  doc.setFontSize(8);
  doc.setTextColor(...COLORS.gray as [number, number, number]);
  const totalDanger = targets.filter(t => t.s === "danger").length;
  const totalWarning = targets.filter(t => t.s === "warning").length;
  const totalCaution = targets.filter(t => t.s === "caution").length;
  doc.text(
    `Total ${targets.length} | Danger ${totalDanger} | Warning ${totalWarning} | Caution ${totalCaution}`,
    margin, footerY,
  );

  const filename = `만기알림판_${today}.pdf`;
  doc.save(filename);
}

/**
 * HTML 기반 PDF (한글 완전 지원)
 * - 실제 사용 시 html2canvas + jsPDF로 만들면 한글 깨짐 없음
 * - 무겁지만 한글 정확함
 */
export async function printExpiryBoardHTML(contracts: Contract[]) {
  const { default: jsPDF } = await import("jspdf");
  const html2canvas = (await import("html2canvas")).default;

  // 진행 중 + D-90 이내만
  const targets = contracts
    .filter(c => c.status === "active")
    .map(c => ({ c, d: dDay(c.endDate), s: severityOf(dDay(c.endDate)) }))
    .filter(({ s }) => s !== "safe")
    .sort((a, b) => a.d - b.d);

  if (targets.length === 0) {
    alert("출력할 만기 항목이 없습니다 (D-90 이내 진행중 계약 없음)");
    return;
  }

  // 임시 div 생성 — 화면 밖에서 렌더링
  const tempDiv = document.createElement("div");
  tempDiv.style.cssText = `
    position: absolute;
    left: -9999px;
    top: 0;
    width: 1123px;
    background: #fff;
    color: #000;
    font-family: -apple-system, "Apple SD Gothic Neo", "Malgun Gothic", sans-serif;
    padding: 32px;
    box-sizing: border-box;
  `;

  const today = new Date().toISOString().slice(0, 10);
  const totalDanger = targets.filter(t => t.s === "danger").length;
  const totalWarning = targets.filter(t => t.s === "warning").length;
  const totalCaution = targets.filter(t => t.s === "caution").length;

  tempDiv.innerHTML = `
    <div style="display:flex;justify-content:space-between;align-items:baseline;border-bottom:3px solid #000;padding-bottom:12px;margin-bottom:20px">
      <div>
        <h1 style="font-size:32px;font-weight:900;margin:0">⏰ 만기 알림판</h1>
        <div style="font-size:13px;color:#666;margin-top:4px">미사금빛공인중개사사무소 · D-90 이내 진행 계약</div>
      </div>
      <div style="text-align:right;font-size:13px;color:#666">
        <div>출력일: ${today}</div>
        <div style="margin-top:4px">
          🔴 위험 <b style="color:#dc2626">${totalDanger}</b> ·
          🟠 주의 <b style="color:#ea580c">${totalWarning}</b> ·
          🟡 예고 <b style="color:#ca8a04">${totalCaution}</b>
        </div>
      </div>
    </div>

    <table style="width:100%;border-collapse:collapse;font-size:12px">
      <thead>
        <tr style="background:#f3f4f6;border-bottom:2px solid #000">
          <th style="padding:8px;text-align:left;font-weight:900">긴급도</th>
          <th style="padding:8px;text-align:left;font-weight:900">D-day</th>
          <th style="padding:8px;text-align:left;font-weight:900">만기일</th>
          <th style="padding:8px;text-align:left;font-weight:900">종류</th>
          <th style="padding:8px;text-align:left;font-weight:900;width:32%">주소</th>
          <th style="padding:8px;text-align:left;font-weight:900">보증금</th>
          <th style="padding:8px;text-align:left;font-weight:900">월세</th>
          <th style="padding:8px;text-align:left;font-weight:900">임차인</th>
          <th style="padding:8px;text-align:left;font-weight:900">임대인</th>
        </tr>
      </thead>
      <tbody>
        ${targets.map(({ c, d, s }) => {
          const sevColor = s === "danger" ? "#dc2626" : s === "warning" ? "#ea580c" : "#ca8a04";
          const sevLabel = s === "danger" ? "위험" : s === "warning" ? "주의" : "예고";
          const rowBg = s === "danger" ? "#fef2f2" : s === "warning" ? "#fff7ed" : "#fefce8";
          return `
            <tr style="background:${rowBg};border-bottom:1px solid #ddd">
              <td style="padding:7px"><span style="background:${sevColor};color:#fff;padding:2px 8px;border-radius:4px;font-weight:700;font-size:11px">${sevLabel}</span></td>
              <td style="padding:7px;font-weight:700">${dDayLabel(d)}</td>
              <td style="padding:7px">${c.endDate}</td>
              <td style="padding:7px">${c.type}</td>
              <td style="padding:7px;font-weight:500">${escapeHtml(c.address)}</td>
              <td style="padding:7px">${c.deposit ? c.deposit + "만" : "-"}</td>
              <td style="padding:7px">${c.monthly ? c.monthly + "만" : "-"}</td>
              <td style="padding:7px;font-size:11px">
                <div style="font-weight:700">${escapeHtml(c.tenantName)}</div>
                <div style="color:#555">${formatPhone(c.tenantPhone)}</div>
              </td>
              <td style="padding:7px;font-size:11px">
                <div style="font-weight:700">${escapeHtml(c.landlordName)}</div>
                <div style="color:#555">${formatPhone(c.landlordPhone)}</div>
              </td>
            </tr>
          `;
        }).join("")}
      </tbody>
    </table>

    <div style="margin-top:20px;padding-top:12px;border-top:1px solid #ddd;font-size:11px;color:#777;text-align:center">
      ※ 만기 3개월(D-90) 이내 진행 계약만 표시 · 종료된 계약 제외
    </div>
  `;

  document.body.appendChild(tempDiv);

  try {
    const canvas = await html2canvas(tempDiv, { scale: 2, backgroundColor: "#fff" });
    const imgData = canvas.toDataURL("image/png");

    const pdf = new jsPDF({ orientation: "landscape", unit: "mm", format: "a4" });
    const pageWidth = 297;
    const pageHeight = 210;
    const imgRatio = canvas.width / canvas.height;
    const pdfRatio = pageWidth / pageHeight;

    let imgWidth: number, imgHeight: number;
    if (imgRatio > pdfRatio) {
      imgWidth = pageWidth - 10;
      imgHeight = imgWidth / imgRatio;
    } else {
      imgHeight = pageHeight - 10;
      imgWidth = imgHeight * imgRatio;
    }

    pdf.addImage(imgData, "PNG", (pageWidth - imgWidth) / 2, 5, imgWidth, imgHeight);
    pdf.save(`만기알림판_${today}.pdf`);
  } finally {
    document.body.removeChild(tempDiv);
  }
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
