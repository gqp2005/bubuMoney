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
eq("삭제된 결제수단 + 저장된 이름 → '이름 (삭제됨)'", m.getPaymentMethodLabelFromKey("gone-id", nameMap, "서울페이"), "서울페이 (삭제됨)");
eq("저장된 이름도 코드값은 변환", m.getPaymentMethodLabelFromKey("gone-id", nameMap, "cash"), "현금 (삭제됨)");
eq("저장된 이름이 공백뿐이면 '삭제된 결제수단'", m.getPaymentMethodLabelFromKey("gone-id", nameMap, "  "), "삭제된 결제수단");
eq("살아 있는 결제수단은 저장된 이름보다 현재 이름 우선", m.getPaymentMethodLabelFromKey("w-card", nameMap, "옛이름"), "신용카드");
eq("ID 없는 예전 거래 + 저장된 이름 → 그 이름", m.getPaymentMethodLabelFromKey("", nameMap, "서울페이"), "서울페이");
eq(
  "같은 이름으로 삭제된 결제수단 2개도 구분",
  m.disambiguatePaymentMethodNames(
    [{ id: "gone-b", name: "서울페이 (삭제됨)" }, { id: "gone-a", name: "서울페이 (삭제됨)" }],
    methods,
    { husband: "궁디", wife: "빵디", our: "우리" }
  ).map((item) => item.name),
  ["서울페이 (삭제됨) #2", "서울페이 (삭제됨) #1"]
);
eq("거래 표시: ID로 해석",m.resolveTransactionPaymentMethodName({ paymentMethodId: "w-card", paymentMethod: "옛이름" }, nameMap), "신용카드");
eq("거래 표시: 삭제된 ID면 이름 스냅샷", m.resolveTransactionPaymentMethodName({ paymentMethodId: "gone-id", paymentMethod: "서울페이" }, nameMap), "서울페이");

console.log("disambiguatePaymentMethodNames (통계 자산별 목록)");
{
  const owners = { husband: "궁디", wife: "빵디", our: "우리" };
  const all = [
    { id: "h-kb", name: "국민은행", owner: "husband", parentId: null },
    { id: "w-kb", name: "국민은행", owner: "wife", parentId: null },
    { id: "h-salary", name: "월급통장", owner: "husband", parentId: null },
    { id: "h-kb2", name: "국민은행", owner: "husband", parentId: "h-salary" },
    { id: "w-card", name: "신용카드", owner: "wife", parentId: null },
  ];
  const names = (items) => items.map((item) => item.name);
  eq(
    "이름이 안 겹치면 그대로",
    names(m.disambiguatePaymentMethodNames([{ id: "w-card", name: "신용카드" }, { id: "h-kb", name: "국민은행" }], all, owners)),
    ["신용카드", "국민은행"]
  );
  eq(
    "소유자가 다르면 소유자를 붙임",
    names(m.disambiguatePaymentMethodNames([{ id: "h-kb", name: "국민은행" }, { id: "w-kb", name: "국민은행" }, { id: "w-card", name: "신용카드" }], all, owners)),
    ["국민은행 (궁디)", "국민은행 (빵디)", "신용카드"]
  );
  eq(
    "같은 소유자 중복이면 상위 결제수단까지 붙임",
    names(m.disambiguatePaymentMethodNames([{ id: "h-kb", name: "국민은행" }, { id: "h-kb2", name: "국민은행" }], all, owners)),
    ["국민은행 (궁디)", "국민은행 (궁디 · 월급통장)"]
  );
  const original = [{ id: "w-card", name: "신용카드", amount: 1 }];
  const result = m.disambiguatePaymentMethodNames(original, all, owners);
  eq("바꿀 게 없으면 같은 객체(금액 등 다른 필드 유지)", result[0] === original[0] && result[0].amount === 1, true);
  const withTwins = [
    ...all,
    // 같은 소유자·같은 위치(최상위)에 같은 이름. 앱은 이런 중복 생성을 막지 않는다.
    { id: "h-cash-b", name: "현금", owner: "husband", parentId: null, order: 5 },
    { id: "h-cash-a", name: "현금", owner: "husband", parentId: null, order: 1 },
    { id: "w-cash", name: "현금", owner: "wife", parentId: null, order: 1 },
  ];
  eq(
    "같은 소유자·같은 위치 중복 → 설정 순서대로 순번",
    names(m.disambiguatePaymentMethodNames([{ id: "h-cash-b", name: "현금" }, { id: "h-cash-a", name: "현금" }], withTwins, owners)),
    ["현금 (궁디) #2", "현금 (궁디) #1"]
  );
  eq(
    "순번은 목록 순서와 무관하게 결제수단마다 고정",
    names(m.disambiguatePaymentMethodNames([{ id: "h-cash-a", name: "현금" }, { id: "w-cash", name: "현금" }, { id: "h-cash-b", name: "현금" }], withTwins, owners)),
    ["현금 (궁디) #1", "현금 (빵디)", "현금 (궁디) #2"]
  );
  eq(
    "목록에서 안 겹치면 순번도 소유자도 붙이지 않음 (0원 항목을 뺀 목록을 넘긴 경우)",
    names(m.disambiguatePaymentMethodNames([{ id: "h-cash-b", name: "현금" }, { id: "w-card", name: "신용카드" }], withTwins, owners)),
    ["현금", "신용카드"]
  );
  eq(
    "삭제된 결제수단끼리 겹치면 목록 안 순번 (안전장치)",
    names(m.disambiguatePaymentMethodNames([{ id: "gone2", name: "삭제된 결제수단" }, { id: "gone", name: "삭제된 결제수단" }], all, owners)),
    ["삭제된 결제수단 #2", "삭제된 결제수단 #1"]
  );
  eq(
    "삭제된 결제수단이 하나뿐이면 그대로",
    names(m.disambiguatePaymentMethodNames([{ id: "gone", name: "삭제된 결제수단" }, { id: "w-card", name: "신용카드" }], all, owners)),
    ["삭제된 결제수단", "신용카드"]
  );

  // 이름이 같은 상위 결제수단 두 개 아래에 각각 같은 이름의 하위 결제수단
  const twinParents = [
    { id: "b1", name: "은행", owner: "husband", parentId: null, order: 1 },
    { id: "b2", name: "은행", owner: "husband", parentId: null, order: 2 },
    { id: "c2", name: "현금", owner: "husband", parentId: "b2", order: 1 },
    { id: "c1", name: "현금", owner: "husband", parentId: "b1", order: 1 },
  ];
  eq(
    "같은 이름 상위 2개 아래 각각 같은 이름 → 순번으로 구분",
    names(m.disambiguatePaymentMethodNames([{ id: "c1", name: "현금" }, { id: "c2", name: "현금" }], twinParents, owners)),
    ["현금 (궁디 · 은행) #1", "현금 (궁디 · 은행) #2"]
  );
  // id 순서를 상위 순서와 반대로 둬서, 번호가 id가 아니라 상위 순서를 따르는지 확인
  const twinParentsReversedIds = [
    { id: "p-late", name: "은행", owner: "husband", parentId: null, order: 1 },
    { id: "p-early", name: "은행", owner: "husband", parentId: null, order: 2 },
    { id: "a-child", name: "현금", owner: "husband", parentId: "p-early", order: 1 },
    { id: "z-child", name: "현금", owner: "husband", parentId: "p-late", order: 1 },
  ];
  eq(
    "하위끼리 자기 순서가 같으면 상위 순서대로 번호 (id 순서 무관)",
    names(m.disambiguatePaymentMethodNames([{ id: "a-child", name: "현금" }, { id: "z-child", name: "현금" }], twinParentsReversedIds, owners)),
    ["현금 (궁디 · 은행) #2", "현금 (궁디 · 은행) #1"]
  );
  eq(
    "남편·아내 표시 이름이 같아도 구분",
    names(m.disambiguatePaymentMethodNames(
      [{ id: "h", name: "현금" }, { id: "w", name: "현금" }],
      [{ id: "h", name: "현금", owner: "husband", parentId: null, order: 1 }, { id: "w", name: "현금", owner: "wife", parentId: null, order: 1 }],
      { husband: "궁디", wife: "궁디", our: "우리" }
    )),
    ["현금 (궁디) #1", "현금 (궁디) #2"]
  );
  const literal = names(m.disambiguatePaymentMethodNames(
    [{ id: "h", name: "현금" }, { id: "w", name: "현금" }, { id: "x", name: "현금 (궁디)" }],
    [
      { id: "h", name: "현금", owner: "husband", parentId: null, order: 1 },
      { id: "w", name: "현금", owner: "wife", parentId: null, order: 1 },
      { id: "x", name: "현금 (궁디)", owner: "our", parentId: null, order: 1 },
    ],
    owners
  ));
  eq("이름 자체가 '현금 (궁디)'여도 서로 다름 (안전장치)", new Set(literal).size, 3);
}

// 두 보장을 검사한다: (1) 결과 이름이 모두 다르다 (2) 원래 이름이 하나뿐이던 항목은 그대로다
function guaranteeViolations(items, out) {
  const outNames = out.map((item) => item.name);
  const duplicates = outNames.length - new Set(outNames).size;
  const inCounts = new Map();
  items.forEach((item) => inCounts.set(item.name, (inCounts.get(item.name) ?? 0) + 1));
  const changedUnique = items.filter(
    (item, index) => inCounts.get(item.name) === 1 && out[index].name !== item.name
  ).length;
  return { duplicates, changedUnique };
}

console.log("disambiguatePaymentMethodNames 보장 — 일부러 만든 까다로운 입력");
{
  const owners = { husband: "H", wife: "W", our: "O" };
  // 지적된 사례 1: 겹치는 Cash 두 개 + 원래 고유한 "Cash (H) #1"
  const methods1 = [
    { id: "a", name: "Cash", owner: "husband", parentId: null, order: 1 },
    { id: "b", name: "Cash", owner: "husband", parentId: null, order: 2 },
    { id: "x", name: "Cash (H) #1", owner: "our", parentId: null, order: 1 },
  ];
  const items1 = methods1.map((method) => ({ id: method.id, name: method.name }));
  const out1 = m.disambiguatePaymentMethodNames(items1, methods1, owners);
  eq("Cash ×2 + 'Cash (H) #1': 원래 고유한 이름 유지", out1[2].name, "Cash (H) #1");
  eq("Cash ×2 + 'Cash (H) #1': 위반 없음", guaranteeViolations(items1, out1), { duplicates: 0, changedUnique: 0 });

  // 지적된 사례 2: 접미사처럼 이어지는 이름들 (찾을 수 없는 ID)
  const chainNames = ["X", "X", "X #1", "X #1", "X #1 #1", "X #1 #1", "X #1 #1 #1"];
  const items2 = chainNames.map((name, index) => ({ id: `g${index}`, name }));
  const out2 = m.disambiguatePaymentMethodNames(items2, [], owners);
  eq("이어지는 이름 7개: 위반 없음", guaranteeViolations(items2, out2), { duplicates: 0, changedUnique: 0 });

  // 숫자·기호 ID와 결과 접미사가 우연히 같은 모양이 되는 경우
  const items3 = ["Y", "Y", "Y #2", "Y #3", "Y #2 #2"].map((name, index) => ({ id: ["#2", "2", "Y", "", "(2)"][index], name }));
  const out3 = m.disambiguatePaymentMethodNames(items3, [], owners);
  eq("기호 ID + 번호 모양 이름: 위반 없음", guaranteeViolations(items3, out3), { duplicates: 0, changedUnique: 0 });
}

console.log("disambiguatePaymentMethodNames 속성 검사 (무작위 5,000회, 까다로운 이름 포함)");
{
  // 재현 가능한 의사난수 (mulberry32). 단순 LCG의 `seed % n`은 하위 비트 주기가
  // 짧아서 이름 조합이 서로 겹치지 않는 패턴에 갇힌다(겹침 0회가 나왔다).
  let seed = 20261028;
  const rand = (n) => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return Math.floor((((t ^ (t >>> 14)) >>> 0) / 4294967296) * n);
  };
  // 결과 접미사와 같은 모양의 이름을 일부러 섞는다
  const BASES = ["현금", "Cash", "X", "삭제된 결제수단"];
  const DECORATIONS = ["", "", "", " (궁디)", " (H)", " (궁디 · 은행)", " (O)"];
  const CHAINS = ["", "", "", " #1", " #2", " #1 #1", " #1 #2", " #2 #2"];
  const makeName = () => BASES[rand(BASES.length)] + DECORATIONS[rand(DECORATIONS.length)] + CHAINS[rand(CHAINS.length)];
  const OWNERS = ["husband", "wife", "our", undefined];
  const LABEL_SETS = [
    { husband: "궁디", wife: "빵디", our: "우리" },
    { husband: "궁디", wife: "궁디", our: "우리" },
    { husband: "H", wife: "W", our: "O" },
    { husband: "H", wife: "H", our: "H" },
  ];
  let duplicateRuns = 0;
  let changedUniqueRuns = 0;
  let collidedInputs = 0;
  let sample = null;
  for (let run = 0; run < 5000; run += 1) {
    const methods = [];
    const count = 2 + rand(12);
    for (let i = 0; i < count; i += 1) {
      methods.push({
        id: `m${i}`,
        name: makeName(),
        owner: OWNERS[rand(OWNERS.length)],
        parentId: i > 0 && rand(3) === 0 ? `m${rand(i)}` : null,
        order: rand(4),
      });
    }
    // 화면 목록: 일부 결제수단 + 가끔 찾을 수 없는 ID(삭제된 결제수단 등)
    const items = methods
      .filter(() => rand(4) !== 0)
      .map((method) => ({ id: method.id, name: m.formatPaymentMethodLabel(method.name) }));
    for (let g = rand(4); g > 0; g -= 1) {
      items.push({ id: `gone${g}`, name: rand(2) === 0 ? "삭제된 결제수단" : makeName() });
    }
    if (new Set(items.map((item) => item.name)).size < items.length) {
      collidedInputs += 1;
    }
    const out = m.disambiguatePaymentMethodNames(items, methods, LABEL_SETS[rand(LABEL_SETS.length)]);
    const v = guaranteeViolations(items, out);
    if (v.duplicates > 0) {
      duplicateRuns += 1;
    }
    if (v.changedUnique > 0) {
      changedUniqueRuns += 1;
    }
    if ((v.duplicates > 0 || v.changedUnique > 0) && !sample) {
      sample = { inNames: items.map((item) => item.name), outNames: out.map((item) => item.name) };
    }
  }
  console.log(`  (입력에 이름 겹침이 있던 실행: ${collidedInputs} / 5000)`);
  eq("결과 이름이 항상 서로 다름", duplicateRuns, 0);
  eq("원래 이름이 하나뿐이던 항목은 항상 그대로", changedUniqueRuns, 0);
  eq("까다로운 입력이 실제로 충분히 생성됨 (겹침 1,000회 이상)", collidedInputs >= 1000, true);
  if (sample) {
    console.log("  실패 예:", JSON.stringify(sample));
  }
}

console.log(failures === 0 ? "\n모두 통과" : `\n실패 ${failures}건`);
process.exit(failures === 0 ? 0 : 1);
