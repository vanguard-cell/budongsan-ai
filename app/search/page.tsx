"use client";

/** 통합 검색 결과 — 내 매물 · 만기 관리 · 고객을 한 번에 찾아 보여줌 */

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth-context";
import { subscribeProperties, type Property } from "@/lib/properties-db";
import { subscribeContracts } from "@/lib/contracts-db";
import { subscribeCustomers } from "@/lib/customers-db";
import { matchAllTokens, isDigitQuery } from "@/lib/search-match";
import type { Contract } from "../expiry/contracts";
import type { Customer } from "../customers/customer-types";

const MAX_SHOW = 50;

export default function SearchPage() {
  const router = useRouter();
  const { user, loading } = useAuth();
  const [q, setQ] = useState("");
  const [input, setInput] = useState("");
  const [properties, setProperties] = useState<Property[]>([]);
  const [contracts, setContracts] = useState<Contract[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);

  useEffect(() => {
    const read = () => {
      const v = new URLSearchParams(window.location.search).get("q") || "";
      setQ(v);
      setInput(v);
    };
    read();
    window.addEventListener("global-search", read);
    return () => window.removeEventListener("global-search", read);
  }, []);

  useEffect(() => {
    if (!loading && !user) router.replace("/login?redirect=/search");
  }, [loading, user, router]);

  useEffect(() => {
    if (!user) return;
    const u1 = subscribeProperties(user.agencyId, setProperties);
    const u2 = subscribeContracts(user.agencyId, setContracts);
    const u3 = subscribeCustomers(user.agencyId, setCustomers);
    return () => { u1(); u2(); u3(); };
  }, [user]);

  const term = q.trim().toLowerCase();
  const digits = term.replace(/\D/g, "");
  const hit = (...vals: (string | undefined)[]) =>
    vals.some(v => {
      if (!v) return false;
      if (v.toLowerCase().includes(term)) return true;
      return isDigitQuery(term) && digits.length >= 3 && v.replace(/\D/g, "").includes(digits);
    });

  const pRes = useMemo(() => !term ? [] : properties.filter(p =>
    hit(p.address, p.dong, p.ho, p.ownerName, p.ownerPhone, p.tenantName, p.tenantPhone)
    || matchAllTokens(term, [p.address, p.dong, p.ho, p.ownerName, p.ownerPhone, p.tenantName, p.tenantPhone])), // eslint-disable-line react-hooks/exhaustive-deps
  [properties, term]);
  const cRes = useMemo(() => !term ? [] : contracts.filter(c =>
    hit(c.address, c.dong, c.ho, c.tenantName, c.tenantPhone, c.landlordName, c.landlordPhone, c.memo)), // eslint-disable-line react-hooks/exhaustive-deps
  [contracts, term]);
  const uRes = useMemo(() => !term ? [] : customers.filter(c =>
    hit(c.name, c.phone, c.preferredArea, c.memo)), // eslint-disable-line react-hooks/exhaustive-deps
  [customers, term]);

  // 내 매물만 찾아졌으면 버튼 누를 필요 없이 바로 매물관리 목록으로 보여줌
  const onlyProps = pRes.length > 0 && cRes.length === 0 && uRes.length === 0;
  useEffect(() => {
    if (onlyProps) router.replace(`/properties?q=${encodeURIComponent(q.trim())}`);
  }, [onlyProps, q, router]);

  // 만기관리에만 찾아졌으면 바로 만기관리 목록으로
  const onlyContracts = cRes.length > 0 && pRes.length === 0 && uRes.length === 0;
  useEffect(() => {
    if (onlyContracts) router.replace(`/expiry?q=${encodeURIComponent(q.trim())}`);
  }, [onlyContracts, q, router]);

  const submit = () => {
    const v = input.trim();
    if (!v) return;
    router.push(`/search?q=${encodeURIComponent(v)}`);
    setQ(v);
  };

  const total = pRes.length + cRes.length + uRes.length;

  return (
    <div className="mx-auto max-w-6xl p-4 pb-24">
      <div className="mb-4 flex gap-2">
        <input
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={e => e.key === "Enter" && submit()}
          placeholder="이름·전화번호·주소 검색"
          className="min-w-0 flex-1 rounded-lg border border-outline-variant bg-surface px-3 py-2 text-sm"
        />
        <button onClick={submit} className="whitespace-nowrap rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-on-primary">검색</button>
      </div>

      {!term ? (
        <p className="text-sm text-on-surface-variant">검색어를 입력해 주세요.</p>
      ) : !user ? null : total === 0 ? (
        <p className="text-sm text-on-surface-variant">&quot;{q}&quot;로 찾은 결과가 없어요.</p>
      ) : (
        <div className="space-y-6">
          <Section title="내 매물" count={pRes.length} moreHref={`/properties?q=${encodeURIComponent(q.trim())}`}>
            {pRes.slice(0, MAX_SHOW).map(p => (
              <Row key={p.id} href={`/properties?pid=${p.id}&open=1`}
                main={withUnit(p.address, p.dong, p.ho) || "(주소 없음)"}
                tag={p.status === "closed" ? "종료" : ""}
                lines={[person("임대인", p.ownerName, p.ownerPhone), person("임차인", p.tenantName, p.tenantPhone)]} />
            ))}
          </Section>
          <Section title="만기 관리" count={cRes.length}>
            {cRes.slice(0, MAX_SHOW).map(c => (
              <Row key={c.id} href={`/expiry?focus=${c.id}`}
                main={withUnit(c.address, c.dong, c.ho) || "(주소 없음)"}
                tag={c.status !== "active" ? "종료" : ""}
                lines={[person("임대인", c.landlordName, c.landlordPhone), person("임차인", c.tenantName, c.tenantPhone), c.endDate ? `만기 ${c.endDate}` : ""]} />
            ))}
          </Section>
          <Section title="고객" count={uRes.length}>
            {uRes.slice(0, MAX_SHOW).map(c => (
              <Row key={c.id} href={`/customers?focus=${c.id}`}
                main={c.name || "(이름 없음)"}
                lines={[c.phone || "", c.preferredArea || ""]} />
            ))}
          </Section>
        </div>
      )}
    </div>
  );
}

function Section({ title, count, moreHref, children }: { title: string; count: number; moreHref?: string; children: React.ReactNode }) {
  if (count === 0) return null;
  return (
    <section>
      <div className="mb-2 flex items-center justify-between gap-2">
        <h2 className="text-base font-bold text-on-surface">{title} <span className="text-primary">{count}</span></h2>
        {moreHref && <Link href={moreHref} className="whitespace-nowrap rounded-lg bg-primary px-3 py-1.5 text-sm font-semibold text-on-primary">매물관리 목록으로 보기</Link>}
      </div>
      <ul className="divide-y divide-outline-variant overflow-hidden rounded-xl border border-outline-variant bg-surface">{children}</ul>
      {count > MAX_SHOW && <p className="mt-1 text-xs text-on-surface-variant">앞의 {MAX_SHOW}건만 보여요. 더 자세히 검색해 보세요.</p>}
    </section>
  );
}

function Row({ href, main, tag, lines }: { href: string; main: string; tag?: string; lines: string[] }) {
  const shown = lines.filter(Boolean);
  return (
    <li>
      <Link href={href} className="block px-4 py-3 hover:bg-surface-container">
        <div className="break-keep text-lg font-bold text-on-surface">
          {tag && <span className="mr-2 whitespace-nowrap rounded bg-surface-container px-1.5 py-0.5 align-middle text-xs font-semibold text-on-surface-variant">{tag}</span>}
          {main}
        </div>
        {shown.map((t, i) => <div key={i} className="mt-0.5 break-keep text-base text-on-surface-variant">{t}</div>)}
      </Link>
    </li>
  );
}

// "임대인 홍길동 010-0000-0000" 형태. 이름·전화 둘 다 없으면 빈 줄(표시 안 함)
function person(label: string, name?: string, phone?: string) {
  if (!name && !phone) return "";
  return `${label}  ${name || "—"}  ${phone || ""}`.trim();
}

// 주소에 동·호수가 안 들어 있으면 뒤에 붙여서 보여줌
function withUnit(address?: string, dong?: string, ho?: string) {
  const parts = [address || ""];
  if (dong && !(address || "").includes(dong)) parts.push(/동$/.test(dong) ? dong : `${dong}동`);
  if (ho && !(address || "").includes(ho)) parts.push(/호$/.test(ho) ? ho : `${ho}호`);
  return parts.filter(Boolean).join(" ").trim();
}
