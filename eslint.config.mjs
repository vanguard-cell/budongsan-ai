import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    // Node 전용 운영 스크립트(앱 번들 아님) — CommonJS require 허용
    "scripts/**",
  ]),
  {
    // React Compiler 용 최적화 규칙 — 이 앱은 React Compiler 를 쓰지 않아 동작 문제는 아님.
    // (마운트 때 localStorage 읽어 setState, 렌더 중 Date.now() 같은 기존 패턴이 많음)
    // 한꺼번에 고치면 화면 동작이 바뀔 위험이 커서 경고로만 두고, 파일을 고칠 때 하나씩 정리.
    rules: {
      "react-hooks/set-state-in-effect": "warn",
      "react-hooks/purity": "warn",
    },
  },
]);

export default eslintConfig;
