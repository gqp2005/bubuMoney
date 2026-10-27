// Firebase 에뮬레이터에 붙은 개발 서버를 띄운다. 운영 Firebase에는 접속하지 않는다.
//
//   firebase emulators:start --only auth,firestore --project demo-couple-ledger
//   node scripts/dev-emulator.mjs                 # 초대 전용(기본 정책)
//   node scripts/dev-emulator.mjs --open-signup   # 새 가계부 생성 허용
//
// "demo-" 로 시작하는 프로젝트 ID는 실제 Google 서비스로 요청이 나가지 않는다.
import { spawn } from "node:child_process";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const require = createRequire(import.meta.url);
const nextBin = require.resolve("next/dist/bin/next");

const openSignup = process.argv.includes("--open-signup");
const portArgIndex = process.argv.indexOf("--port");
const port = portArgIndex > -1 ? process.argv[portArgIndex + 1] : "3000";

const env = {
  ...process.env,
  NEXT_PUBLIC_USE_FIREBASE_EMULATOR: "true",
  NEXT_PUBLIC_FIREBASE_PROJECT_ID: "demo-couple-ledger",
  NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN: "demo-couple-ledger.firebaseapp.com",
  NEXT_PUBLIC_ALLOW_OPEN_SIGNUP: openSignup ? "true" : "false",
  FIREBASE_PROJECT_ID: "demo-couple-ledger",
  FIRESTORE_EMULATOR_HOST: "127.0.0.1:8080",
  FIREBASE_AUTH_EMULATOR_HOST: "127.0.0.1:9099",
  // .env.local의 운영 서비스 계정이 끼어들지 않도록 존재하지 않는 경로로 덮어쓴다.
  GOOGLE_APPLICATION_CREDENTIALS: "emulator-has-no-credentials.json",
  FIREBASE_SERVICE_ACCOUNT_JSON: "",
  FIREBASE_CLIENT_EMAIL: "",
  FIREBASE_PRIVATE_KEY: "",
};

const child = spawn(
  process.execPath,
  [nextBin, "dev", "--webpack", "-H", "127.0.0.1", "-p", port],
  { env, stdio: "inherit", cwd: projectRoot }
);
child.on("exit", (code) => process.exit(code ?? 0));
