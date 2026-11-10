"use client";

/** 같은 전화번호 주인이 가진 호실 수 — 내 매물·만기 관리·고객명단을 합쳐서 셈 (저장된 데이터는 바꾸지 않고 보여주기만 함, 건의 #212) */

import { useEffect, useMemo, useState } from "react";
import { useAuth } from "./auth-context";
import { subscribeRoster, unitKey, complexKey, complexOf, dongHoOf, type RosterUnit } from "./roster-db";

interface UnitLike { address?: string; dong?: string; ho?: string; status?: string }

const digitsOf = (s?: string) => (s || "").replace(/\D/g, "");

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
    const m = new Map<string, Map<string, { complex: string; dong: string; ho: string; name: string }>>(); // 전화 숫자 → (호실 키 → 호실 정보)
    const add = (phone: string | undefined, address: string, dong?: string, ho?: string) => {
      const d = digitsOf(phone);
      if (d.length < 9) return;
      const dh = dongHoOf(address, dong, ho);
      const complex = complexOf(address, dong, ho);
      const key = unitKey(complex, dh.dong, dh.ho);
      const name = [complex, dh.dong && `${dh.dong}동`, dh.ho && `${dh.ho}호`].filter(Boolean).join(" ");
      const info = { complex, dong: dh.dong, ho: dh.ho, name: name || address };
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
    const others = [...units.entries()].filter(([k]) => k !== self).map(([, u]) => {
      // 같은 단지면 동·호수만, 다른 단지면 단지 이름도 함께
      const same = complexKey(u.complex) === ck;
      const unit = [u.dong && `${u.dong}동`, u.ho && `${u.ho}호`].filter(Boolean).join(" ");
      return same && unit ? unit : u.name;
    });
    // 줄 나누기: 같은 단지는 호실만 한 줄, 다른 단지는 단지별로 한 줄씩 (건의 #212)
    const groups = new Map<string, { complex: string; same: boolean; units: string[] }>();
    for (const [k, u] of units.entries()) {
      if (k === self) continue;
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
