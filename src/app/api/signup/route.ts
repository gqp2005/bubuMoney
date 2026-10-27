import type { NextRequest } from "next/server";
import { ALLOW_OPEN_SIGNUP } from "@/lib/auth-policy";
import { getAdminAuth, getAdminDb } from "@/lib/firebase/admin";
import {
  InviteRejection,
  acceptInvite,
  createHouseholdForUser,
  normalizeInviteCode,
  precheckInvite,
  readProfileInput,
} from "@/lib/server/household-admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function fail(message: string, status: number) {
  return Response.json({ error: message }, { status });
}

/**
 * 회원가입. 계정 생성은 이 라우트에서만 일어난다.
 *
 * 순서: 입력 검증 → 초대코드 검증 → 계정 생성 → 가계부 참여(또는 생성).
 * 계정을 만든 뒤 참여 단계가 실패하면 서버가 그 계정을 지운다.
 * 클라이언트는 성공 응답을 받은 뒤에만 로그인한다.
 *
 * 운영에서는 Firebase Console의 이메일 가입을 꺼둔다. 그래도 Admin SDK의
 * createUser는 동작하므로 이 경로만 계정을 만들 수 있다.
 */
export async function POST(request: NextRequest) {
  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return fail("잘못된 요청입니다.", 400);
  }

  const email = typeof body.email === "string" ? body.email.trim() : "";
  const password = typeof body.password === "string" ? body.password : "";
  if (!EMAIL_PATTERN.test(email) || email.length > 254) {
    return fail("이메일 형식을 확인해주세요.", 400);
  }
  if (password.length < 6 || password.length > 128) {
    return fail("비밀번호는 6자리 이상이어야 합니다.", 400);
  }

  const profile = readProfileInput(body);
  const hasInvite = body.inviteCode !== undefined && body.inviteCode !== "";
  const code = hasInvite ? normalizeInviteCode(body.inviteCode) : null;
  if (hasInvite && !code) {
    return fail("유효하지 않은 초대코드입니다.", 404);
  }
  if (!code && !ALLOW_OPEN_SIGNUP) {
    return fail("초대코드가 필요합니다.", 403);
  }

  const db = getAdminDb();
  const auth = getAdminAuth();

  // 1) 계정을 만들기 전에 초대코드부터 확인한다.
  if (code) {
    try {
      await precheckInvite(db, code);
    } catch (err) {
      if (err instanceof InviteRejection) {
        return fail(err.message, err.status);
      }
      console.error("[signup] invite precheck failed", err);
      return fail("가입 처리 중 오류가 발생했습니다.", 500);
    }
  }

  // 2) 계정 생성
  let uid: string;
  try {
    const created = await auth.createUser({
      email,
      password,
      displayName: profile.displayName || undefined,
    });
    uid = created.uid;
  } catch (err) {
    const errCode = (err as { code?: string }).code ?? "";
    if (errCode === "auth/email-already-exists") {
      return fail("이미 가입된 이메일입니다. 로그인해주세요.", 409);
    }
    if (errCode === "auth/invalid-email") {
      return fail("이메일 형식을 확인해주세요.", 400);
    }
    if (errCode === "auth/invalid-password") {
      return fail("비밀번호는 6자리 이상이어야 합니다.", 400);
    }
    console.error("[signup] createUser failed", err);
    return fail("가입 처리 중 오류가 발생했습니다.", 500);
  }

  // 3) 가계부 참여 또는 생성. 실패하면 방금 만든 계정을 서버에서 지운다.
  try {
    const householdId = code
      ? await acceptInvite(db, uid, code, profile)
      : await createHouseholdForUser(db, uid, {
          name: "우리집",
          creator: profile,
        });
    return Response.json({ householdId });
  } catch (err) {
    try {
      await auth.deleteUser(uid);
    } catch (cleanupErr) {
      // 삭제까지 실패하면 고아 계정이 남는다. 운영자가 찾을 수 있게 남긴다.
      console.error("[signup] orphan account cleanup failed", {
        uid,
        cleanupErr,
      });
    }
    if (err instanceof InviteRejection) {
      return fail(err.message, err.status);
    }
    console.error("[signup] household link failed", err);
    return fail("가입 처리 중 오류가 발생했습니다.", 500);
  }
}
