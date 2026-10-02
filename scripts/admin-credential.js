/**
 * 관리자 스크립트 공용 — Firebase 서비스 계정 키 불러오기
 *
 * 순서:
 *  1) 환경 변수 FIREBASE_SERVICE_ACCOUNT (JSON 내용 전체) — 클라우드 세션용
 *  2) GOOGLE_APPLICATION_CREDENTIALS 경로 또는 프로젝트 루트 serviceAccountKey.json — 내 PC용
 */
const { cert } = require("firebase-admin/app");
const path = require("path");
const fs = require("fs");

function loadCredential() {
  const raw = process.env.FIREBASE_SERVICE_ACCOUNT;
  if (raw && raw.trim()) {
    try {
      return cert(JSON.parse(raw));
    } catch (e) {
      console.error("❌ FIREBASE_SERVICE_ACCOUNT 내용이 올바른 JSON이 아닙니다:", e.message);
      process.exit(1);
    }
  }
  const keyPath = process.env.GOOGLE_APPLICATION_CREDENTIALS || path.join(__dirname, "..", "serviceAccountKey.json");
  if (!fs.existsSync(keyPath)) {
    console.error(`\n❌ 서비스 계정 키가 없습니다: ${keyPath}`);
    console.error("   PC: Firebase 콘솔 → 프로젝트 설정 → 서비스 계정 → '새 비공개 키 생성' → 루트에 serviceAccountKey.json");
    console.error("   클라우드: 환경 변수 FIREBASE_SERVICE_ACCOUNT 에 JSON 내용 전체 등록\n");
    process.exit(1);
  }
  return cert(require(keyPath));
}

module.exports = { loadCredential };
