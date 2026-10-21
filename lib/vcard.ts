/**
 * 연락처 파일(.vcf) 만들기 — 갤럭시·아이폰 "연락처 가져오기"용 (건의 #165)
 *
 * 실시간 연동이 아니라 한 번 넘기는 방식. 같은 번호는 한 번만 담는다.
 */

export interface VcardContact {
  name: string;
  phone: string;
  note?: string;
}

function esc(s: string): string {
  return s.replace(/\\/g, "\\\\").replace(/;/g, "\;").replace(/,/g, "\\,").replace(/\r?\n/g, "\\n");
}

export function buildVcf(contacts: VcardContact[]): string {
  const lines: string[] = [];
  for (const c of contacts) {
    lines.push("BEGIN:VCARD", "VERSION:3.0", `FN:${esc(c.name)}`, `N:${esc(c.name)};;;;`, `TEL;TYPE=CELL:${c.phone}`);
    if (c.note) lines.push(`NOTE:${esc(c.note)}`);
    lines.push("END:VCARD");
  }
  return lines.join("\r\n");
}

export function downloadVcf(contacts: VcardContact[], filename: string): void {
  const blob = new Blob([buildVcf(contacts)], { type: "text/vcard;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
