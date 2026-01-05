"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import { FirebaseError } from "firebase/app";
import { signUpWithEmail } from "@/lib/firebase/auth";
import { createUserProfile, setUserHousehold } from "@/lib/firebase/user";
import {
  acceptInvite,
  createHousehold,
  findInviteByCode,
  joinHousehold,
} from "@/lib/household";
import { useAuth } from "@/components/auth-provider";
import { addNotification } from "@/lib/notifications";

export default function SignupClient() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { user } = useAuth();
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const inviteCode = searchParams.get("invite")?.toUpperCase() ?? "";
  const partnerNameParam = searchParams.get("partnerName") ?? "";
  const inviterRole = searchParams.get("inviterRole") ?? "";
  const defaultRole =
    inviterRole === "husband"
      ? "wife"
      : inviterRole === "wife"
      ? "husband"
      : "husband";
  const [nickname, setNickname] = useState(partnerNameParam);
  const [spouseRole, setSpouseRole] = useState<"husband" | "wife">(
    defaultRole === "wife" ? "wife" : "husband"
  );

  useEffect(() => {
    if (user) {
      router.replace("/dashboard");
    }
  }, [router, user]);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setLoading(true);
    const formData = new FormData(event.currentTarget);
    const email = String(formData.get("email") ?? "");
    const password = String(formData.get("password") ?? "");
    const nicknameValue = nickname.trim();
    const rawRole = String(formData.get("spouseRole") ?? spouseRole);
    const resolvedRole = rawRole === "wife" ? "wife" : "husband";
    const householdName = "우리집";
    try {
      const credential = await signUpWithEmail(email, password);
      if (inviteCode) {
        const invite = await findInviteByCode(inviteCode);
        if (!invite) {
          setError("유효하지 않은 초대코드입니다.");
          return;
        }
        await joinHousehold(
          invite.householdId,
          credential.user.uid,
          invite.createdBy
        );
        await acceptInvite(
          invite.inviteId,
          invite.householdId,
          credential.user.uid
        );
        await setUserHousehold(credential.user.uid, invite.householdId);
        await createUserProfile(
          credential.user.uid,
          invite.householdId,
          nicknameValue,
          resolvedRole
        );
        await addNotification(invite.householdId, {
          title: "초대 참여 완료",
          message: "초대코드로 가계부에 참여했습니다.",
          level: "success",
          type: "invite.accepted",
        });
        router.replace("/dashboard");
        return;
      }
      const householdId = await createHousehold(
        householdName,
        credential.user.uid,
        nicknameValue,
        undefined,
        resolvedRole
      );
      await createUserProfile(
        credential.user.uid,
        householdId,
        nicknameValue,
        resolvedRole
      );
      router.replace("/dashboard");
    } catch (err) {
      if (err instanceof FirebaseError) {
        if (err.code === "auth/email-already-in-use") {
          setError("이미 사용 중인 이메일입니다.");
        } else if (err.code === "auth/weak-password") {
          setError("비밀번호는 6자리 이상이어야 합니다.");
        } else {
          setError(`회원가입 오류: ${err.code}`);
        }
      } else {
        setError("회원가입에 실패했습니다. 잠시 후 다시 시도해주세요.");
      }
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-2 text-center">
        <h1 className="text-2xl font-semibold">회원가입</h1>
        <p className="text-sm text-[color:rgba(45,38,34,0.7)]">
          {inviteCode
            ? "초대코드로 가계부에 참여하세요."
            : "새 계정을 만들고 가계부를 시작하세요."}
        </p>
      </div>
      <form className="flex flex-col gap-4" onSubmit={handleSubmit}>
        <label className="text-sm font-medium">
          내 역할
          <div className="mt-2 flex items-center gap-4 text-sm">
            <label className="flex items-center gap-2">
              <input
                type="radio"
                name="spouseRole"
                value="husband"
                checked={spouseRole === "husband"}
                onChange={() => setSpouseRole("husband")}
              />
              남편
            </label>
            <label className="flex items-center gap-2">
              <input
                type="radio"
                name="spouseRole"
                value="wife"
                checked={spouseRole === "wife"}
                onChange={() => setSpouseRole("wife")}
              />
              아내
            </label>
          </div>
        </label>
        <label className="text-sm font-medium">
          닉네임
          <input
            type="text"
            name="nickname"
            placeholder="예) 민수"
            className="mt-2 w-full rounded-xl border border-[var(--border)] bg-white px-4 py-3"
            value={nickname}
            onChange={(event) => setNickname(event.target.value)}
          />
        </label>
        <label className="text-sm font-medium">
          이메일
          <input
            type="email"
            name="email"
            placeholder="you@example.com"
            className="mt-2 w-full rounded-xl border border-[var(--border)] bg-white px-4 py-3"
          />
        </label>
        <label className="text-sm font-medium">
          비밀번호
          <input
            type="password"
            name="password"
            placeholder="●●●●●●"
            className="mt-2 w-full rounded-xl border border-[var(--border)] bg-white px-4 py-3"
          />
        </label>
        <button
          type="submit"
          className="rounded-xl bg-[var(--accent)] px-4 py-3 text-white disabled:opacity-70"
          disabled={loading}
        >
          {loading ? "가입 중.." : "계정 만들기"}
        </button>
      </form>
      {error ? (
        <p className="text-center text-sm text-red-600">{error}</p>
      ) : null}
      <div className="text-center text-sm">
        <Link className="text-[var(--accent)]" href="/login">
          이미 계정이 있나요? 로그인
        </Link>
      </div>
    </div>
  );
}
