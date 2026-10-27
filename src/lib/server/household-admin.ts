import "server-only";

import {
  FieldValue,
  Timestamp,
  type DocumentReference,
  type Firestore,
  type WriteBatch,
} from "firebase-admin/firestore";

export type SpouseRole = "husband" | "wife";

export type ProfileInput = {
  displayName: string;
  spouseRole: SpouseRole;
};

/**
 * 초대 처리 중 사용자에게 그대로 보여줄 수 있는 실패.
 * status는 API 응답 코드로 쓴다.
 */
export class InviteRejection extends Error {
  constructor(
    message: string,
    readonly status: number
  ) {
    super(message);
  }
}

const NOTIFICATION_TTL_MS = 14 * 24 * 60 * 60 * 1000;

type PublicInvite = {
  householdId?: string;
  inviteId?: string;
  createdBy?: string;
  usedBy?: string | null;
  expiresAt?: Timestamp;
};

/**
 * 초대코드 문서를 검증한다. 트랜잭션 안팎에서 같은 규칙을 쓰기 위해 분리했다.
 * uid를 넘기면 "본인이 이미 사용한 코드"는 재시도로 보고 통과시킨다.
 */
function assertUsableInvite(
  data: PublicInvite | undefined,
  uid: string | null
): asserts data is Required<Pick<PublicInvite, "householdId" | "inviteId" | "createdBy">> &
  PublicInvite {
  if (!data || !data.householdId || !data.inviteId || !data.createdBy) {
    throw new InviteRejection("유효하지 않은 초대코드입니다.", 404);
  }
  if (data.usedBy && data.usedBy !== uid) {
    throw new InviteRejection("이미 사용된 초대코드입니다.", 409);
  }
  if (data.expiresAt && data.expiresAt.toMillis() <= Date.now()) {
    throw new InviteRejection("만료된 초대코드입니다.", 410);
  }
  if (uid && data.createdBy === uid) {
    throw new InviteRejection(
      "본인이 만든 초대코드는 사용할 수 없습니다.",
      409
    );
  }
}

export function normalizeInviteCode(raw: unknown) {
  const code = typeof raw === "string" ? raw.trim().toUpperCase() : "";
  if (!code || code.length > 64 || !/^[A-Z0-9]+$/.test(code)) {
    return null;
  }
  return code;
}

/**
 * 계정을 만들기 전에 초대코드가 쓸 수 있는 상태인지 확인한다.
 * 실제 소모는 acceptInvite()의 트랜잭션에서 다시 검증한다.
 */
export async function precheckInvite(db: Firestore, code: string) {
  const snap = await db.collection("publicInvites").doc(code).get();
  assertUsableInvite(snap.exists ? (snap.data() as PublicInvite) : undefined, null);
}

/**
 * 초대코드를 소모하고 사용자를 가계부 멤버로 등록한다.
 *
 * Firestore 트랜잭션은 모든 읽기가 쓰기보다 먼저 와야 한다.
 * 그래서 필요한 문서를 전부 읽은 뒤에 쓰기를 시작한다.
 */
export async function acceptInvite(
  db: Firestore,
  uid: string,
  code: string,
  profile: Partial<ProfileInput>
): Promise<string> {
  const publicInviteRef = db.collection("publicInvites").doc(code);
  const userRef = db.collection("users").doc(uid);

  return db.runTransaction(async (tx) => {
    // ── 읽기 ────────────────────────────────────────────────
    const publicInviteSnap = await tx.get(publicInviteRef);
    const invite = publicInviteSnap.exists
      ? (publicInviteSnap.data() as PublicInvite)
      : undefined;
    assertUsableInvite(invite, uid);

    const householdRef = db.collection("households").doc(invite.householdId);
    const memberRef = householdRef.collection("members").doc(uid);
    const [householdSnap, memberSnap, userSnap] = await Promise.all([
      tx.get(householdRef),
      tx.get(memberRef),
      tx.get(userRef),
    ]);
    if (!householdSnap.exists) {
      throw new InviteRejection("초대한 가계부를 찾을 수 없습니다.", 404);
    }

    // ── 쓰기 ────────────────────────────────────────────────
    if (!memberSnap.exists) {
      tx.set(memberRef, {
        role: "member",
        invitedBy: invite.createdBy,
        createdAt: FieldValue.serverTimestamp(),
      });
      tx.update(householdRef, { membersCount: FieldValue.increment(1) });
    }

    tx.update(publicInviteRef, { usedBy: uid });
    tx.set(
      householdRef.collection("invites").doc(invite.inviteId),
      { usedBy: uid },
      { merge: true }
    );

    const profileFields: Record<string, unknown> = {
      id: uid,
      householdId: invite.householdId,
    };
    if (profile.spouseRole) {
      profileFields.spouseRole = profile.spouseRole;
    }
    if (profile.displayName) {
      profileFields.displayName = profile.displayName;
    }
    if (userSnap.exists) {
      tx.update(userRef, profileFields);
    } else {
      tx.set(userRef, {
        displayName: null,
        spouseRole: null,
        ...profileFields,
        createdAt: FieldValue.serverTimestamp(),
      });
    }

    if (!memberSnap.exists) {
      tx.set(householdRef.collection("notifications").doc(), {
        title: "초대 참여 완료",
        message: "초대코드로 가계부에 참여했습니다.",
        level: "success",
        type: "invite.accepted",
        createdAt: FieldValue.serverTimestamp(),
        expiresAt: Timestamp.fromMillis(Date.now() + NOTIFICATION_TTL_MS),
      });
    }

    return invite.householdId;
  });
}

function seedHouseholdDefaults(
  batch: WriteBatch,
  householdRef: DocumentReference,
  creator: ProfileInput,
  partnerDisplayName: string
) {
  const defaultCategories = [
    { name: "급여", type: "income", order: 1, parentId: null },
    { name: "기타수입", type: "income", order: 2, parentId: null },
  ];
  defaultCategories.forEach((category) => {
    batch.set(householdRef.collection("categories").doc(), category);
  });

  const creatorName = creator.displayName.trim();
  const partnerName = partnerDisplayName.trim();
  const husbandName =
    creator.spouseRole === "wife" ? partnerName || "남편" : creatorName || "남편";
  const wifeName =
    creator.spouseRole === "wife" ? creatorName || "아내" : partnerName || "아내";
  [
    { name: husbandName, order: 1 },
    { name: wifeName, order: 2 },
    { name: "우리", order: 3 },
    { name: "시댁", order: 4 },
    { name: "처가댁", order: 5 },
    { name: "아기", order: 6 },
  ].forEach((subject) => {
    batch.set(householdRef.collection("subjects").doc(), subject);
  });

  const defaultPaymentMethods = [
    { name: "현금", order: 1 },
    { name: "은행", order: 2 },
    { name: "체크카드", order: 3 },
    { name: "신용카드", order: 4 },
    { name: "대출", order: 5 },
    { name: "기타", order: 6 },
  ];
  (["husband", "wife", "our"] as const).forEach((owner) => {
    defaultPaymentMethods.forEach((method) => {
      batch.set(householdRef.collection("paymentMethods").doc(), {
        ...method,
        owner,
        parentId: null,
      });
    });
  });
}

/**
 * 새 가계부를 만들고 생성자를 소유자로 등록한다. 한 번의 batch로 커밋한다.
 */
export async function createHouseholdForUser(
  db: Firestore,
  uid: string,
  params: {
    name: string;
    creator: ProfileInput;
    partnerDisplayName?: string;
  }
): Promise<string> {
  const householdRef = db.collection("households").doc();
  const batch = db.batch();

  batch.set(householdRef, {
    name: params.name,
    createdAt: FieldValue.serverTimestamp(),
    createdBy: uid,
    membersCount: 1,
    creatorDisplayName: params.creator.displayName || null,
    partnerDisplayName: params.partnerDisplayName?.trim() || null,
  });
  batch.set(householdRef.collection("members").doc(uid), {
    role: "owner",
    createdAt: FieldValue.serverTimestamp(),
  });
  seedHouseholdDefaults(
    batch,
    householdRef,
    params.creator,
    params.partnerDisplayName ?? ""
  );
  batch.set(
    db.collection("users").doc(uid),
    {
      id: uid,
      householdId: householdRef.id,
      displayName: params.creator.displayName || null,
      spouseRole: params.creator.spouseRole,
      createdAt: FieldValue.serverTimestamp(),
    },
    { merge: true }
  );

  await batch.commit();
  return householdRef.id;
}

/** 사용자가 이미 가계부에 연결돼 있는지 확인한다. */
export async function getLinkedHouseholdId(db: Firestore, uid: string) {
  const snap = await db.collection("users").doc(uid).get();
  const householdId = snap.exists
    ? (snap.data() as { householdId?: string | null }).householdId
    : null;
  return householdId || null;
}

export function readProfileInput(body: {
  displayName?: unknown;
  nickname?: unknown;
  spouseRole?: unknown;
}): ProfileInput {
  const rawName =
    typeof body.displayName === "string"
      ? body.displayName
      : typeof body.nickname === "string"
        ? body.nickname
        : "";
  return {
    displayName: rawName.trim().slice(0, 40),
    spouseRole: body.spouseRole === "wife" ? "wife" : "husband",
  };
}
