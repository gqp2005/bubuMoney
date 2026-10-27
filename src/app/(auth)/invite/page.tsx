"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { useAuth } from "@/components/auth-provider";
import { useHousehold } from "@/components/household-provider";
import { acceptInviteByCode } from "@/lib/household";

export default function InvitePage() {
  const router = useRouter();
  const { user } = useAuth();
  const { householdId } = useHousehold();
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [inviteCode, setInviteCode] = useState("");

  useEffect(() => {
    if (householdId) {
      router.replace("/dashboard");
    }
  }, [householdId, router]);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setLoading(true);
    const code = inviteCode.trim().toUpperCase();
    if (!code) {
      setError("초대코드를 입력해주세요.");
      setLoading(false);
      return;
    }
    try {
      // 아직 계정이 없으면 코드만 들고 회원가입으로 보낸다.
      // 코드 검증과 참여는 서버(/api/signup)가 계정 생성 전에 처리한다.
      if (!user) {
        const params = new URLSearchParams({ invite: code });
        router.replace(`/signup?${params.toString()}`);
        return;
      }
      // 참여 알림은 서버가 같은 트랜잭션에서 남긴다.
      await acceptInviteByCode({ user, code });
      router.replace("/dashboard");
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      setError(message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-2 text-center">
        <h1 className="text-2xl font-semibold">초대코드</h1>
        <p className="text-sm text-[color:rgba(45,38,34,0.7)]">
          배우자에게 받은 코드를 입력하세요.
        </p>
      </div>
      <form className="flex flex-col gap-4" onSubmit={handleSubmit}>
        <label className="text-sm font-medium">
          초대코드
          <input
            type="text"
            name="code"
            placeholder="ABC123"
            className="mt-2 w-full rounded-xl border border-[var(--border)] bg-white px-4 py-3 uppercase tracking-widest"
            value={inviteCode}
            onChange={(event) => setInviteCode(event.target.value)}
          />
        </label>
        <button
          type="submit"
          className="rounded-xl bg-[var(--accent)] px-4 py-3 text-white disabled:opacity-70"
          disabled={loading}
        >
          {loading ? "참여 중..." : "가계부 참여"}
        </button>
      </form>
      {error ? (
        <p className="text-center text-sm text-red-600">{error}</p>
      ) : null}
      {!user ? (
        <p className="text-center text-sm text-[color:rgba(45,38,34,0.7)]">
          계정이 없다면 회원가입 화면으로 이동합니다. 초대코드 확인은 가입
          직후에 진행됩니다.
        </p>
      ) : null}
      <div className="text-center text-sm">
        <Link className="text-[var(--accent)]" href="/login?next=/invite">
          로그인 화면으로 돌아가기
        </Link>
      </div>
    </div>
  );
}
