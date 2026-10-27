// 가입·초대·가계부 생성 흐름과 Firestore 규칙을 에뮬레이터에서 검증한다.
// 운영 Firebase에는 접속하지 않는다("demo-" 프로젝트).
//
// 준비:
//   firebase emulators:start --only auth,firestore --project demo-couple-ledger
//   node scripts/dev-emulator.mjs --open-signup   → node scripts/test-invite-flow.mjs open
//   node scripts/dev-emulator.mjs                 → node scripts/test-invite-flow.mjs invite-only
import { deleteApp, initializeApp as initClientApp } from "firebase/app";
import {
  connectAuthEmulator,
  createUserWithEmailAndPassword,
  getAuth,
  signInWithEmailAndPassword,
} from "firebase/auth";
import {
  Timestamp,
  addDoc,
  collection,
  connectFirestoreEmulator,
  doc,
  getDoc,
  getDocs,
  getFirestore,
  serverTimestamp,
  setDoc,
} from "firebase/firestore";
import { initializeApp as initAdminApp } from "firebase-admin/app";
import { getAuth as getAdminAuth } from "firebase-admin/auth";
import { getFirestore as getAdminFirestore } from "firebase-admin/firestore";

const PROJECT = "demo-couple-ledger";
process.env.FIRESTORE_EMULATOR_HOST ??= "127.0.0.1:8080";
process.env.FIREBASE_AUTH_EMULATOR_HOST ??= "127.0.0.1:9099";
const APP_URL = process.env.APP_URL ?? "http://127.0.0.1:3000";
const phase = process.argv[2];

const adminApp = initAdminApp({ projectId: PROJECT });
const adb = getAdminFirestore(adminApp);
const aauth = getAdminAuth(adminApp);

const OWNER = {
  email: "owner@test.dev",
  password: "owner-pass-1",
  nickname: "남편",
  spouseRole: "husband",
};
const WIFE = {
  email: "wife@test.dev",
  password: "wife-pass-1",
  nickname: "아내",
  spouseRole: "wife",
};

// ── 결과 집계 ─────────────────────────────────────────────────
let failures = 0;
function check(name, ok, detail = "") {
  if (ok) {
    console.log(`  PASS  ${name}`);
  } else {
    failures += 1;
    console.log(`  FAIL  ${name}${detail ? `  (${detail})` : ""}`);
  }
}

async function post(path, body, idToken) {
  const headers = { "content-type": "application/json" };
  if (idToken) headers.authorization = `Bearer ${idToken}`;
  const res = await fetch(`${APP_URL}${path}`, {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  });
  return { status: res.status, json: await res.json().catch(() => null) };
}

async function authUserCount() {
  return (await aauth.listUsers(1000)).users.length;
}

let clientSeq = 0;
function newClient() {
  const app = initClientApp(
    { apiKey: "demo-key", projectId: PROJECT, authDomain: `${PROJECT}.firebaseapp.com` },
    `client-${++clientSeq}`
  );
  const auth = getAuth(app);
  connectAuthEmulator(auth, "http://127.0.0.1:9099", { disableWarnings: true });
  const db = getFirestore(app);
  connectFirestoreEmulator(db, "127.0.0.1", 8080);
  return { app, auth, db };
}

async function signedInClient(email, password) {
  const c = newClient();
  const cred = await signInWithEmailAndPassword(c.auth, email, password);
  return { ...c, user: cred.user, token: await cred.user.getIdToken() };
}

async function newAccountClient(email, password) {
  const c = newClient();
  const cred = await createUserWithEmailAndPassword(c.auth, email, password);
  return { ...c, user: cred.user, token: await cred.user.getIdToken() };
}

/** 규칙 거부(permission-denied)를 기대한다. */
async function expectDenied(name, action) {
  try {
    await action();
    check(name, false, "허용됨");
  } catch (err) {
    check(name, err?.code === "permission-denied", err?.code ?? String(err));
  }
}

async function expectAllowed(name, action) {
  try {
    await action();
    check(name, true);
  } catch (err) {
    check(name, false, err?.code ?? String(err));
  }
}

function makeCode() {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const bytes = crypto.getRandomValues(new Uint8Array(12));
  return [...bytes].map((b) => chars[b % chars.length]).join("");
}

/** 앱의 createInvite()와 같은 쓰기를 클라이언트 권한으로 수행한다. */
async function createInviteAs(client, householdId, { expired = false } = {}) {
  const code = makeCode();
  const expiresAt = Timestamp.fromMillis(
    Date.now() + (expired ? -60_000 : 7 * 24 * 3600_000)
  );
  const inviteRef = await addDoc(
    collection(client.db, "households", householdId, "invites"),
    { code, createdBy: client.user.uid, createdAt: serverTimestamp(), expiresAt }
  );
  await setDoc(doc(client.db, "publicInvites", code), {
    code,
    householdId,
    inviteId: inviteRef.id,
    createdBy: client.user.uid,
    createdAt: serverTimestamp(),
    expiresAt,
    usedBy: null,
  });
  return { code, inviteId: inviteRef.id };
}

async function count(path) {
  return (await adb.collection(path).count().get()).data().count;
}

// ── 1단계: 새 가계부 생성 허용(--open-signup) ─────────────────
async function runOpenPhase() {
  console.log("\n[1단계] NEXT_PUBLIC_ALLOW_OPEN_SIGNUP=true");

  const r = await post("/api/signup", OWNER);
  check("A1 초대코드 없는 가입 → 200", r.status === 200 && !!r.json?.householdId, JSON.stringify(r));
  const householdId = r.json?.householdId;
  const ownerUid = (await aauth.getUserByEmail(OWNER.email)).uid;

  const household = (await adb.doc(`households/${householdId}`).get()).data();
  check("A1 households.createdBy = 생성자", household?.createdBy === ownerUid);
  check("A1 membersCount = 1", household?.membersCount === 1);
  const member = (await adb.doc(`households/${householdId}/members/${ownerUid}`).get()).data();
  check("A1 생성자가 owner로 등록됨", member?.role === "owner");
  const profile = (await adb.doc(`users/${ownerUid}`).get()).data();
  check(
    "A1 users 프로필 연결",
    profile?.householdId === householdId && profile?.spouseRole === "husband" && profile?.displayName === "남편"
  );
  check("A1 기본 카테고리 2개", (await count(`households/${householdId}/categories`)) === 2);
  check("A1 기본 대상 6개", (await count(`households/${householdId}/subjects`)) === 6);
  check("A1 기본 결제수단 18개", (await count(`households/${householdId}/paymentMethods`)) === 18);

  const owner = await signedInClient(OWNER.email, OWNER.password);
  const r2 = await post("/api/households", { name: "두번째" }, owner.token);
  check("A2 이미 가계부가 있으면 추가 생성 거부 → 409", r2.status === 409, JSON.stringify(r2));
  await deleteApp(owner.app);
}

// ── 2단계: 초대 전용(기본 정책) ───────────────────────────────
async function runInviteOnlyPhase() {
  console.log("\n[2단계] NEXT_PUBLIC_ALLOW_OPEN_SIGNUP=false (기본)");

  const ownerUid = (await aauth.getUserByEmail(OWNER.email)).uid;
  const householdId = (await adb.doc(`users/${ownerUid}`).get()).data()?.householdId;
  const owner = await signedInClient(OWNER.email, OWNER.password);

  // 정책
  let before = await authUserCount();
  let r = await post("/api/signup", { email: "nobody@test.dev", password: "pass-1234" });
  check("B1 초대코드 없는 가입 → 403", r.status === 403, JSON.stringify(r));
  check("B1 계정이 만들어지지 않음", (await authUserCount()) === before);

  r = await post("/api/households", { name: "몰래" }, owner.token);
  check("B2 새 가계부 생성 → 403", r.status === 403, JSON.stringify(r));

  // 초대 발급(클라이언트 권한)
  let invite;
  await expectAllowed("B3 멤버가 초대코드 발급 (규칙 허용)", async () => {
    invite = await createInviteAs(owner, householdId);
  });
  check("B3 초대코드 12자리", invite?.code?.length === 12);

  // 무효 코드: 계정을 만들기 전에 거부
  before = await authUserCount();
  r = await post("/api/signup", { ...WIFE, inviteCode: "ZZZZZZZZZZZZ" });
  check("B4 존재하지 않는 코드 → 404", r.status === 404, JSON.stringify(r));
  r = await post("/api/signup", { ...WIFE, inviteCode: "abc!@#" });
  check("B4 형식이 틀린 코드 → 404", r.status === 404, JSON.stringify(r));
  check("B4 계정이 만들어지지 않음 (검증 → 생성 순서)", (await authUserCount()) === before);

  // 정상 초대 가입
  r = await post("/api/signup", { ...WIFE, inviteCode: invite.code });
  check("B5 유효한 코드로 가입 → 200", r.status === 200 && r.json?.householdId === householdId, JSON.stringify(r));
  const wifeUid = (await aauth.getUserByEmail(WIFE.email)).uid;
  const wifeMember = (await adb.doc(`households/${householdId}/members/${wifeUid}`).get()).data();
  check("B5 member로 등록, invitedBy = 초대자", wifeMember?.role === "member" && wifeMember?.invitedBy === ownerUid);
  const wifeProfile = (await adb.doc(`users/${wifeUid}`).get()).data();
  check(
    "B5 users 프로필 연결",
    wifeProfile?.householdId === householdId && wifeProfile?.spouseRole === "wife" && wifeProfile?.displayName === "아내"
  );
  check("B5 publicInvites.usedBy 기록", (await adb.doc(`publicInvites/${invite.code}`).get()).data()?.usedBy === wifeUid);
  check(
    "B5 invites.usedBy 기록",
    (await adb.doc(`households/${householdId}/invites/${invite.inviteId}`).get()).data()?.usedBy === wifeUid
  );
  check("B5 membersCount = 2", (await adb.doc(`households/${householdId}`).get()).data()?.membersCount === 2);
  const notes = await adb
    .collection(`households/${householdId}/notifications`)
    .where("type", "==", "invite.accepted")
    .get();
  check("B5 참여 알림 1건 (트랜잭션 내 기록)", notes.size === 1);

  // 사용된 코드 재사용
  before = await authUserCount();
  r = await post("/api/signup", { email: "third@test.dev", password: "pass-1234", inviteCode: invite.code });
  check("B6 이미 사용된 코드 → 409", r.status === 409, JSON.stringify(r));
  check("B6 계정이 만들어지지 않음", (await authUserCount()) === before);

  // 응답 유실 후 재시도: 서버는 성공했고 클라이언트가 같은 요청을 다시 보낸 경우
  r = await post("/api/signup", { ...WIFE, inviteCode: invite.code });
  check("B7 재시도 → 409 (중복 생성 없음)", r.status === 409, JSON.stringify(r));
  let wifeClient;
  await expectAllowed("B7 클라이언트 복구 경로: 같은 자격증명으로 로그인 성공", async () => {
    wifeClient = await signedInClient(WIFE.email, WIFE.password);
  });
  check("B7 계정이 지워지지 않고 멤버 유지", (await adb.doc(`households/${householdId}/members/${wifeUid}`).get()).exists);

  // 만료 코드
  const expired = await createInviteAs(owner, householdId, { expired: true });
  before = await authUserCount();
  r = await post("/api/signup", { email: "late@test.dev", password: "pass-1234", inviteCode: expired.code });
  check("B8 만료된 코드 → 410", r.status === 410, JSON.stringify(r));
  check("B8 계정이 만들어지지 않음", (await authUserCount()) === before);

  // 이미 로그인한 사용자의 초대 수락 (/api/invites/accept) — 1번 버그의 회귀 테스트
  const joiner = await newAccountClient("joiner@test.dev", "pass-1234");
  const invite2 = await createInviteAs(owner, householdId);
  r = await post("/api/invites/accept", { code: invite2.code }, joiner.token);
  check("B9 로그인 사용자 초대 수락 → 200 (트랜잭션 읽기/쓰기 순서)", r.status === 200, JSON.stringify(r));
  check("B9 멤버 등록됨", (await adb.doc(`households/${householdId}/members/${joiner.user.uid}`).get()).exists);
  const invite3 = await createInviteAs(owner, householdId);
  r = await post("/api/invites/accept", { code: invite3.code }, owner.token);
  check("B9 본인이 만든 코드 → 409", r.status === 409, JSON.stringify(r));
  r = await post("/api/invites/accept", { code: invite3.code });
  check("B9 토큰 없음 → 401", r.status === 401, JSON.stringify(r));
  r = await post("/api/invites/accept", { code: invite3.code }, "forged-token");
  check("B9 위조 토큰 → 401", r.status === 401, JSON.stringify(r));

  // 외부인 공격 (Firebase Auth 계정은 있다고 가정)
  const outsider = await newAccountClient("outsider@test.dev", "pass-1234");
  await expectDenied("B10 외부인: 가계부 직접 생성", () =>
    setDoc(doc(outsider.db, "households", "attacker-house"), { name: "x", createdBy: outsider.user.uid })
  );
  await expectDenied("B10 외부인: 남의 가계부에 자기 멤버 문서 생성", () =>
    setDoc(doc(outsider.db, "households", householdId, "members", outsider.user.uid), { role: "member" })
  );
  await expectDenied("B10 외부인: 초대코드 문서 읽기(householdId 유출)", () =>
    getDoc(doc(outsider.db, "publicInvites", invite3.code))
  );
  await expectDenied("B10 외부인: 가계부 거래 읽기", () =>
    getDocs(collection(outsider.db, "households", householdId, "transactions"))
  );
  await expectDenied("B10 외부인: 가계부 문서 읽기", () =>
    getDoc(doc(outsider.db, "households", householdId))
  );
  await expectDenied("B10 외부인: 초대코드 usedBy 조작", () =>
    setDoc(doc(outsider.db, "publicInvites", invite3.code), { usedBy: outsider.user.uid }, { merge: true })
  );

  // 멤버 권한
  await expectAllowed("B11 멤버: 거래 추가", () =>
    addDoc(collection(wifeClient.db, "households", householdId, "transactions"), {
      type: "expense",
      amount: 1000,
      createdBy: wifeUid,
    })
  );
  await expectAllowed("B11 멤버: automationLogs 읽기 (운영 규칙 반영)", () =>
    getDocs(collection(wifeClient.db, "households", householdId, "automationLogs"))
  );
  await expectDenied("B11 멤버도 초대코드 문서는 못 읽음", () =>
    getDoc(doc(wifeClient.db, "publicInvites", invite3.code))
  );
  await expectDenied("B11 소유자도 클라이언트로 멤버 추가 불가", () =>
    setDoc(doc(owner.db, "households", householdId, "members", outsider.user.uid), { role: "member" })
  );

  for (const c of [owner, wifeClient, joiner, outsider]) {
    if (c) await deleteApp(c.app);
  }

  // 브라우저 테스트용 초대코드 하나를 남겨 둔다.
  const browserInvite = await createInviteAs(await signedInClient(OWNER.email, OWNER.password), householdId);
  console.log(`\n  브라우저 테스트용 초대코드: ${browserInvite.code}`);
}

if (phase === "open") {
  await runOpenPhase();
} else if (phase === "invite-only") {
  await runInviteOnlyPhase();
} else {
  console.error("usage: node scripts/test-invite-flow.mjs <open|invite-only>");
  process.exit(2);
}

console.log(failures === 0 ? "\n모두 통과" : `\n실패 ${failures}건`);
process.exit(failures === 0 ? 0 : 1);
