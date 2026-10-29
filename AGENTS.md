<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

# 이 저장소 규칙 (위 Next.js 규칙의 적용 범위를 좁힌다)

세션이 느려지지 않게 하기 위한 규칙이다. 위 블록은 Next.js가 관리하므로 고치지 말고 여기에 적는다.

- 위 "문서 먼저 읽기" 규칙은 **Next.js 고유 기능을 새로 쓰거나 바꿀 때만** 따른다 — 라우팅·레이아웃, 서버/클라이언트 컴포넌트 경계, `app/api/` 라우트, `next.config.ts`, 캐싱·메타데이터 등. 화면 문구·스타일·버튼·데이터 처리 같은 일반 수정(대부분의 작업)에서는 문서를 읽지 않는다.
- 문서를 볼 때도 `node_modules/next/dist/docs/`에서 **관련 파일 하나만** 찾아 읽는다 (전체 400여 개 파일·3.7MB — 훑지 말 것).
- `node_modules`가 없으면(클라우드 세션 등) **문서를 읽으려고 `npm install`을 돌리지 말 것** — 설치에 몇 분 걸린다. 같은 기능을 쓰는 기존 코드를 찾아 그 방식을 따른다.
- 큰 파일이 많다: `app/expiry/page.tsx`(93KB) · `app/ai-content/page.tsx`(85KB) · `app/properties/page.tsx`(75KB) · `app/globals.css`(69KB) · `app/schedule/page.tsx`(69KB). 통째로 읽지 말고 함수·컴포넌트 이름으로 찾아 그 주변만 읽는다.

## 구조 (어디에 뭐가 있나)

- 화면(`app/`): dashboard 홈 · properties 매물 관리 · expiry 만기 관리 · customers 매수자 등록 · schedule 스케줄 · sales 매출 관리 · team 직원 관리 · feedback 건의함 · more 백업·설정 · search 통합 검색 · ai-content AI 매물 글 · roster 고객명단 · market-price 실거래 최고가 · insights 인사이트 · admin 유저 관리. 메뉴 구성은 `app/BottomNav.tsx`.
- 데이터: Firebase Firestore(서울 리전). 읽고 쓰는 함수는 `lib/*-db.ts`, 권한 규칙은 `firestore.rules`.
- 서버 API: `app/api/*/route.ts` (AI 글 생성·사진 분석·카톡 파싱·시세·단지 검색 등).
- `scripts/` — 건의함 조회·답변·상태 변경용 관리자 스크립트(서비스 계정 키 필요, 키는 커밋 금지).
