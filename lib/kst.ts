/**
 * 한국(KST, UTC+9) 기준 날짜 문자열 유틸.
 *
 * toISOString()은 UTC 기준이라, KST 00:00~09:00 사이의 접속이
 * "어제" 날짜로 기록되는 문제가 있었음. 접속일 집계는 한국 달력 날짜로 통일한다.
 */

/** 주어진 시각(기본 now)의 KST 달력 날짜 "YYYY-MM-DD" */
export function kstDateStr(d: Date = new Date()): string {
  return new Date(d.getTime() + 9 * 60 * 60 * 1000).toISOString().slice(0, 10);
}
