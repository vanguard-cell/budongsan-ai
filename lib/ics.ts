/**
 * 캘린더 파일(.ics) 만들기 — 네이버·구글·아이폰 캘린더 "가져오기"용 (건의 #39)
 *
 * 실시간 연동이 아니라 한 번 넘기는 방식. 같은 일정을 다시 가져오면
 * UID가 같아서 대부분의 캘린더가 덮어쓴다(중복 최소화).
 */

export interface IcsEvent {
  uid: string;
  date: string;          // YYYY-MM-DD
  time?: string;         // HH:MM (없으면 종일 일정)
  title: string;
  description?: string;
}

function esc(s: string): string {
  return s.replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\r?\n/g, "\\n");
}
/** Date → 20261002T010000Z (UTC) */
function utcStamp(d: Date): string {
  return d.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
}

export function buildIcs(events: IcsEvent[], calName = "딜던 스케줄"): string {
  const now = utcStamp(new Date());
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//DealDone//Schedule//KO",
    "CALSCALE:GREGORIAN",
    `X-WR-CALNAME:${esc(calName)}`,
  ];
  for (const ev of events) {
    lines.push("BEGIN:VEVENT", `UID:${ev.uid}@dealdone`, `DTSTAMP:${now}`);
    if (ev.time) {
      // 한국 시간 기준 → UTC로 변환 (시간대 정의 없이도 모든 캘린더가 정확히 읽음), 1시간짜리
      const start = new Date(`${ev.date}T${ev.time}:00+09:00`);
      const end = new Date(start.getTime() + 60 * 60 * 1000);
      lines.push(`DTSTART:${utcStamp(start)}`, `DTEND:${utcStamp(end)}`);
    } else {
      const d = ev.date.replace(/-/g, "");
      const next = new Date(`${ev.date}T00:00:00Z`);
      next.setUTCDate(next.getUTCDate() + 1);
      lines.push(`DTSTART;VALUE=DATE:${d}`, `DTEND;VALUE=DATE:${next.toISOString().slice(0, 10).replace(/-/g, "")}`);
    }
    lines.push(`SUMMARY:${esc(ev.title)}`);
    if (ev.description) lines.push(`DESCRIPTION:${esc(ev.description)}`);
    lines.push("END:VEVENT");
  }
  lines.push("END:VCALENDAR");
  return lines.join("\r\n");
}

export function downloadIcs(events: IcsEvent[], filename: string): void {
  const blob = new Blob([buildIcs(events)], { type: "text/calendar;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
