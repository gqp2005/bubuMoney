import type { NextRequest } from "next/server";
import { getAdminDb, verifyRequestUid } from "@/lib/firebase/admin";
import {
  InviteRejection,
  acceptInvite,
  normalizeInviteCode,
  readProfileInput,
} from "@/lib/server/household-admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * 이미 로그인한 사용자가 초대코드로 가계부에 참여한다.
 * (새 계정 + 참여는 /api/signup 이 처리한다.)
 *
 * 멤버 등록은 Admin SDK를 가진 서버에서만 한다. Firestore 규칙은
 * 클라이언트의 members 생성을 막는다.
 */
export async function POST(request: NextRequest) {
  const uid = await verifyRequestUid(request);
  if (!uid) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return Response.json({ error: "잘못된 요청입니다." }, { status: 400 });
  }

  const code = normalizeInviteCode(body.code);
  if (!code) {
    return Response.json({ error: "초대코드를 확인해주세요." }, { status: 400 });
  }

  const profile = readProfileInput(body);
  try {
    const householdId = await acceptInvite(getAdminDb(), uid, code, {
      // 기존 사용자의 닉네임은 입력이 있을 때만 덮어쓴다.
      displayName: profile.displayName || undefined,
      spouseRole: body.spouseRole ? profile.spouseRole : undefined,
    });
    return Response.json({ householdId });
  } catch (err) {
    if (err instanceof InviteRejection) {
      return Response.json({ error: err.message }, { status: err.status });
    }
    console.error("[invites/accept] failed", err);
    return Response.json(
      { error: "초대 처리 중 오류가 발생했습니다." },
      { status: 500 }
    );
  }
}
