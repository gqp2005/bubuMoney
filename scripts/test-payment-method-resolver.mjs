// 결제수단 리졸버(src/lib/payment-method-resolver.ts) 단위 검사.
// 추가 의존성 없이 프로젝트의 typescript로 변환해서 실행한다.
//
//   node scripts/test-payment-method-resolver.mjs
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import ts from "typescript";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const source = fs.readFileSync(
  path.join(root, "src/lib/payment-method-resolver.ts"),
  "utf8"
);
const { outputText } = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
});
const m = await import(
  `data:text/javascript;base64,${Buffer.from(outputText).toString("base64")}`
);

// 운영 데이터처럼 같은 이름이 소유자별로 겹치는 결제수단 목록
const methods = [
  { id: "h-cash", name: "현금", owner: "husband" },
  { id: "w-cash", name: "현금", owner: "wife" },
  { id: "o-cash", name: "현금", owner: "our" },
  { id: "w-card", name: "신용카드", owner: "wife" },
];
const nameMap = m.buildPaymentMethodNameMap(methods);

let failures = 0;
function eq(name, actual, expected) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  if (!ok) failures += 1;
  console.log(
    `  ${ok ? "PASS" : "FAIL"}  ${name}${ok ? "" : `  (got ${JSON.stringify(actual)})`}`
  );
}
const sorted = (set) => [...set].sort();

console.log("expandPaymentMethodSelection");
eq("ID는 그대로", sorted(m.expandPaymentMethodSelection(["w-card"], methods)), ["w-card"]);
eq("예전 이름 '현금' → 소유자 3명 모두", sorted(m.expandPaymentMethodSelection(["현금"], methods)), ["h-cash", "o-cash", "w-cash"]);
eq("'legacy:현금' → 소유자 3명 모두", sorted(m.expandPaymentMethodSelection(["legacy:현금"], methods)), ["h-cash", "o-cash", "w-cash"]);
eq("코드값 'cash' → 현금 3명", sorted(m.expandPaymentMethodSelection(["cash"], methods)), ["h-cash", "o-cash", "w-cash"]);
eq("알 수 없는 값은 버림", sorted(m.expandPaymentMethodSelection(["nope"], methods)), []);
eq("ID와 이름 혼합", sorted(m.expandPaymentMethodSelection(["w-card", "현금"], methods)), ["h-cash", "o-cash", "w-card", "w-cash"]);

console.log("describePaymentMethodSelection (통계 필터 표시)");
eq("ID → 이름", m.describePaymentMethodSelection("w-card", methods), "신용카드");
eq("예전 이름 '현금' → 현금", m.describePaymentMethodSelection("현금", methods), "현금");
eq("'legacy:현금' → 현금 (접두어 제거)", m.describePaymentMethodSelection("legacy:현금", methods), "현금");
eq("'legacy:서울페이'(삭제된 이름) → 서울페이", m.describePaymentMethodSelection("legacy:서울페이", methods), "서울페이");
eq("모르는 ID → 삭제된 결제수단", m.describePaymentMethodSelection("gone-id", methods), "삭제된 결제수단");

console.log("hasPaymentMethodId (저장 검사·반복거래 동기화·설정 경고가 공유하는 기준)");
eq("정상 ID → 있음", m.hasPaymentMethodId("w-cash"), true);
eq("앞뒤 공백 ID → 있음", m.hasPaymentMethodId(" w-cash "), true);
eq("공백만 → 없음", m.hasPaymentMethodId("   "), false);
eq("빈 문자열 → 없음", m.hasPaymentMethodId(""), false);
eq("null → 없음", m.hasPaymentMethodId(null), false);
eq("undefined → 없음", m.hasPaymentMethodId(undefined), false);
eq("정규화는 공백 제거", m.normalizePaymentMethodId(" w-cash "), "w-cash");

console.log("requirePaymentMethodId (저장 직전 검사 + 정규화)");
eq("공백 섞인 ID → 정리된 값을 저장", m.requirePaymentMethodId(" w-cash "), "w-cash");
eq("정상 ID → 그대로", m.requirePaymentMethodId("w-cash"), "w-cash");
for (const bad of ["", "   ", null, undefined]) {
  let threw = false;
  try {
    m.requirePaymentMethodId(bad);
  } catch {
    threw = true;
  }
  eq(`${JSON.stringify(bad)} → 저장 거부`, threw, true);
}

console.log("키와 표시 이름");
eq("그룹 키 = ID(공백 제거)", m.getTransactionPaymentMethodKey({ paymentMethodId: " w-cash " }), "w-cash");
eq("ID 없으면 빈 키", m.getTransactionPaymentMethodKey({}), "");
eq("빈 키 라벨 = 미지정", m.getPaymentMethodLabelFromKey("", nameMap), "미지정");
eq("모르는 키 라벨 = 삭제된 결제수단", m.getPaymentMethodLabelFromKey("gone-id", nameMap), "삭제된 결제수단");
eq("거래 표시: ID로 해석", m.resolveTransactionPaymentMethodName({ paymentMethodId: "w-card", paymentMethod: "옛이름" }, nameMap), "신용카드");
eq("거래 표시: 삭제된 ID면 이름 스냅샷", m.resolveTransactionPaymentMethodName({ paymentMethodId: "gone-id", paymentMethod: "서울페이" }, nameMap), "서울페이");

console.log(failures === 0 ? "\n모두 통과" : `\n실패 ${failures}건`);
process.exit(failures === 0 ? 0 : 1);
