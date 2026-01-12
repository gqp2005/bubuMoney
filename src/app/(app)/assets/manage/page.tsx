"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useAuth } from "@/components/auth-provider";
import { useHousehold } from "@/components/household-provider";
import { useAccountGroups } from "@/hooks/use-account-groups";
import { addAccountGroup, deleteAccountGroup, updateAccountGroup } from "@/lib/accounts";

export default function AssetGroupManagePage() {
  const { user } = useAuth();
  const { householdId } = useHousehold();
  const { groups, loading } = useAccountGroups(householdId);
  const [newGroupName, setNewGroupName] = useState("");
  const [newGroupVisibility, setNewGroupVisibility] = useState<
    "shared" | "personal"
  >("shared");
  const [draftNames, setDraftNames] = useState<Record<string, string>>({});
  const [draftVisibility, setDraftVisibility] = useState<
    Record<string, "shared" | "personal">
  >({});
  const [savingId, setSavingId] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    setDraftNames((prev) => {
      const next = { ...prev };
      groups.forEach((group) => {
        if (!next[group.id]) {
          next[group.id] = group.name;
        }
      });
      return next;
    });
    setDraftVisibility((prev) => {
      const next = { ...prev };
      groups.forEach((group) => {
        if (!next[group.id]) {
          next[group.id] = group.visibility ?? "shared";
        }
      });
      return next;
    });
  }, [groups]);

  const handleAddGroup = async () => {
    if (!householdId || !user) {
      return;
    }
    const name = newGroupName.trim();
    if (!name) {
      setErrorMessage("탭 이름을 입력해주세요.");
      return;
    }
    setErrorMessage(null);
    setSavingId("new");
    try {
      await addAccountGroup(householdId, {
        name,
        order: groups.length + 1,
        visibility: newGroupVisibility,
        createdBy: user.uid,
      });
      setNewGroupName("");
      setNewGroupVisibility("shared");
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "저장 실패");
    } finally {
      setSavingId(null);
    }
  };

  const handleRename = async (groupId: string) => {
    if (!householdId) {
      return;
    }
    const name = (draftNames[groupId] ?? "").trim();
    if (!name) {
      setErrorMessage("탭 이름을 입력해주세요.");
      return;
    }
    const visibility = draftVisibility[groupId] ?? "shared";
    setErrorMessage(null);
    setSavingId(groupId);
    try {
      await updateAccountGroup(householdId, groupId, { name, visibility });
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "저장 실패");
    } finally {
      setSavingId(null);
    }
  };

  const handleDelete = async (groupId: string) => {
    if (!householdId || !user) {
      return;
    }
    const ok = window.confirm(
      "탭을 삭제하면 해당 계좌는 기본 탭으로 이동합니다. 계속할까요?"
    );
    if (!ok) {
      return;
    }
    setErrorMessage(null);
    setSavingId(groupId);
    try {
      await deleteAccountGroup(householdId, groupId);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "삭제 실패");
    } finally {
      setSavingId(null);
    }
  };

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Link
            href="/assets"
            className="flex h-9 w-9 items-center justify-center rounded-full border border-[var(--border)]"
            aria-label="뒤로"
          >
            ←
          </Link>
          <div>
            <h1 className="text-lg font-semibold">자산 탭 관리</h1>
            <p className="text-xs text-[color:rgba(45,38,34,0.6)]">
              탭 이름을 추가하거나 수정하세요.
            </p>
          </div>
        </div>
      </div>

      <section className="rounded-3xl border border-[var(--border)] bg-white p-5">
        <h2 className="text-sm font-semibold">새 탭 추가</h2>
        <div className="mt-3 flex gap-2">
          <input
            value={newGroupName}
            onChange={(event) => setNewGroupName(event.target.value)}
            className="flex-1 rounded-xl border border-[var(--border)] px-3 py-2 text-sm"
            placeholder="예: 가족, 개인, 투자"
          />
          <button
            type="button"
            onClick={handleAddGroup}
            disabled={savingId === "new"}
            className="rounded-full bg-[var(--text)] px-4 py-2 text-sm text-white"
          >
            {savingId === "new" ? "저장 중" : "추가"}
          </button>
        </div>
        <div className="mt-3 flex gap-2 text-xs">
          {(["shared", "personal"] as const).map((value) => (
            <button
              key={value}
              type="button"
              className={`rounded-full border px-3 py-1 ${
                newGroupVisibility === value
                  ? "border-[var(--text)] bg-[color:rgba(45,38,34,0.06)] font-semibold"
                  : "border-[var(--border)] text-[color:rgba(45,38,34,0.6)]"
              }`}
              onClick={() => setNewGroupVisibility(value)}
            >
              {value === "shared" ? "부부 공유" : "나만"}
            </button>
          ))}
        </div>
      </section>

      <section className="rounded-3xl border border-[var(--border)] bg-white p-5">
        <h2 className="text-sm font-semibold">탭 이름 수정</h2>
        {loading ? (
          <p className="mt-3 text-sm text-[color:rgba(45,38,34,0.6)]">
            불러오는 중...
          </p>
        ) : groups.length === 0 ? (
          <p className="mt-3 text-sm text-[color:rgba(45,38,34,0.6)]">
            등록된 탭이 없습니다.
          </p>
        ) : (
          <div className="mt-4 space-y-3">
            {groups.map((group) => (
              <div
                key={group.id}
                className="flex flex-col gap-2 rounded-2xl border border-[var(--border)] bg-white px-3 py-2"
              >
                <div className="flex items-center gap-2">
                  <input
                    value={draftNames[group.id] ?? group.name}
                    onChange={(event) =>
                      setDraftNames((prev) => ({
                        ...prev,
                        [group.id]: event.target.value,
                      }))
                    }
                    className="flex-1 rounded-xl border border-[var(--border)] px-3 py-2 text-sm"
                  />
                  <button
                    type="button"
                    onClick={() => handleRename(group.id)}
                    disabled={savingId === group.id}
                    className="rounded-full border border-[var(--border)] px-4 py-2 text-sm"
                  >
                    {savingId === group.id ? "저장 중" : "저장"}
                  </button>
                  {group.createdBy === user?.uid ? (
                    <button
                      type="button"
                      onClick={() => handleDelete(group.id)}
                      disabled={savingId === group.id}
                      className="rounded-full border border-[var(--border)] px-4 py-2 text-sm text-red-500"
                    >
                      삭제
                    </button>
                  ) : null}
                </div>
                <div className="flex gap-2 text-xs">
                  {(["shared", "personal"] as const).map((value) => (
                    <button
                      key={value}
                      type="button"
                      className={`rounded-full border px-3 py-1 ${
                        (draftVisibility[group.id] ?? "shared") === value
                          ? "border-[var(--text)] bg-[color:rgba(45,38,34,0.06)] font-semibold"
                          : "border-[var(--border)] text-[color:rgba(45,38,34,0.6)]"
                      }`}
                      onClick={() =>
                        setDraftVisibility((prev) => ({
                          ...prev,
                          [group.id]: value,
                        }))
                      }
                    >
                      {value === "shared" ? "부부 공유" : "나만"}
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      {errorMessage ? (
        <p className="text-sm text-red-500">{errorMessage}</p>
      ) : null}
    </div>
  );
}
