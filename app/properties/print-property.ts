/** 매물 1건 프린트 — 화면 안에 한 장짜리 소개서 미리보기를 띄우고 '인쇄' 버튼으로 인쇄한다 */

import type { Property } from "@/lib/properties-db";
import { getAgencyDisplayName } from "@/app/expiry/contracts";
import { kstDateStr } from "@/lib/kst";
import { addressStr, fmtNum, m2ToPyeong } from "./helpers";

function esc(s: string): string {
  return (s || "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

export function printProperty(p: Property) {
  const price = p.dealType === "월세"
    ? `${p.price ? fmtNum(p.price) : "0"} / ${p.monthly ? fmtNum(p.monthly) : "0"} 만원`
    : p.price ? `${fmtNum(p.price)} 만원` : "—";
  const pyeong = m2ToPyeong(p.area);
  const rows: [string, string][] = [
    ["종류", `${p.propertyType || ""} · ${p.dealType || ""}`],
    [p.dealType === "월세" ? "보증금 / 월세" : p.dealType === "매매" ? "매매가" : "보증금", price],
    ["전용면적", p.area ? `${p.area}㎡${pyeong ? ` (${pyeong}평)` : ""}` : "—"],
    ["타입", p.unitType || "—"],
    ["방 수", p.rooms ? `${p.rooms}개` : "—"],
    ["방향", p.direction || "—"],
    ["옵션", p.options || "—"],
    ["메모", p.memo || "—"],
  ];
  const agency = getAgencyDisplayName();
  const html = `<!doctype html><html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(addressStr(p))}</title>
<style>
  body{box-sizing:border-box;font-family:-apple-system,"Apple SD Gothic Neo","Malgun Gothic",sans-serif;color:#000;margin:0;padding:20px}
  h1{font-size:26px;margin:0 0 6px;word-break:keep-all}
  .sub{font-size:13px;color:#666;margin-bottom:20px;border-bottom:3px solid #000;padding-bottom:10px}
  table{width:100%;border-collapse:collapse;font-size:17px}
  th{width:28%;text-align:left;background:#f3f4f6;padding:10px 12px;border-bottom:1px solid #ddd;vertical-align:top}
  td{padding:10px 12px;border-bottom:1px solid #ddd;white-space:pre-wrap;word-break:break-all}
  @media print{body{padding:0}}
</style></head><body>
<h1>${esc(addressStr(p))}</h1>
<div class="sub">${agency ? `${esc(agency)} · ` : ""}출력일 ${kstDateStr()}</div>
<table>${rows.map(([k, v]) => `<tr><th>${k}</th><td>${esc(v)}</td></tr>`).join("")}</table>
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
