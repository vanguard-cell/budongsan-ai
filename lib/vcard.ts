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

/* 한글이 깨지지 않게(건의 #209): 2.1 규격 + UTF-8 QUOTED-PRINTABLE, 파일 맨 앞 표시(BOM)는 넣지 않는다.
   (BOM이 있으면 갤럭시 연락처 앱이 파일 첫 줄을 못 읽어 글자 규칙을 무시하는 경우가 있어 뺌) */
function qp(s: string): string {
  const bytes = new TextEncoder().encode(s.replace(/\r?\n/g, " "));
  let out = "";
  for (const b of bytes) out += "=" + b.toString(16).toUpperCase().padStart(2, "0");
  return out;
}

export function buildVcf(contacts: VcardContact[]): string {
  const lines: string[] = [];
  const enc = "CHARSET=UTF-8;ENCODING=QUOTED-PRINTABLE";
  for (const c of contacts) {
    lines.push("BEGIN:VCARD", "VERSION:2.1", `N;${enc}:${qp(c.name.replace(/;/g, ","))};;;;`, `FN;${enc}:${qp(c.name)}`, `TEL;CELL:${c.phone}`);
    if (c.note) lines.push(`NOTE;${enc}:${qp(c.note)}`);
    lines.push("END:VCARD");
  }
  return lines.join("\r\n") + "\r\n";
}

export function downloadVcf(contacts: VcardContact[], filename: string): void {
  const blob = new Blob([buildVcf(contacts)], { type: "text/x-vcard" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
