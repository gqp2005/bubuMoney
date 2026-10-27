import type { NextRequest } from "next/server";
import { ALLOW_OPEN_SIGNUP } from "@/lib/auth-policy";
import { getAdminDb, verifyRequestUid } from "@/lib/firebase/admin";
import {
  createHouseholdForUser,
  getLinkedHouseholdId,
  readProfileInput,
} from "@/lib/server/household-admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * 로그인한 사용자가 새 가계부를 만든다.
 *
 * Firestore 규칙은 클라이언트의 households 생성을 막는다. 이 가계부는
 * 부부 두 사람만 쓰므로, 새 가계부 생성은 NEXT_PUBLIC_ALLOW_OPEN_SIGNUP을
 * 켰을 때만 허용한다.
 */
export async function POST(request: NextRequest) {
  const uid = await verifyRequestUid(request);
  if (!uid) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!ALLOW_OPEN_SIGNUP) {
    return Response.json(
      { error: "새 가계부를 만들 수 없습니다. 초대코드로 참여해주세요." },
      { status: 403 }
    );
  }

  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return Response.json({ error: "잘못된 요청입니다." }, { status: 400 });
  }

  const db = getAdminDb();
  if (await getLinkedHouseholdId(db, uid)) {
    return Response.json(
      { error: "이미 연결된 가계부가 있습니다." },
      { status: 409 }
    );
  }

  const name =
    typeof body.name === "string" && body.name.trim()
      ? body.name.trim().slice(0, 40)
      : "우리집";
  const partnerDisplayName =
    typeof body.partnerDisplayName === "string"
      ? body.partnerDisplayName.trim().slice(0, 40)
      : "";

  try {
    const householdId = await createHouseholdForUser(db, uid, {
      name,
      creator: readProfileInput(body),
      partnerDisplayName,
    });
    return Response.json({ householdId });
  } catch (err) {
    console.error("[households] create failed", err);
    return Response.json(
      { error: "가계부 생성에 실패했습니다." },
      { status: 500 }
    );
  }
}
