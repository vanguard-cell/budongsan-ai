import type { MetadataRoute } from "next";

/**
 * PWA Manifest — 홈 화면에 추가해서 앱처럼 사용 가능
 *
 * - 폰: 크롬에서 "홈 화면에 추가" 클릭 시 아이콘 생성
 * - PC: 크롬에서 주소창 우측 "설치" 아이콘으로 데스크톱 앱처럼 설치
 * - 색상은 앱 테마 (블루 계열) + 흰 배경
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "미사금빛 매물 도우미",
    short_name: "매물 도우미",
    description:
      "공인중개사 업무 보조 — 매물 문구 자동 생성, 만기 알림, 손님 관리, 실시간 동기화",
    start_url: "/",
    display: "standalone",
    background_color: "#FAF7F0",
    theme_color: "#2563EB",
    orientation: "portrait",
    lang: "ko-KR",
    icons: [
      {
        src: "/icon-192.png",
        sizes: "192x192",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/icon-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/icon-maskable.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
    ],
    categories: ["business", "productivity"],
    shortcuts: [
      {
        name: "만기 관리",
        short_name: "만기",
        description: "임대차 계약 만기 알림 보드",
        url: "/expiry",
        icons: [{ src: "/icon-192.png", sizes: "192x192" }],
      },
      {
        name: "손님 관리",
        short_name: "손님",
        description: "손님 사후관리 보드",
        url: "/customers",
        icons: [{ src: "/icon-192.png", sizes: "192x192" }],
      },
    ],
  };
}
