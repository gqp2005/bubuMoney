import {
  Timestamp,
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  limit,
  query,
  serverTimestamp,
  setDoc,
  writeBatch,
} from "firebase/firestore";
import type { User as FirebaseUser } from "firebase/auth";
import { db } from "@/lib/firebase/client";
import {
  budgetsCol,
  categoriesCol,
  householdDoc,
  invitesCol,
  membersCol,
  paymentMethodsCol,
  publicInvitesCol,
  transactionsCol,
  subjectsCol,
} from "@/lib/firebase/firestore";
import { getUserProfile } from "@/lib/firebase/user";

type SpouseRole = "husband" | "wife";

type ResetOptions = {
  transactions?: boolean;
  memos?: boolean;
  categories?: boolean;
  subjects?: boolean;
  paymentMethods?: boolean;
  budgets?: boolean;
  invites?: boolean;
  members?: boolean;
  household?: boolean;
};

async function deleteCollectionDocs(colRef: ReturnType<typeof collection>) {
  let snapshot = await getDocs(query(colRef, limit(500)));
  while (!snapshot.empty) {
    const batch = writeBatch(db);
    snapshot.docs.forEach((docSnap) => {
      batch.delete(docSnap.ref);
    });
    await batch.commit();
    snapshot = await getDocs(query(colRef, limit(500)));
  }
}

export async function resetHouseholdData(
  householdId: string,
  options: ResetOptions
) {
  if (!householdId) {
    return;
  }
  if (options.transactions || options.household) {
    await deleteCollectionDocs(transactionsCol(householdId));
  }
  if (options.memos || options.household) {
    const memosCol = collection(db, "households", householdId, "memos");
    await deleteCollectionDocs(memosCol);
  }
  if (options.categories || options.household) {
    await deleteCollectionDocs(categoriesCol(householdId));
  }
  if (options.subjects || options.household) {
    await deleteCollectionDocs(subjectsCol(householdId));
  }
  if (options.paymentMethods || options.household) {
    await deleteCollectionDocs(paymentMethodsCol(householdId));
  }
  if (options.budgets || options.household) {
    await deleteCollectionDocs(budgetsCol(householdId));
  }
  if (options.invites || options.household) {
    await deleteCollectionDocs(invitesCol(householdId));
  }
  if (options.members || options.household) {
    await deleteCollectionDocs(membersCol(householdId));
  }
  if (options.household) {
    await deleteDoc(householdDoc(householdId));
  }
}

/**
 * 초대코드를 만든다.
 *
 * 코드는 publicInvites 문서의 ID로 쓰이므로, 짧으면 추측으로 householdId가
 * 새어나갈 수 있다. 32자 알파벳 12자리 = 약 1.2 x 10^18 가지.
 * 난수는 Math.random() 대신 crypto를 쓴다.
 */
export function generateInviteCode(length = 12) {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const bytes = new Uint8Array(length);
  crypto.getRandomValues(bytes);
  let code = "";
  for (let i = 0; i < length; i += 1) {
    // chars.length(32)가 256의 약수라 나머지 편향이 없다.
    code += chars[bytes[i] % chars.length];
  }
  return code;
}

export async function createInvite(householdId: string, uid: string) {
  const code = generateInviteCode();
  const expiresAt = Timestamp.fromDate(
    new Date(Date.now() + 1000 * 60 * 60 * 24 * 7)
  );
  const userProfile = await getUserProfile(uid);
  const householdSnapshot = await getDoc(householdDoc(householdId));
  const householdData = householdSnapshot.exists()
    ? (householdSnapshot.data() as { partnerDisplayName?: string | null })
    : {};
  const inviteRef = await addDoc(invitesCol(householdId), {
    code,
    createdBy: uid,
    createdAt: serverTimestamp(),
    expiresAt,
    inviterRole: userProfile?.spouseRole ?? null,
    inviterDisplayName: userProfile?.displayName ?? null,
    partnerDisplayName: householdData.partnerDisplayName ?? null,
  });
  await setDoc(doc(publicInvitesCol(), code), {
    code,
    householdId,
    inviteId: inviteRef.id,
    createdBy: uid,
    createdAt: serverTimestamp(),
    expiresAt,
    usedBy: null,
    inviterRole: userProfile?.spouseRole ?? null,
    inviterDisplayName: userProfile?.displayName ?? null,
    partnerDisplayName: householdData.partnerDisplayName ?? null,
  });
  return { id: inviteRef.id, code, expiresAt };
}

/**
 * 서버 API 호출 실패. status가 0이면 응답을 받지 못한 경우(네트워크 단절 등)로,
 * 서버에서는 처리가 끝났을 수도 있다.
 */
export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number
  ) {
    super(message);
  }

  get responseLost() {
    return this.status === 0;
  }
}

async function postJson(
  url: string,
  body: Record<string, unknown>,
  user?: FirebaseUser
): Promise<{ householdId: string }> {
  const headers: Record<string, string> = {
    "content-type": "application/json",
  };
  if (user) {
    headers.authorization = `Bearer ${await user.getIdToken()}`;
  }

  let response: Response;
  try {
    response = await fetch(url, {
      method: "POST",
      headers,
      body: JSON.stringify(body),
    });
  } catch {
    throw new ApiError("서버에 연결하지 못했습니다.", 0);
  }

  const payload = (await response.json().catch(() => null)) as {
    householdId?: string;
    error?: string;
  } | null;
  if (!response.ok || !payload?.householdId) {
    throw new ApiError(
      payload?.error ?? "요청 처리 중 오류가 발생했습니다.",
      response.status
    );
  }
  return { householdId: payload.householdId };
}

/**
 * 회원가입. 계정 생성과 가계부 참여(또는 생성)를 서버가 한 번에 처리한다.
 * 성공한 뒤에 클라이언트가 같은 이메일·비밀번호로 로그인한다.
 */
export async function requestSignup(params: {
  email: string;
  password: string;
  nickname: string;
  spouseRole: SpouseRole;
  inviteCode?: string;
}) {
  return postJson("/api/signup", params);
}

/**
 * 이미 로그인한 사용자가 초대코드로 가계부에 참여한다.
 * 멤버 등록과 초대코드 소모는 서버(/api/invites/accept)가 처리한다.
 */
export async function acceptInviteByCode(params: {
  user: FirebaseUser;
  code: string;
  displayName?: string;
  spouseRole?: SpouseRole;
}): Promise<string> {
  const { householdId } = await postJson(
    "/api/invites/accept",
    {
      code: params.code,
      displayName: params.displayName,
      spouseRole: params.spouseRole,
    },
    params.user
  );
  return householdId;
}

/**
 * 로그인한 사용자가 새 가계부를 만든다. 서버가 허용할 때만 성공한다.
 */
export async function createHouseholdViaApi(params: {
  user: FirebaseUser;
  name: string;
  displayName?: string;
  partnerDisplayName?: string;
}): Promise<string> {
  const { householdId } = await postJson(
    "/api/households",
    {
      name: params.name,
      displayName: params.displayName,
      partnerDisplayName: params.partnerDisplayName,
    },
    params.user
  );
  return householdId;
}
