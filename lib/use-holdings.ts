"use client";

/** 같은 전화번호 주인이 가진 호실 수 — 내 매물·만기 관리·고객명단을 합쳐서 셈 (저장된 데이터는 바꾸지 않고 보여주기만 함, 건의 #212) */

import { useEffect, useMemo, useState } from "react";
import { useAuth } from "./auth-context";
import { subscribeRoster, unitKey, complexKey, complexOf, dongHoOf, type RosterUnit } from "./roster-db";
import { complexShortName } from "./address";

interface UnitLike { address?: string; dong?: string; ho?: string; status?: string }

const digitsOf = (s?: string) => (s || "").replace(/\D/g, "");

/** 건물 비교용 이름 — 괄호 속 동네 이름·시·구·도로명·띄어쓰기를 걷어내고 플라자/프라자 표기를 맞춤 (건의 #226) */
export const buildingKey = (c: string): string =>
  complexKey(complexShortName((c || "").replace(/[(\[][^)\]]*[)\]]/g, " ").replace(/[,]/g, " ").replace(/\s+/g, " ").trim()))
    .replace(/플라자/g, "프라자").replace(/(상가|건물)$/, "");

/** 같은 건물인지 — 이름이 같거나 한쪽이 다른 쪽을 포함(앞에 동네 이름이 붙은 경우 등) */
export const sameBuilding = (a: string, b: string): boolean =>
  a === b || (Math.min(a.length, b.length) >= 4 && (a.includes(b) || b.includes(a)));

/** 호수 글자 속 숫자들 — "611~613"처럼 범위면 사이 호수까지 펼침 (건의 #228) */
const unitNums = (s: string): string[] => {
  const out: string[] = [...(s.match(/\d+/g) || [])];
  for (const m of s.matchAll(/(\d+)\s*호?\s*[~∼-]\s*(\d+)/g)) {
    const from = Number(m[1]), to = Number(m[2]);
    if (to > from && to - from <= 50) for (let n = from + 1; n < to; n++) out.push(String(n));
  }
  return out;
};

/** 주소·호수 칸에서 묶음 호수 글자 — "611~613호", "611,612,613호", "611호~613호", "611.612호" (건의 #228) */
const BUNDLE_IN_ADDRESS = /\d+\s*호?\s*(?:[~∼,./·]\s*\d+\s*호?\s*)*[~∼,./·]\s*\d+\s*호/;
const bundleText = (address: string, ho?: string): string => {
  const h = (ho || "").trim();
  if (/\d\s*(?:호\s*)?[~∼,./·-]\s*\d/.test(h)) return h;
  return (address || "").match(BUNDLE_IN_ADDRESS)?.[0] || "";
};

/** 여러 호실을 묶어 올린 매물인지 (건의 #228) */
export const isBundleUnit = (address: string, ho?: string): boolean => !!bundleText(address, ho);

/** 동·호수가 같은 호실로 볼 만한지 — 한쪽이 비었거나, 숫자가 겹치거나("101,102" / "101"), 층만 적은 경우 그 층의 호수 */
export const unitFits = (a: string, b: string): boolean => {
  if (!a || !b || a === b) return true;
  const na = unitNums(a), nb = unitNums(b);
  if (na.some((x) => nb.some((y) => Number(x) === Number(y)))) return true;
  const floorOnly = (s: string, n: string[]) => /층/.test(s) && !/호/.test(s) && n.length === 1 ? Number(n[0]) : null;
  const fa = floorOnly(a, na), fb = floorOnly(b, nb);
  if (fa !== null && nb.some((y) => Math.floor(Number(y) / 100) === fa)) return true;
  if (fb !== null && na.some((x) => Math.floor(Number(x) / 100) === fb)) return true;
  return false;
};

/** (전화번호) → { count: 보유 호실 수, label: 마우스 올리면 보이는 목록 }. 1건이면 count 1. */
export function useHoldings(
  properties: (UnitLike & { ownerPhone?: string; extraContacts?: { phone?: string }[] })[],
  contracts: (UnitLike & { landlordPhone?: string })[],
): (phone?: string, address?: string, dong?: string, ho?: string, phone2?: string) => { count: number; label: string; others: string[]; lines: string[] } {
  const { user } = useAuth();
  const [roster, setRoster] = useState<RosterUnit[]>([]);
  useEffect(() => {
    if (!user?.agencyId) return;
    return subscribeRoster(user.agencyId, setRoster);
  }, [user?.agencyId]);

  const map = useMemo(() => {
    const m = new Map<string, Map<string, { complex: string; dong: string; ho: string; name: string; bundle: boolean }>>(); // 전화 숫자 → (호실 키 → 호실 정보)
    const add = (phone: string | undefined, address: string, dong?: string, ho?: string) => {
      const d = digitsOf(phone);
      if (d.length < 9) return;
      const dh = dongHoOf(address, dong, ho);
      const complex = complexOf(address, dong, ho);
      const key = unitKey(complex, dh.dong, dh.ho);
      const name = [complex, dh.dong && `${dh.dong}동`, dh.ho && `${dh.ho}호`].filter(Boolean).join(" ");
      const info = { complex, dong: dh.dong, ho: dh.ho, name: name || address, bundle: isBundleUnit(address, ho) };
      if (!m.has(d)) m.set(d, new Map());
      m.get(d)!.set(key, info);
    };
    for (const p of properties) if (p.status !== "closed") {
      add(p.ownerPhone, p.address || "", p.dong, p.ho);
      for (const x of (p.extraContacts || []).slice(0, 2)) add(x?.phone, p.address || "", p.dong, p.ho); // 공동명의 등 추가 전화 (건의 #214)
    }
    for (const c of contracts) if (c.status !== "closed") add(c.landlordPhone, c.address || "", c.dong, c.ho);
    for (const u of roster) {
      add(u.ownerPhone, u.complex, u.dong, u.ho);
      add(u.owner2Phone, u.complex, u.dong, u.ho);
    }
    return m;
  }, [properties, contracts, roster]);

  return (phone, address, dong, ho, phone2) => {
    const m1 = map.get(digitsOf(phone));
    const m2 = phone2 && digitsOf(phone2) !== digitsOf(phone) ? map.get(digitsOf(phone2)) : undefined;
    const units = m1 && m2 ? new Map([...m1, ...m2]) : (m1 || m2);
    if (!units) return { count: 0, label: "", others: [], lines: [] };
    const dh = dongHoOf(address || "", dong, ho);
    const complex = complexOf(address || "", dong, ho);
    const self = unitKey(complex, dh.dong, dh.ho);
    const ck = complexKey(complex);
    // 같은 건물이고 동·호수가 겹치거나 한쪽이 비어 있으면 같은 호실로 본다 — 같은 상가를 월세·매매로 따로 올려도 '보유'로 안 나오게 (건의 #226)
    const bk = buildingKey(complex);
    // 지금 보는 매물이 묶음(611~613호)이면 그 안의 호수들도 자기 호실로 (건의 #228)
    const selfHo = bundleText(address || "", ho) || dh.ho;
    const isSelf = (k: string, u: { complex: string; dong: string; ho: string; bundle: boolean }) => {
      if (k === self) return true;
      if (u.bundle) return true; // 여러 호실 묶음 매물(611~613호)은 낱개 호실과 겹치므로 '보유'에 안 보임 (건의 #228)
      return sameBuilding(buildingKey(u.complex), bk) && unitFits(u.dong, dh.dong) && unitFits(u.ho, selfHo);
    };
    const others = [...units.entries()].filter(([k, u]) => !isSelf(k, u)).map(([, u]) => {
      // 같은 단지면 동·호수만, 다른 단지면 단지 이름도 함께
      const same = complexKey(u.complex) === ck;
      const unit = [u.dong && `${u.dong}동`, u.ho && `${u.ho}호`].filter(Boolean).join(" ");
      return same && unit ? unit : u.name;
    });
    // 줄 나누기: 같은 단지는 호실만 한 줄, 다른 단지는 단지별로 한 줄씩 (건의 #212)
    const groups = new Map<string, { complex: string; same: boolean; units: string[] }>();
    for (const [k, u] of units.entries()) {
      if (isSelf(k, u)) continue;
      const gk = complexKey(u.complex);
      const unit = [u.dong && `${u.dong}동`, u.ho && `${u.ho}호`].filter(Boolean).join(" ") || u.name;
      if (!groups.has(gk)) groups.set(gk, { complex: u.complex, same: gk === ck, units: [] });
      groups.get(gk)!.units.push(unit);
    }
    const lines = [...groups.values()].sort((a, b) => Number(b.same) - Number(a.same))
      .map((g) => g.same ? g.units.join(", ") : `${g.complex} ${g.units.join(", ")}`.trim());
    return { count: others.length + 1, lines, label: others.slice(0, 20).join("\n"), others };
  };
}
