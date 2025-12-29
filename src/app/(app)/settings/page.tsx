"use client";

import { useEffect, useMemo, useState } from "react";
import { getDoc, updateDoc } from "firebase/firestore";
import { useAuth } from "@/components/auth-provider";
import { useHousehold } from "@/components/household-provider";
import { useCategories } from "@/hooks/use-categories";
import { usePaymentMethods } from "@/hooks/use-payment-methods";
import { useSubjects } from "@/hooks/use-subjects";
import { addCategory } from "@/lib/categories";
import { signOutUser } from "@/lib/firebase/auth";
import { householdDoc } from "@/lib/firebase/firestore";
import { updateUserDisplayName } from "@/lib/firebase/user";
import { createInvite } from "@/lib/household";
import { addPaymentMethod } from "@/lib/payment-methods";
import { addTransaction } from "@/lib/transactions";
import { addSubject, updateSubject } from "@/lib/subjects";

export default function SettingsPage() {
  const { user } = useAuth();
  const { householdId, displayName } = useHousehold();
  const { categories } = useCategories(householdId);
  const { subjects } = useSubjects(householdId);
  const { paymentMethods } = usePaymentMethods(householdId);
  const [nickname, setNickname] = useState(displayName ?? "");
  const [partnerNickname, setPartnerNickname] = useState("");
  const [inviteCode, setInviteCode] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [savingName, setSavingName] = useState(false);
  const [nameStatus, setNameStatus] = useState<string | null>(null);
  const [savingPartner, setSavingPartner] = useState(false);
  const [partnerStatus, setPartnerStatus] = useState<string | null>(null);
  const [importStatus, setImportStatus] = useState<string | null>(null);
  const [importTotal, setImportTotal] = useState(0);
  const [importProcessed, setImportProcessed] = useState(0);

  const categoryMap = useMemo(() => {
    return new Map(
      categories.map((category) => [category.name.trim(), category.id])
    );
  }, [categories]);
  const nextCategoryOrder = useMemo(
    () => categories.length + 1,
    [categories.length]
  );

  const subjectMap = useMemo(() => {
    return new Map(subjects.map((subject) => [subject.name.trim(), subject.id]));
  }, [subjects]);
  const nextSubjectOrder = useMemo(
    () => subjects.length + 1,
    [subjects.length]
  );

  const paymentMap = useMemo(() => {
    return new Map(
      paymentMethods.map((method) => [method.name.trim(), method.id])
    );
  }, [paymentMethods]);
  const nextPaymentOrder = useMemo(
    () => paymentMethods.length + 1,
    [paymentMethods.length]
  );

  useEffect(() => {
    if (!householdId) {
      setPartnerNickname("");
      return;
    }
    getDoc(householdDoc(householdId)).then((snapshot) => {
      if (!snapshot.exists()) {
        return;
      }
      const data = snapshot.data() as { partnerDisplayName?: string | null };
      setPartnerNickname(data.partnerDisplayName ?? "");
    });
  }, [householdId]);

  async function handleInvite() {
    if (!user || !householdId) {
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const invite = await createInvite(householdId, user.uid);
      setInviteCode(invite.code);
    } catch (err) {
      setError("초대 코드 생성에 실패했습니다.");
    } finally {
      setLoading(false);
    }
  }

  async function handleLogout() {
    await signOutUser();
  }

  async function handleNicknameSave() {
    if (!user) {
      return;
    }
    setSavingName(true);
    setNameStatus(null);
    try {
      const trimmed = nickname.trim();
      await updateUserDisplayName(user.uid, trimmed);
      await syncSubjectDefaults(trimmed, partnerNickname.trim());
      setNameStatus("저장 완료");
    } catch (err) {
      setNameStatus("저장 실패");
    } finally {
      setSavingName(false);
    }
  }

  async function handlePartnerSave() {
    if (!householdId) {
      return;
    }
    setSavingPartner(true);
    setPartnerStatus(null);
    try {
      await updateDoc(householdDoc(householdId), {
        partnerDisplayName: partnerNickname.trim(),
      });
      await syncSubjectDefaults(nickname.trim(), partnerNickname.trim());
      setPartnerStatus("저장 완료");
    } catch (err) {
      setPartnerStatus("저장 실패");
    } finally {
      setSavingPartner(false);
    }
  }

  function buildSubjectDefaults(myName: string, partnerName: string) {
    const cleanedMy = myName.trim();
    const cleanedPartner = partnerName.trim();
    const partnerFallback = cleanedMy === "남편" ? "아내" : "남편";
    return [
      cleanedMy || "남편",
      cleanedPartner || (cleanedMy ? partnerFallback : "아내"),
      "우리",
      "시댁",
      "처가댁",
      "아기",
    ];
  }

  async function syncSubjectDefaults(myName: string, partnerName: string) {
    if (!householdId) {
      return;
    }
    const desired = buildSubjectDefaults(myName, partnerName);
    const sorted = [...subjects].sort((a, b) => a.order - b.order);
    for (let idx = 0; idx < desired.length; idx += 1) {
      const targetName = desired[idx];
      const order = idx + 1;
      const existing = sorted.find((item) => item.order === order);
      if (existing) {
        if (existing.name !== targetName || existing.order !== order) {
          await updateSubject(householdId, existing.id, {
            name: targetName,
            order,
          });
        }
      } else {
        await addSubject(householdId, { name: targetName, order });
      }
    }
  }

  function parseDate(raw: string) {
    const normalized = raw.trim().replace(/\./g, "-").replace(/\//g, "-");
    const parts = normalized.split("-");
    if (parts.length >= 3) {
      const year = Number(parts[0]);
      const month = Number(parts[1]) - 1;
      const day = Number(parts[2]);
      return new Date(year, month, day);
    }
    return new Date(raw);
  }

  function mapType(value: string) {
    const normalized = value.trim();
    if (["입금", "수입", "income"].includes(normalized)) {
      return "income" as const;
    }
    if (["출금", "지출", "expense"].includes(normalized)) {
      return "expense" as const;
    }
    if (["이체", "transfer"].includes(normalized)) {
      return "transfer" as const;
    }
    return "expense" as const;
  }

  function mapPayment(value: string) {
    const normalized = value.trim();
    if (normalized.includes("현금")) {
      return "현금";
    }
    if (normalized.includes("체크")) {
      return "체크카드";
    }
    if (normalized.includes("신용")) {
      return "신용카드";
    }
    if (normalized.includes("대출")) {
      return "대출";
    }
    if (
      normalized.includes("은행") ||
      normalized.includes("계좌이체") ||
      normalized.includes("이체")
    ) {
      return "은행";
    }
    if (normalized.includes("카드")) {
      return "신용카드";
    }
    return normalized || "기타";
  }

  function normalizeText(value: string) {
    return value.trim().replace(/\s+/g, " ");
  }

  async function handleCsvImport(file: File | null) {
    if (!file || !householdId || !user) {
      return;
    }
    setImportStatus(null);
    setImportTotal(0);
    setImportProcessed(0);
    const text = await file.text();
    const rows = text
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean);
    if (rows.length <= 1) {
      setImportStatus("CSV 내용이 비어 있습니다.");
      return;
    }
    const dataRows = rows.slice(1);
    setImportTotal(dataRows.length);
    let success = 0;
    let failed = 0;
    let processed = 0;
    let categoryAdded = 0;
    let subjectAdded = 0;
    let paymentAdded = 0;
    for (const row of dataRows) {
      const cols = row.split(",").map((col) => col.trim());
      if (cols.length < 8) {
        failed += 1;
        processed += 1;
        setImportProcessed(processed);
        continue;
      }
      const [
        dateRaw,
        typeRaw,
        nicknameRaw,
        subjectRaw,
        categoryRaw,
        paymentRaw,
        noteRaw,
        amountRaw,
      ] = cols;
      const categoryText = normalizeText(categoryRaw) || "기타";
      const type = mapType(typeRaw);
      let categoryId = categoryMap.get(categoryText);
      if (!categoryId) {
        const newCategory = await addCategory(householdId, {
          name: categoryText,
          type,
          order: nextCategoryOrder + categoryAdded,
          parentId: null,
          imported: true,
        });
        categoryId = newCategory.id;
        categoryMap.set(categoryText, categoryId);
        categoryAdded += 1;
      }

      const subjectName = normalizeText(subjectRaw) || "우리";
      if (!subjectMap.has(subjectName)) {
        await addSubject(householdId, {
          name: subjectName,
          order: nextSubjectOrder + subjectAdded,
          imported: true,
        });
        subjectMap.set(subjectName, subjectName);
        subjectAdded += 1;
      }

      const paymentMethod = mapPayment(paymentRaw);
      if (!paymentMap.has(paymentMethod)) {
        await addPaymentMethod(householdId, {
          name: paymentMethod,
          order: nextPaymentOrder + paymentAdded,
          imported: true,
        });
        paymentMap.set(paymentMethod, paymentMethod);
        paymentAdded += 1;
      }

      const amount = Number(amountRaw.replace(/,/g, ""));
      const date = parseDate(dateRaw);
      const memoParts = [normalizeText(noteRaw)];
      const nicknameText = normalizeText(nicknameRaw);
      if (nicknameText) {
        memoParts.unshift(`입력자:${nicknameText}`);
      }
      const memo = memoParts.filter(Boolean).join(" ");
      try {
        await addTransaction({
          householdId,
          type,
          amount,
          categoryId,
          paymentMethod,
          subject: subjectName,
          date,
          note: memo || undefined,
          createdBy: user.uid,
        });
        success += 1;
      } catch (err) {
        failed += 1;
      } finally {
        processed += 1;
        setImportProcessed(processed);
      }
    }
    setImportStatus(`가져오기 완료: 성공 ${success}, 실패 ${failed}`);
  }

  const importPercent =
    importTotal > 0 ? Math.round((importProcessed / importTotal) * 100) : 0;

  return (
    <div className="flex flex-col gap-6">
      <section className="rounded-3xl border border-[var(--border)] bg-white p-6">
        <div className="mb-4 rounded-2xl border border-[var(--border)] px-4 py-3">
          <label className="text-xs text-[color:rgba(45,38,34,0.7)]">
            내 닉네임
          </label>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <input
              className="flex-1 rounded-xl border border-[var(--border)] px-3 py-2 text-sm"
              value={nickname}
              onChange={(event) => setNickname(event.target.value)}
              placeholder="닉네임 입력"
            />
            <button
              className="rounded-full bg-[var(--accent)] px-4 py-2 text-sm text-white disabled:opacity-70"
              onClick={handleNicknameSave}
              disabled={savingName || !nickname.trim()}
            >
              {savingName ? "저장 중.." : "저장"}
            </button>
          </div>
          {nameStatus ? (
            <p className="mt-2 text-xs text-[color:rgba(45,38,34,0.7)]">
              {nameStatus}
            </p>
          ) : null}
        </div>
        <div className="mb-4 rounded-2xl border border-[var(--border)] px-4 py-3">
          <label className="text-xs text-[color:rgba(45,38,34,0.7)]">
            상대방 닉네임
          </label>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <input
              className="flex-1 rounded-xl border border-[var(--border)] px-3 py-2 text-sm"
              value={partnerNickname}
              onChange={(event) => setPartnerNickname(event.target.value)}
              placeholder="상대방 닉네임 입력"
            />
            <button
              className="rounded-full bg-[var(--accent)] px-4 py-2 text-sm text-white disabled:opacity-70"
              onClick={handlePartnerSave}
              disabled={savingPartner}
            >
              {savingPartner ? "저장 중.." : "저장"}
            </button>
          </div>
          {partnerStatus ? (
            <p className="mt-2 text-xs text-[color:rgba(45,38,34,0.7)]">
              {partnerStatus}
            </p>
          ) : null}
        </div>
        <div className="grid gap-4 md:grid-cols-2">
          <div className="rounded-2xl border border-[var(--border)] p-4">
            <h2 className="text-sm font-semibold">초대 코드</h2>
            <p className="mt-2 text-sm text-[color:rgba(45,38,34,0.7)]">
              배우자에게 공유할 초대 코드를 생성하세요.
            </p>
            {inviteCode ? (
              <div className="mt-4 rounded-xl border border-dashed border-[var(--border)] px-4 py-3 text-center text-lg tracking-widest">
                {inviteCode}
              </div>
            ) : null}
            <button
              className="mt-4 rounded-full bg-[var(--accent)] px-4 py-2 text-sm text-white disabled:opacity-70"
              onClick={handleInvite}
              disabled={!user || !householdId || loading}
            >
              {loading ? "생성 중.." : "코드 생성"}
            </button>
            {error ? (
              <p className="mt-2 text-sm text-red-600">{error}</p>
            ) : null}
          </div>
          <div className="rounded-2xl border border-[var(--border)] p-4">
            <h2 className="text-sm font-semibold">로그아웃</h2>
            <p className="mt-2 text-sm text-[color:rgba(45,38,34,0.7)]">
              다른 계정으로 로그인할 수 있습니다.
            </p>
            <button
              className="mt-4 rounded-full border border-[var(--border)] px-4 py-2 text-sm"
              onClick={handleLogout}
            >
              로그아웃
            </button>
          </div>
        </div>
      </section>
      <section className="rounded-3xl border border-[var(--border)] bg-white p-6">
        <h2 className="text-sm font-semibold">CSV 가져오기</h2>
        <p className="mt-2 text-xs text-[color:rgba(45,38,34,0.7)]">
          날짜, 입금/지출, 입력자, 주체, 카테고리, 지불 방식, 메모, 금액
          순서로 된 CSV 파일을 업로드하세요.
        </p>
        <input
          className="mt-4 w-full text-sm"
          type="file"
          accept=".csv"
          onChange={(event) => handleCsvImport(event.target.files?.[0] ?? null)}
          disabled={!householdId || !user}
        />
        {importTotal > 0 ? (
          <p className="mt-2 text-xs text-[color:rgba(45,38,34,0.7)]">
            진행률 {importPercent}% ({importProcessed}/{importTotal})
          </p>
        ) : null}
        {importStatus ? (
          <p className="mt-2 text-xs text-[color:rgba(45,38,34,0.7)]">
            {importStatus}
          </p>
        ) : null}
      </section>
    </div>
  );
}
