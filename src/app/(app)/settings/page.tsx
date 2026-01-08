"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Timestamp,
  collection,
  doc,
  getCountFromServer,
  getDoc,
  getDocs,
  query,
  updateDoc,
  where,
} from "firebase/firestore";
import { useAuth } from "@/components/auth-provider";
import { useHousehold } from "@/components/household-provider";
import { useCategories } from "@/hooks/use-categories";
import { useSubjects } from "@/hooks/use-subjects";
import { usePaymentMethods } from "@/hooks/use-payment-methods";
import { addCategory } from "@/lib/categories";
import { signOutUser } from "@/lib/firebase/auth";
import { db } from "@/lib/firebase/client";
import {
  budgetsCol,
  categoriesCol,
  householdDoc,
  invitesCol,
  membersCol,
  paymentMethodsCol,
  subjectsCol,
  transactionsCol,
} from "@/lib/firebase/firestore";
import { updateUserDisplayName } from "@/lib/firebase/user";
import { createInvite, resetHouseholdData } from "@/lib/household";
import { addPaymentMethod } from "@/lib/payment-methods";
import { addTransaction, updateTransactionsSubjectName } from "@/lib/transactions";
import { addSubject, updateSubject } from "@/lib/subjects";

type InviteSnapshot = {
  code: string;
  expiresAt: Timestamp;
  createdAt?: Timestamp | null;
};

type ToastLevel = "success" | "error" | "info";

function parseDate(raw: string) {
  const normalized = raw.trim().replace(/\./g, "-").replace(/\//g, "-");
  const koMatch = normalized.match(
    /^(\d{4})\s*년\s*(\d{1,2})\s*월\s*(\d{1,2})\s*일$/
  );
  if (koMatch) {
    const [, yearText, monthText, dayText] = koMatch;
    return new Date(Number(yearText), Number(monthText) - 1, Number(dayText));
  }
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

function normalizeText(value: string) {
  return value.trim().replace(/\s+/g, " ");
}

function mapPayment(value: string) {
  const normalized = normalizeText(value);
  if (!normalized) {
    return "기타";
  }
  if (normalized === "현금") {
    return "현금";
  }
  if (normalized === "체크" || normalized === "체크카드") {
    return "체크카드";
  }
  if (normalized === "신용" || normalized === "신용카드") {
    return "신용카드";
  }
  if (normalized === "대출") {
    return "대출";
  }
  if (
    normalized === "은행" ||
    normalized === "계좌이체" ||
    normalized === "이체"
  ) {
    return "은행";
  }
  return normalized;
}

type CsvImportSectionProps = {
  householdId: string | null;
  user: { uid: string } | null;
  nickname: string;
  partnerNickname: string;
  spouseRole: "husband" | "wife" | null;
  subjects: { id: string; name: string; order: number }[];
  onToast: (message: string, level?: ToastLevel) => void;
};

function CsvImportSection({
  householdId,
  user,
  nickname,
  partnerNickname,
  spouseRole,
  subjects,
  onToast,
}: CsvImportSectionProps) {
  const { categories } = useCategories(householdId);
  const { paymentMethods } = usePaymentMethods(householdId);
  const [importStatus, setImportStatus] = useState<string | null>(null);
  const [importTotal, setImportTotal] = useState(0);
  const [importProcessed, setImportProcessed] = useState(0);
  const [importLogs, setImportLogs] = useState<string[]>([]);

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
      paymentMethods.map((method) => [
        `${method.owner ?? "our"}:${method.name.trim()}`,
        method.id,
      ])
    );
  }, [paymentMethods]);
  const nextPaymentOrder = useMemo(() => {
    const ours = paymentMethods.filter(
      (method) => (method.owner ?? "our") === "our" && !method.parentId
    );
    return ours.length + 1;
  }, [paymentMethods]);

  function resolveSubjectName(rawValue: string, recorderValue: string) {
    const cleaned = normalizeText(rawValue);
    const recorder = normalizeText(recorderValue);
    if (!cleaned) {
      return "우리";
    }
    const cleanedMy = normalizeText(nickname);
    const cleanedPartner = normalizeText(partnerNickname);
    if (cleanedPartner && recorder === cleanedPartner) {
      return cleanedPartner;
    }
    if (spouseRole === "husband" && cleaned === "남편") {
      return cleanedMy || "남편";
    }
    if (spouseRole === "wife" && cleaned === "아내") {
      return cleanedMy || "아내";
    }
    return cleaned;
  }

  async function handleCsvImport(file: File | null) {
    if (!file || !householdId || !user) {
      return;
    }
    setImportStatus(null);
    setImportTotal(0);
    setImportProcessed(0);
    setImportLogs([]);
    const text = await file.text();
    const rows = text
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean);
    if (rows.length <= 1) {
      setImportStatus("CSV 내용이 비어 있습니다.");
      onToast("CSV 내용이 비어 있습니다.", "error");
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
    const logs: string[] = [];
    for (const row of dataRows) {
      const cols = row.split(",").map((col) => col.trim());
      if (cols.length < 8) {
        failed += 1;
        logs.push(`행 ${processed + 1}: 컬럼 수 부족 (${cols.length})`);
        processed += 1;
        setImportProcessed(processed);
        continue;
      }
      const dateRaw = cols[0];
      const typeRaw = cols[1];
      const nicknameRaw = cols[2];
      const subjectRaw = cols[3];
      const categoryRaw = cols[4];
      const paymentRaw = cols[5];
      const amountRaw = cols[cols.length - 1];
      const noteRaw = cols.slice(6, -1).join(",").trim();
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

      const subjectName = resolveSubjectName(subjectRaw, nicknameRaw);
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
      const paymentOwner = "our";
      const paymentKey = `${paymentOwner}:${paymentMethod}`;
      if (!paymentMap.has(paymentKey)) {
        await addPaymentMethod(householdId, {
          name: paymentMethod,
          order: nextPaymentOrder + paymentAdded,
          owner: paymentOwner,
          parentId: null,
          imported: true,
        });
        paymentMap.set(paymentKey, paymentMethod);
        paymentAdded += 1;
      }

      const amount = Number(amountRaw.replace(/,/g, ""));
      const date = parseDate(dateRaw);
      if (Number.isNaN(amount)) {
        failed += 1;
        logs.push(`행 ${processed + 1}: 금액 파싱 실패 (${amountRaw})`);
        processed += 1;
        setImportProcessed(processed);
        continue;
      }
      if (Number.isNaN(date.getTime())) {
        failed += 1;
        logs.push(`행 ${processed + 1}: 날짜 파싱 실패 (${dateRaw})`);
        processed += 1;
        setImportProcessed(processed);
        continue;
      }
      const memo = normalizeText(noteRaw);
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
        const message =
          err instanceof Error ? err.message : "알 수 없는 오류";
        logs.push(`행 ${processed + 1}: 저장 실패 (${message})`);
      } finally {
        processed += 1;
        setImportProcessed(processed);
      }
    }
    if (logs.length > 0) {
      setImportLogs(logs.slice(0, 20));
    }
    setImportStatus(`가져오기 완료: 성공 ${success}, 실패 ${failed}`);
    onToast(
      `CSV 가져오기 완료 (성공 ${success}, 실패 ${failed})`,
      failed > 0 ? "error" : "success"
    );
  }

  const importPercent =
    importTotal > 0 ? Math.round((importProcessed / importTotal) * 100) : 0;

  return (
    <>
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
      {importLogs.length > 0 ? (
        <div className="mt-2 rounded-xl border border-[var(--border)] bg-white p-3 text-xs text-[color:rgba(45,38,34,0.7)]">
          <p className="font-medium">가져오기 로그</p>
          <ul className="mt-2 space-y-1">
            {importLogs.map((log, index) => (
              <li key={`${log}-${index}`}>{log}</li>
            ))}
          </ul>
        </div>
      ) : null}
    </>
  );
}
export default function SettingsPage() {
  const { user } = useAuth();
  const { householdId, displayName, spouseRole } = useHousehold();
  const { subjects } = useSubjects(householdId);
  const [nickname, setNickname] = useState(displayName ?? "");
  const [partnerNickname, setPartnerNickname] = useState("");
  const [isOwner, setIsOwner] = useState<boolean | null>(null);
  const [inviteCode, setInviteCode] = useState<string | null>(null);
  const [inviteExpiresAt, setInviteExpiresAt] = useState<{
    toMillis: () => number;
  } | null>(null);
  const lastInviteExpiredCodeRef = useRef<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [savingName, setSavingName] = useState(false);
  const [nameStatus, setNameStatus] = useState<string | null>(null);
  const [savingPartner, setSavingPartner] = useState(false);
  const [partnerStatus, setPartnerStatus] = useState<string | null>(null);
  const [csvOpen, setCsvOpen] = useState(false);
  const [resetOpen, setResetOpen] = useState(false);
  const [resetLoading, setResetLoading] = useState(false);
  const [resetStatus, setResetStatus] = useState<string | null>(null);
  const [resetErrorDetail, setResetErrorDetail] = useState<string | null>(null);
  const [resetCounts, setResetCounts] = useState<Record<string, number | null>>({
    transactions: null,
    memos: null,
    categories: null,
    subjects: null,
    paymentMethods: null,
    budgets: null,
    invites: null,
    members: null,
  });
  const [resetCountsLoading, setResetCountsLoading] = useState(false);
  const [resetOptions, setResetOptions] = useState({
    transactions: false,
    memos: false,
    categories: false,
    subjects: false,
    paymentMethods: false,
    budgets: false,
    invites: false,
    members: false,
    household: false,
  });
  const [nowTick, setNowTick] = useState(Date.now());
  const [toast, setToast] = useState<{ message: string; level: ToastLevel } | null>(
    null
  );
  const toastTimerRef = useRef<number | null>(null);
  const showToast = useCallback((message: string, level: ToastLevel = "info") => {
    if (toastTimerRef.current) {
      window.clearTimeout(toastTimerRef.current);
    }
    setToast({ message, level });
    toastTimerRef.current = window.setTimeout(() => {
      setToast(null);
      toastTimerRef.current = null;
    }, 3000);
  }, []);

  useEffect(() => {
    return () => {
      if (toastTimerRef.current) {
        window.clearTimeout(toastTimerRef.current);
      }
    };
  }, []);

  useEffect(() => {
    if (!resetOpen || !householdId) {
      return;
    }
    let active = true;
    setResetCountsLoading(true);
    const fetchCounts = async () => {
      try {
        const [
          transactionsSnap,
          memosSnap,
          categoriesSnap,
          subjectsSnap,
          paymentMethodsSnap,
          budgetsSnap,
          invitesSnap,
          membersSnap,
        ] = await Promise.all([
          getCountFromServer(transactionsCol(householdId)),
          getCountFromServer(collection(db, "households", householdId, "memos")),
          getCountFromServer(categoriesCol(householdId)),
          getCountFromServer(subjectsCol(householdId)),
          getCountFromServer(paymentMethodsCol(householdId)),
          getCountFromServer(budgetsCol(householdId)),
          getCountFromServer(invitesCol(householdId)),
          getCountFromServer(membersCol(householdId)),
        ]);
        if (!active) {
          return;
        }
        setResetCounts({
          transactions: transactionsSnap.data().count,
          memos: memosSnap.data().count,
          categories: categoriesSnap.data().count,
          subjects: subjectsSnap.data().count,
          paymentMethods: paymentMethodsSnap.data().count,
          budgets: budgetsSnap.data().count,
          invites: invitesSnap.data().count,
          members: membersSnap.data().count,
        });
      } catch {
        if (!active) {
          return;
        }
        setResetCounts({
          transactions: null,
          memos: null,
          categories: null,
          subjects: null,
          paymentMethods: null,
          budgets: null,
          invites: null,
          members: null,
        });
      } finally {
        if (active) {
          setResetCountsLoading(false);
        }
      }
    };
    fetchCounts();
    return () => {
      active = false;
    };
  }, [resetOpen, householdId]);

  useEffect(() => {
    if (!householdId) {
      setPartnerNickname("");
      setIsOwner(null);
      return;
    }
    const load = async () => {
      try {
        const [householdSnap, memberSnap] = await Promise.all([
          getDoc(householdDoc(householdId)),
          user ? getDoc(doc(membersCol(householdId), user.uid)) : null,
        ]);
        if (householdSnap?.exists()) {
          const data = householdSnap.data() as {
            creatorDisplayName?: string | null;
            partnerDisplayName?: string | null;
          };
          const creatorName = data.creatorDisplayName ?? "";
          const partnerName = data.partnerDisplayName ?? "";
          const currentName = (displayName ?? "").trim();
          if (currentName && creatorName && currentName === creatorName) {
            setPartnerNickname(partnerName);
          } else if (currentName && partnerName && currentName === partnerName) {
            setPartnerNickname(creatorName);
          } else {
            setPartnerNickname(partnerName);
          }
        }
        if (memberSnap?.exists()) {
          const memberData = memberSnap.data() as { role?: string };
          setIsOwner(memberData.role === "owner");
        }
      } catch {
        setPartnerNickname("");
        setIsOwner(null);
      }
    };
    load();
  }, [displayName, householdId, user]);

  useEffect(() => {
    if (!householdId) {
      setInviteCode(null);
      setInviteExpiresAt(null);
      return;
    }
    const loadInvite = async () => {
      try {
        const snapshot = await getDocs(
          query(invitesCol(householdId), where("usedBy", "==", null))
        );
        if (snapshot.empty) {
          setInviteCode(null);
          setInviteExpiresAt(null);
          return;
        }
        const now = Date.now();
        const latest = snapshot.docs.reduce<InviteSnapshot | null>(
          (acc, docSnap) => {
            const data = docSnap.data() as InviteSnapshot;
            if (data.expiresAt.toMillis() <= now) {
              return acc;
            }
            if (!acc) {
              return data;
            }
            const current = data.createdAt?.toMillis?.() ?? 0;
            const prev = acc.createdAt?.toMillis?.() ?? 0;
            return current >= prev ? data : acc;
          },
          null
        );
        if (latest) {
          setInviteCode(latest.code);
          setInviteExpiresAt(latest.expiresAt);
        } else {
          setInviteCode(null);
          setInviteExpiresAt(null);
        }
      } catch {
        setInviteCode(null);
        setInviteExpiresAt(null);
      }
    };
    loadInvite();
  }, [householdId]);

  useEffect(() => {
    const timer = setInterval(() => {
      setNowTick(Date.now());
    }, 60 * 1000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    if (!householdId || !inviteCode || !inviteExpiresAt) {
      return;
    }
    if (inviteExpiresAt.toMillis() > nowTick) {
      return;
    }
    if (lastInviteExpiredCodeRef.current === inviteCode) {
      return;
    }
    lastInviteExpiredCodeRef.current = inviteCode;
    showToast(`초대 코드 ${inviteCode}가 만료되었습니다.`, "info");
  }, [householdId, inviteCode, inviteExpiresAt, nowTick, showToast]);

  async function handleInvite() {
    if (!user || !householdId) {
      return;
    }
    if (inviteCode && inviteExpiresAt) {
      if (inviteExpiresAt.toMillis() > Date.now()) {
        return;
      }
    }
    setLoading(true);
    setError(null);
    try {
      const invite = await createInvite(householdId, user.uid);
      setInviteCode(invite.code);
      setInviteExpiresAt(invite.expiresAt);
      showToast(`초대 코드 ${invite.code}를 생성했습니다.`, "success");
    } catch (err) {
      setError("초대 코드 생성에 실패했습니다.");
      showToast("초대 코드 생성에 실패했습니다.", "error");
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
      if (householdId && isOwner !== null) {
        await updateDoc(householdDoc(householdId), {
          ...(isOwner
            ? { creatorDisplayName: trimmed }
            : { partnerDisplayName: trimmed }),
        });
      }
      await syncSubjectDefaults(trimmed, partnerNickname.trim());
      setNameStatus("저장 완료");
      showToast("닉네임을 변경했습니다.", "success");
    } catch (err) {
      setNameStatus("저장 실패");
      showToast("닉네임 저장에 실패했습니다.", "error");
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
      if (isOwner !== null) {
        await updateDoc(householdDoc(householdId), {
          ...(isOwner
            ? { partnerDisplayName: partnerNickname.trim() }
            : { creatorDisplayName: partnerNickname.trim() }),
        });
      }
      await syncSubjectDefaults(nickname.trim(), partnerNickname.trim());
      setPartnerStatus("저장 완료");
      showToast("상대방 닉네임을 변경했습니다.", "success");
    } catch (err) {
      setPartnerStatus("저장 실패");
      showToast("상대방 닉네임 저장에 실패했습니다.", "error");
    } finally {
      setSavingPartner(false);
    }
  }

  function buildSubjectDefaults(myName: string, partnerName: string) {
    const cleanedMy = myName.trim();
    const cleanedPartner = partnerName.trim();
    const isWife = spouseRole === "wife";
    const husbandName = isWife
      ? cleanedPartner || "남편"
      : cleanedMy || "남편";
    const wifeName = isWife ? cleanedMy || "아내" : cleanedPartner || "아내";
    return [
      husbandName,
      wifeName,
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
          if (existing.name !== targetName) {
            await updateTransactionsSubjectName(
              householdId,
              existing.name,
              targetName
            );
          }
        }
      } else {
        await addSubject(householdId, { name: targetName, order });
      }
    }
  }

  function toggleResetOption(key: keyof typeof resetOptions) {
    setResetOptions((prev) => {
      if (key === "household") {
        if (prev.household) {
          return { ...prev, household: false };
        }
        return {
          transactions: true,
          memos: true,
          categories: true,
          subjects: true,
          paymentMethods: true,
          budgets: true,
          invites: true,
          members: true,
          household: true,
        };
      }
      if (prev.household) {
        return prev;
      }
      return { ...prev, [key]: !prev[key] };
    });
  }

  function selectAllResetOptions() {
    setResetOptions({
      transactions: true,
      memos: true,
      categories: true,
      subjects: true,
      paymentMethods: true,
      budgets: true,
      invites: true,
      members: true,
      household: false,
    });
  }

  async function handleResetConfirm() {
    if (!householdId) {
      return;
    }
    setResetLoading(true);
    setResetStatus(null);
    setResetErrorDetail(null);
    try {
      await resetHouseholdData(householdId, resetOptions);
      setResetStatus("데이터 초기화 완료");
      showToast(
        resetOptions.household
          ? "전체 가계부 데이터를 삭제했습니다."
          : "선택한 항목을 초기화했습니다.",
        "success"
      );
      setResetOpen(false);
    } catch (err) {
      setResetStatus("데이터 초기화 실패");
      const detail =
        err instanceof Error
          ? err.message
          : typeof err === "string"
          ? err
          : "알 수 없는 오류";
      setResetErrorDetail(detail);
      showToast(`데이터 초기화 중 오류가 발생했습니다. (${detail})`, "error");
    } finally {
      setResetLoading(false);
    }
  }



  return (
    <div className="flex flex-col gap-6">
      <section className="rounded-3xl border border-[var(--border)] bg-white p-6">
        <div className="mb-4 rounded-2xl border border-[var(--border)] px-4 py-3">
          <p className="text-xs text-[color:rgba(45,38,34,0.6)]">
            내 아이디: {user?.email ?? "-"}
          </p>
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
            {inviteExpiresAt ? (
              <p className="mt-2 text-xs text-[color:rgba(45,38,34,0.6)]">
                남은 시간:{" "}
                {Math.max(
                  0,
                  Math.ceil((inviteExpiresAt.toMillis() - nowTick) / 60000)
                )}{" "}
                분
              </p>
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
        <div className="flex items-center justify-between gap-4">
          <div>
            <h2 className="text-sm font-semibold">CSV 가져오기</h2>
            <p className="mt-2 text-xs text-[color:rgba(45,38,34,0.7)]">
              날짜, 입금/지출, 입력자, 주체, 카테고리, 지불 방식, 메모, 금액
              순서로 된 CSV 파일을 업로드하세요.
            </p>
          </div>
          <button
            className="rounded-full border border-[var(--border)] px-4 py-2 text-xs"
            onClick={() => setCsvOpen((prev) => !prev)}
          >
            {csvOpen ? "접기" : "펼치기"}
          </button>
        </div>
        {csvOpen ? (
          <div className="mt-4">
            <CsvImportSection
              householdId={householdId}
              user={user}
              nickname={nickname}
              partnerNickname={partnerNickname}
              spouseRole={spouseRole}
              subjects={subjects}
              onToast={showToast}
            />
          </div>
        ) : null}
      </section>
      <section className="rounded-3xl border border-[var(--border)] bg-white p-6">
        <h2 className="text-sm font-semibold">카테고리 편집</h2>
        <p className="mt-2 text-xs text-[color:rgba(45,38,34,0.7)]">
          수입/지출/이체/주체/결제수단을 편집합니다.
        </p>
        <a
          className="mt-4 inline-flex items-center rounded-full border border-[var(--border)] px-4 py-2 text-sm"
          href="/categories"
        >
          카테고리 편집 열기
        </a>
      </section>
      <section className="rounded-3xl border border-[var(--border)] bg-white p-6">
        <h2 className="text-sm font-semibold">데이터 초기화</h2>
        <p className="mt-2 text-xs text-[color:rgba(45,38,34,0.7)]">
          선택한 항목만 초기화하거나 전체 가계부 삭제를 진행할 수 있습니다.
        </p>
        <button
          className="mt-4 rounded-full border border-[var(--border)] px-4 py-2 text-sm"
          onClick={() => setResetOpen(true)}
        >
          초기화 옵션 선택
        </button>
        {resetStatus ? (
          <p className="mt-2 text-xs text-[color:rgba(45,38,34,0.7)]">
            {resetStatus}
          </p>
        ) : null}
        {resetErrorDetail ? (
          <p className="mt-1 text-xs text-red-600">{resetErrorDetail}</p>
        ) : null}
      </section>
      {resetOpen ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="w-full max-w-md rounded-2xl border border-[var(--border)] bg-white p-6">
            <h2 className="text-base font-semibold">초기화 옵션</h2>
            <p className="mt-2 text-xs text-[color:rgba(45,38,34,0.6)]">
              전체 가계부 삭제를 선택하면 모든 데이터가 삭제됩니다.
            </p>
            <div className="mt-4 space-y-2 text-sm">
              {[
                { key: "transactions", label: "거래 내역" },
                { key: "memos", label: "메모" },
                { key: "categories", label: "카테고리" },
                { key: "subjects", label: "주체" },
                { key: "paymentMethods", label: "결제수단" },
                { key: "budgets", label: "예산" },
                { key: "invites", label: "초대 코드" },
                { key: "members", label: "구성원" },
              ].map((item) => {
                const count =
                  resetCounts[item.key as keyof typeof resetCounts] ?? null;
                const countLabel = resetCountsLoading
                  ? "조회 중..."
                  : count === null
                    ? "-"
                    : `${count}건`;
                return (
                  <label
                    key={item.key}
                    className="flex items-center justify-between gap-2"
                  >
                    <span className="flex items-center gap-2">
                      <input
                        type="checkbox"
                        checked={
                          resetOptions[item.key as keyof typeof resetOptions]
                        }
                        onChange={() =>
                          toggleResetOption(
                            item.key as keyof typeof resetOptions
                          )
                        }
                        disabled={resetOptions.household}
                      />
                      <span>{item.label}</span>
                    </span>
                    <span className="text-xs text-[color:rgba(45,38,34,0.6)]">
                      {countLabel}
                    </span>
                  </label>
                );
              })}
              <label className="mt-2 flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={resetOptions.household}
                  onChange={() => toggleResetOption("household")}
                />
                <span className="text-red-600">전체 가계부 삭제</span>
              </label>
            </div>
            <div className="mt-4 flex flex-wrap gap-2">
              <button
                className="rounded-full border border-[var(--border)] px-4 py-2 text-sm"
                onClick={selectAllResetOptions}
                disabled={resetOptions.household}
              >
                모두 선택
              </button>
              <button
                className="rounded-full border border-[var(--border)] px-4 py-2 text-sm"
                onClick={() => setResetOpen(false)}
              >
                취소
              </button>
              <button
                className="rounded-full bg-red-600 px-4 py-2 text-sm text-white disabled:opacity-70"
                onClick={handleResetConfirm}
                disabled={
                  resetLoading ||
                  Object.values(resetOptions).every((value) => !value)
                }
              >
                {resetLoading ? "처리 중..." : "삭제 실행"}
              </button>
            </div>
          </div>
        </div>
      ) : null}
      {toast ? (
        <div className="fixed bottom-6 left-1/2 z-50 w-[min(360px,90vw)] -translate-x-1/2 rounded-full px-4 py-2 text-center text-sm text-white shadow-lg">
          <span
            className={`block rounded-full px-4 py-2 ${
              toast.level === "error"
                ? "bg-red-600"
                : toast.level === "success"
                  ? "bg-emerald-600"
                  : "bg-[var(--text)]"
            }`}
          >
            {toast.message}
          </span>
        </div>
      ) : null}
    </div>
  );
}
