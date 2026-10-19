/** 매물 1건 프린트 — 화면 안에 한 장짜리 소개서 미리보기를 띄우고 '인쇄' 버튼으로 인쇄한다 */

import type { Property, ComplexInfo } from "@/lib/properties-db";
import { getAgencyDisplayName } from "@/app/expiry/contracts";
import { kstDateStr } from "@/lib/kst";
import { addressStr, fmtNum, m2ToPyeong } from "./helpers";

function esc(s: string): string {
  return (s || "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

/** 20200730 · 2020.07.30 · 2020/7/30 → 2020-07-30 (읽을 수 없는 형태는 그대로) */
function fmtApprovalDate(v?: string): string {
  const t = (v || "").trim();
  const m = t.match(/^(\d{4})\D?(\d{1,2})\D?(\d{1,2})\D*$/);
  return m ? `${m[1]}-${m[2].padStart(2, "0")}-${m[3].padStart(2, "0")}` : t;
}

export function printProperty(p: Property, info?: ComplexInfo) {
  const price = p.dealType === "월세"
    ? `${p.price ? fmtNum(p.price) : "0"} / ${p.monthly ? fmtNum(p.monthly) : "0"} 만원`
    : p.price ? `${fmtNum(p.price)} 만원` : "—";
  const pyeong = m2ToPyeong(p.area);
  const dash = (v?: string) => (v && v.trim() ? v : "");
  const man = (v?: string) => (v && v.trim() ? `${fmtNum(v)}` : "");
  const dealLabel = p.dealType === "월세" ? "보증금 / 월세" : p.dealType === "매매" ? "매매가" : "보증금";
  const phone = (name?: string, tel?: string, carrier?: string) =>
    [dash(name), dash(tel), dash(carrier) ? `(${carrier})` : ""].filter(Boolean).join(" ");
  const extras = (p.extraContacts || []).filter(c => c.name || c.phone);
  // 칸 하나: [이름표, 값] — 옛날 프로그램 화면처럼 칸칸이 나누어 한 장에 담는다
  const cell = (k: string, v: string, span = 1) =>
    `<div class="c" style="grid-column:span ${span}"><span class="k">${esc(k)}</span><span class="v">${esc(v) || "&nbsp;"}</span></div>`;
  const box = (title: string, body: string) =>
    `<div class="box"><div class="bt">${esc(title)}</div><div class="bb">${body}</div></div>`;
  const cells = [
    cell("종류", [p.propertyType, p.dealType].filter(Boolean).join(" · ")),
    cell("동", p.dong), cell("호", p.ho),
    cell("전용면적", p.area ? `${p.area}㎡${pyeong ? ` (${pyeong}평)` : ""}` : ""),
    cell("타입", p.unitType), cell("방향", p.direction),
    cell("방 수", p.rooms ? `${p.rooms}개` : ""),
    cell(dealLabel, p.dealType === "월세" ? `${man(p.price) || "0"} / ${man(p.monthly) || "0"} 만원` : man(p.price) ? `${man(p.price)} 만원` : "", 2),
    cell("현재 보증금 / 월세", p.tenantDeposit || p.tenantMonthly ? `${man(p.tenantDeposit) || "0"} / ${man(p.tenantMonthly) || "0"} 만원` : "", 2),
    cell("임대차 만기", p.leaseEndDate),
    cell("옵션", p.options, 3),
    ...(info?.approvalDate || info?.households
      ? [cell("사용승인일", fmtApprovalDate(info.approvalDate)), cell("세대수", info.households ? `${fmtNum(info.households)}세대` : ""), cell("", "")]
      : []),
  ].join("");
  const people = [
    cell("집주인", phone(p.ownerName, p.ownerPhone, p.ownerCarrier), 3),
    ...extras.map(c => cell(c.relation || "연락처", phone(c.name, c.phone), 3)),
    cell("세입자", phone(p.tenantName, p.tenantPhone), 3),
  ].join("");
  const agency = getAgencyDisplayName();
  const html = `<!doctype html><html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(addressStr(p))}</title>
<style>
  *{box-sizing:border-box}
  body{font-family:-apple-system,"Apple SD Gothic Neo","Malgun Gothic",sans-serif;color:#000;margin:0;padding:16px}
  h1{font-size:22px;margin:0 0 4px;word-break:keep-all}
  .sub{font-size:12px;color:#666;margin-bottom:12px}
  .box{border:2px solid #7a1f4d;margin-bottom:10px}
  .bt{background:#7a1f4d;color:#fff;font-size:13px;font-weight:700;padding:3px 8px}
  .bb{display:grid;grid-template-columns:repeat(3,1fr)}
  .c{display:flex;flex-direction:column;border:1px solid #d9b8c9;padding:4px 8px;min-height:44px;min-width:0}
  .k{font-size:11px;color:#7a1f4d;font-weight:700;white-space:nowrap}
  .v{font-size:16px;font-weight:600;white-space:pre-wrap;word-break:break-all}
  .memo{min-height:160px;padding:8px;font-size:15px;white-space:pre-wrap;word-break:break-all}
  @media print{body{padding:0}@page{margin:10mm}}
</style></head><body>
<h1>${esc(addressStr(p))}</h1>
<div class="sub">${agency ? `${esc(agency)} · ` : ""}출력일 ${kstDateStr()}</div>
${box("매물 정보", cells)}
${box("연락처", people)}
<div class="box"><div class="bt">메모 / 상담 내용</div><div class="memo">${esc(p.memo)}</div></div>
<script>window.onload=function(){setTimeout(function(){window.print()},200)}</script>
</body></html>`;
  // 새 창 대신 화면 안에 미리보기를 띄우고, 위의 '인쇄' 버튼으로 인쇄 (휴대폰에서도 미리보기 가능)
  const old = document.getElementById("print-property-preview");
  if (old) old.remove();
  const wrap = document.createElement("div");
  wrap.id = "print-property-preview";
  wrap.style.cssText = "position:fixed;inset:0;z-index:99999;background:#e5e7eb;display:flex;flex-direction:column";
  const bar = document.createElement("div");
  bar.style.cssText = "display:flex;gap:8px;padding:10px;background:#111;justify-content:flex-end";
  const btnCss = "padding:10px 18px;border-radius:8px;font-size:16px;font-weight:700;border:0;white-space:nowrap";
  const close = document.createElement("button");
  close.textContent = "닫기";
  close.style.cssText = btnCss + ";background:#e5e7eb;color:#111";
  close.onclick = () => wrap.remove();
  const doPrint = document.createElement("button");
  doPrint.textContent = "🖨️ 인쇄";
  doPrint.style.cssText = btnCss + ";background:#facc15;color:#111";
  const f = document.createElement("iframe");
  f.style.cssText = "flex:1;width:100%;border:0;background:#fff";
  f.srcdoc = html.replace(/<script>[\s\S]*?<\/script>/, "");
  doPrint.onclick = () => {
    const cw = f.contentWindow;
    if (!cw) return;
    try { cw.focus(); cw.print(); } catch { alert("프린트 창을 열 수 없어요."); }
  };
  bar.append(close, doPrint);
  wrap.append(bar, f);
  document.body.appendChild(wrap);
}
