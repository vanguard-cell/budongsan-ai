/**
 * 실시간 구독 공유 — 같은 데이터(사무소+컬렉션)는 앱 전체에서 리스너 하나만 유지
 *
 * 화면마다 subscribeContracts·subscribeProperties … 를 따로 열면, 화면을 옮길 때마다
 * 리스너가 닫혔다 다시 열려 수백 건을 다시 읽음(Firebase 무료 한도 초과 원인).
 * 여기서 리스너를 공유하고, 마지막 화면이 닫힌 뒤에도 KEEP_MS 동안 유지해서
 * 다른 화면으로 옮겨도 다시 읽지 않게 함. (바뀐 문서만 받음)
 *
 * 연결이 끊기면(한도 초과·네트워크 등) 이미 보여주던 목록은 그대로 두고(빈 목록으로 바꾸지 않음 —
 * "매물이 갑자기 다 없어졌다"로 보이던 문제), 화면 위에 안내를 띄운 뒤 잠시 후 다시 연결한다.
 */
import type { Unsubscribe } from "firebase/firestore";

const KEEP_MS = 20 * 60 * 1000;
const RETRY_MIN_MS = 30_000;
const RETRY_MAX_MS = 5 * 60_000;

/** 연결 상태 알림 — LiveStatusBanner 가 받아서 표시 */
export const LIVE_STATUS_EVENT = "live-status";
const failedKeys = new Set<string>();
function reportStatus(key: string, ok: boolean) {
  const had = failedKeys.size > 0;
  if (ok) failedKeys.delete(key); else failedKeys.add(key);
  const has = failedKeys.size > 0;
  if (had !== has && typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent(LIVE_STATUS_EVENT, { detail: { ok: !has } }));
  }
}
export function liveHasError(): boolean {
  return failedKeys.size > 0;
}

interface Entry {
  unsub: Unsubscribe | null;
  listeners: Set<(v: unknown) => void>;
  last?: unknown;
  timer?: ReturnType<typeof setTimeout>;
  retryTimer?: ReturnType<typeof setTimeout>;
  retries: number;
}

const entries = new Map<string, Entry>();

/** 배열은 받는 화면마다 복사본 — 한 화면이 정렬(in-place)해도 다른 화면에 영향 없게 */
const copy = <T,>(v: T): T => (Array.isArray(v) ? (v.slice() as T) : v);

export function sharedSubscribe<T>(
  key: string,
  /** failed(empty): 구독이 끊겼을 때 호출. 한 번도 못 받았으면 empty 를 보여줘 '불러오는 중'에서 멈추지 않게 */
  start: (emit: (v: T) => void, failed: (empty: T) => void) => Unsubscribe,
  onChange: (v: T) => void,
): Unsubscribe {
  let e = entries.get(key);
  if (!e) {
    e = { unsub: null, listeners: new Set(), retries: 0 };
    entries.set(key, e);
  }
  const entry = e;
  if (entry.timer) { clearTimeout(entry.timer); entry.timer = undefined; }

  const listener = onChange as (v: unknown) => void;
  entry.listeners.add(listener);

  if (entry.last !== undefined) {
    // 이미 받은 데이터가 있으면 바로 전달 (구독 함수가 동기로 콜백하지 않던 기존 동작과 맞춰 비동기로)
    const last = entry.last;
    queueMicrotask(() => { if (entry.listeners.has(listener)) listener(copy(last)); });
  }

  const connect = () => {
    entry.unsub = start(
      v => {
        entry.last = v;
        entry.retries = 0;
        reportStatus(key, true);
        entry.listeners.forEach(l => l(copy(v)));
      },
      empty => {
        // 끊긴 리스너는 버리고, 보여주던 목록은 유지한 채 잠시 후 다시 연결
        entry.unsub = null;
        reportStatus(key, false);
        if (entry.last === undefined) entry.listeners.forEach(l => l(copy(empty)));
        if (entry.retryTimer || entries.get(key) !== entry) return;
        const delay = Math.min(RETRY_MAX_MS, RETRY_MIN_MS * 2 ** entry.retries);
        entry.retries++;
        entry.retryTimer = setTimeout(() => {
          entry.retryTimer = undefined;
          if (entries.get(key) === entry && !entry.unsub) connect();
        }, delay);
      },
    );
  };
  if (!entry.unsub && !entry.retryTimer) connect();

  let done = false;
  return () => {
    if (done) return;
    done = true;
    entry.listeners.delete(listener);
    if (entry.listeners.size === 0 && !entry.timer) {
      entry.timer = setTimeout(() => {
        entry.timer = undefined;
        if (entry.listeners.size > 0) return;
        entry.unsub?.();
        if (entry.retryTimer) clearTimeout(entry.retryTimer);
        reportStatus(key, true);
        entries.delete(key);
      }, KEEP_MS);
    }
  };
}
