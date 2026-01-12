"use client";

import { useEffect, useMemo, useState } from "react";
import {
  differenceInCalendarMonths,
  endOfMonth,
  format,
  parse,
  startOfMonth,
  subMonths,
} from "date-fns";
import { useAuth } from "@/components/auth-provider";
import { useHousehold } from "@/components/household-provider";
import { useAccounts } from "@/hooks/use-accounts";
import { useAccountHoldings } from "@/hooks/use-account-holdings";
import { useAccountTrades } from "@/hooks/use-account-trades";
import { useTransfersRange } from "@/hooks/use-transfers";
import {
  addAccount,
  addTransfer,
  deleteTransfer,
  deleteAccount,
  updateAccount,
  updateTransfer,
} from "@/lib/accounts";
import { addInvestmentTrade } from "@/lib/investments";
import { formatKrw } from "@/lib/format";
import { toMonthKey } from "@/lib/time";
import { useAccountGroups } from "@/hooks/use-account-groups";

const ACCOUNT_TYPES = [
  { value: "cash", label: "현금" },
  { value: "bank", label: "은행" },
  { value: "savings", label: "저축" },
  { value: "investment", label: "투자" },
  { value: "debt", label: "부채" },
] as const;

const SAVINGS_KINDS = [
  { value: "installment", label: "적금" },
  { value: "deposit", label: "예금" },
  { value: "cma", label: "CMA" },
  { value: "compound", label: "월복리" },
] as const;

const INTEREST_TYPES = [
  { value: "simple", label: "단리" },
  { value: "monthly_compound", label: "월복리" },
] as const;

const TAX_TYPES = [{ value: "standard", label: "일반과세(15.4%)" }] as const;

const CORE_TYPES = new Set(["cash", "bank", "savings"]);
const STORAGE_KEY = "couple-ledger.assets.includeExtended";
const DEFAULT_GROUP_ID = "default";

function normalizeNumberInput(value: string) {
  return value.replace(/[^\d]/g, "");
}

function formatNumberInput(value: string) {
  const cleaned = normalizeNumberInput(value);
  if (!cleaned) {
    return "";
  }
  return new Intl.NumberFormat("ko-KR").format(Number(cleaned));
}

function normalizeRateInput(value: string) {
  return value.replace(/[^\d.]/g, "");
}

function parseRate(value: string) {
  if (!value) {
    return null;
  }
  const parsed = Number(value);
  return Number.isNaN(parsed) ? null : parsed;
}

function parseLocalDate(value: string) {
  const parsed = parse(value, "yyyy-MM-dd", new Date());
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function calcSimpleInterest(principal: number, ratePercent: number, months: number) {
  const years = months / 12;
  return principal * (ratePercent / 100) * years;
}

function calcMonthlyCompoundInterest(
  principal: number,
  ratePercent: number,
  months: number
) {
  const monthlyRate = ratePercent / 100 / 12;
  if (monthlyRate === 0) {
    return 0;
  }
  return principal * (Math.pow(1 + monthlyRate, months) - 1);
}

export default function AssetsPage() {
  const { user } = useAuth();
  const { householdId } = useHousehold();
  const { accounts, loading } = useAccounts(householdId);
  const { groups: accountGroups } = useAccountGroups(householdId);
  const [includeExtended, setIncludeExtended] = useState(false);
  const [chartRangeMonths, setChartRangeMonths] = useState<6 | 12>(6);
  const [showAccountSheet, setShowAccountSheet] = useState(false);
  const [showTransferSheet, setShowTransferSheet] = useState(false);
  const [showTradeSheet, setShowTradeSheet] = useState(false);
  const [activeGroupId, setActiveGroupId] = useState<string | null>(null);
  const [selectedAccountId, setSelectedAccountId] = useState<string | null>(null);
  const [accountFilterMonths, setAccountFilterMonths] = useState<1 | 3 | 12>(3);
  const [editingTransferId, setEditingTransferId] = useState<string | null>(null);
  const [accountName, setAccountName] = useState("");
  const [accountType, setAccountType] = useState<typeof ACCOUNT_TYPES[number]["value"]>("bank");
  const [initialBalance, setInitialBalance] = useState("");
  const [savingsKind, setSavingsKind] = useState<typeof SAVINGS_KINDS[number]["value"]>("installment");
  const [interestType, setInterestType] = useState<typeof INTEREST_TYPES[number]["value"]>("simple");
  const [interestRate, setInterestRate] = useState("");
  const [monthlyDeposit, setMonthlyDeposit] = useState("");
  const [startDate, setStartDate] = useState("");
  const [maturityDate, setMaturityDate] = useState("");
  const [taxType, setTaxType] = useState<typeof TAX_TYPES[number]["value"]>("standard");
  const [transferFrom, setTransferFrom] = useState<string>("external");
  const [transferTo, setTransferTo] = useState<string>("external");
  const [transferAmount, setTransferAmount] = useState("");
  const [transferMemo, setTransferMemo] = useState("");
  const [transferDate, setTransferDate] = useState(() =>
    format(new Date(), "yyyy-MM-dd")
  );
  const [tradeType, setTradeType] = useState<"buy" | "sell">("buy");
  const [tradeAmount, setTradeAmount] = useState("");
  const [tradeDate, setTradeDate] = useState(() =>
    format(new Date(), "yyyy-MM-dd")
  );
  const [tradeMemo, setTradeMemo] = useState("");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const rangeStart = useMemo(
    () => startOfMonth(subMonths(new Date(), 11)),
    []
  );
  const rangeEnd = useMemo(() => endOfMonth(new Date()), []);
  const { transfers } = useTransfersRange(householdId, rangeStart, rangeEnd);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }
    const stored = window.localStorage.getItem(STORAGE_KEY);
    if (stored === "true") {
      setIncludeExtended(true);
    }
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }
    window.localStorage.setItem(STORAGE_KEY, String(includeExtended));
  }, [includeExtended]);

  useEffect(() => {
    if (typeof document === "undefined") {
      return;
    }
    const shouldLock =
      showAccountSheet ||
      showTransferSheet ||
      showTradeSheet ||
      !!selectedAccountId;
    document.body.style.overflow = shouldLock ? "hidden" : "";
    return () => {
      document.body.style.overflow = "";
    };
  }, [selectedAccountId, showAccountSheet, showTransferSheet, showTradeSheet]);

  const visibleAccountGroups = useMemo(() => {
    return accountGroups.filter(
      (group) =>
        (group.visibility ?? "shared") === "shared" ||
        (user && group.createdBy === user.uid)
    );
  }, [accountGroups, user]);

  const accountGroupsWithDefault = useMemo(() => {
    return [
      { id: DEFAULT_GROUP_ID, name: "자산" },
      ...visibleAccountGroups.map((group) => ({
        id: group.id,
        name: group.name,
      })),
    ];
  }, [visibleAccountGroups]);

  const effectiveGroupId = activeGroupId ?? DEFAULT_GROUP_ID;

  const visibleAccountGroupIdSet = useMemo(() => {
    return new Set(visibleAccountGroups.map((group) => group.id));
  }, [visibleAccountGroups]);

  const visibleAccounts = useMemo(() => {
    return accounts.filter((account) => {
      if (!includeExtended && !CORE_TYPES.has(account.type)) {
        return false;
      }
      if (effectiveGroupId === DEFAULT_GROUP_ID) {
        return !account.groupId;
      }
      if (account.groupId !== effectiveGroupId) {
        return false;
      }
      return visibleAccountGroupIdSet.has(effectiveGroupId);
    });
  }, [accounts, includeExtended, effectiveGroupId, visibleAccountGroupIdSet]);

  const accountMap = useMemo(() => {
    return new Map(accounts.map((account) => [account.id, account]));
  }, [accounts]);

  const visibleAccountIdSet = useMemo(() => {
    return new Set(visibleAccounts.map((account) => account.id));
  }, [visibleAccounts]);

  const filteredTransfers = useMemo(() => {
    return transfers.filter((transfer) =>
      transfer.accountIds.some((id) => visibleAccountIdSet.has(id))
    );
  }, [visibleAccountIdSet, transfers]);

  const currentMonthStart = useMemo(() => startOfMonth(new Date()), []);
  const currentMonthEnd = useMemo(() => endOfMonth(new Date()), []);

  const monthTransfers = useMemo(() => {
    return filteredTransfers.filter((transfer) => {
      const date = transfer.date.toDate();
      return date >= currentMonthStart && date <= currentMonthEnd;
    });
  }, [currentMonthEnd, currentMonthStart, filteredTransfers]);

  const summary = useMemo(() => {
    let increase = 0;
    let decrease = 0;
    monthTransfers.forEach((transfer) => {
      if (
        transfer.toAccountId &&
        visibleAccountIdSet.has(transfer.toAccountId)
      ) {
        increase += transfer.amount;
      }
      if (
        transfer.fromAccountId &&
        visibleAccountIdSet.has(transfer.fromAccountId)
      ) {
        decrease += transfer.amount;
      }
    });
    return { increase, decrease };
  }, [monthTransfers, visibleAccountIdSet]);

  const totalBalance = useMemo(() => {
    return visibleAccounts.reduce((sum, account) => sum + account.balance, 0);
  }, [visibleAccounts]);

  const recentTransfers = useMemo(() => {
    return monthTransfers.slice(0, 10);
  }, [monthTransfers]);

  const chartMonths = useMemo(() => {
    const months: Date[] = [];
    const base = startOfMonth(new Date());
    for (let i = chartRangeMonths - 1; i >= 0; i -= 1) {
      months.push(startOfMonth(subMonths(base, i)));
    }
    return months;
  }, [chartRangeMonths]);

  const monthlyNet = useMemo(() => {
    const map = new Map<string, number>();
    chartMonths.forEach((month) => map.set(toMonthKey(month), 0));
    filteredTransfers.forEach((transfer) => {
      const key = transfer.monthKey || toMonthKey(transfer.date.toDate());
      if (!map.has(key)) {
        return;
      }
      let delta = 0;
      if (transfer.toAccountId && visibleAccountIdSet.has(transfer.toAccountId)) {
        delta += transfer.amount;
      }
      if (
        transfer.fromAccountId &&
        visibleAccountIdSet.has(transfer.fromAccountId)
      ) {
        delta -= transfer.amount;
      }
      map.set(key, (map.get(key) ?? 0) + delta);
    });
    return chartMonths.map((month) => ({
      month,
      net: map.get(toMonthKey(month)) ?? 0,
    }));
  }, [chartMonths, filteredTransfers, visibleAccountIdSet]);

  const maxAbsNet = useMemo(() => {
    return (
      monthlyNet.reduce((max, item) => Math.max(max, Math.abs(item.net)), 0) ||
      1
    );
  }, [monthlyNet]);

  const selectedAccount = useMemo(() => {
    return selectedAccountId ? accountMap.get(selectedAccountId) ?? null : null;
  }, [accountMap, selectedAccountId]);

  const { trades: accountTrades, loading: tradesLoading } = useAccountTrades(
    householdId,
    selectedAccount && selectedAccount.type === "investment" ? selectedAccount.id : null
  );
  const { holdings: accountHoldings, loading: holdingsLoading } =
    useAccountHoldings(
      householdId,
      selectedAccount && selectedAccount.type === "investment"
        ? selectedAccount.id
        : null
    );

  const investmentAccounts = useMemo(() => {
    return visibleAccounts.filter((account) => account.type === "investment");
  }, [visibleAccounts]);

  const investmentAllocation = useMemo(() => {
    const total = investmentAccounts.reduce(
      (sum, account) => sum + account.balance,
      0
    );
    return investmentAccounts.map((account) => ({
      ...account,
      share: total > 0 ? Math.round((account.balance / total) * 100) : 0,
      total,
    }));
  }, [investmentAccounts]);

  const investmentSummary = useMemo(() => {
    if (!selectedAccount || selectedAccount.type !== "investment") {
      return null;
    }
    const invested = accountTrades.reduce((sum, trade) => {
      const delta = trade.type === "buy" ? trade.amount : -trade.amount;
      return sum + delta;
    }, 0);
    const profit = selectedAccount.balance - invested;
    const roi = invested > 0 ? Math.round((profit / invested) * 100) : 0;
    return { invested, profit, roi };
  }, [accountTrades, selectedAccount]);

  const accountFilterStart = useMemo(() => {
    return startOfMonth(subMonths(new Date(), accountFilterMonths - 1));
  }, [accountFilterMonths]);

  const accountTransfers = useMemo(() => {
    if (!selectedAccountId) {
      return [];
    }
    return transfers.filter((transfer) => {
      const date = transfer.date.toDate();
      return (
        transfer.accountIds.includes(selectedAccountId) &&
        date >= accountFilterStart
      );
    });
  }, [accountFilterStart, selectedAccountId, transfers]);

  const accountSummary = useMemo(() => {
    let inflow = 0;
    let outflow = 0;
    if (!selectedAccountId) {
      return { inflow, outflow };
    }
    accountTransfers.forEach((transfer) => {
      if (transfer.toAccountId === selectedAccountId) {
        inflow += transfer.amount;
      }
      if (transfer.fromAccountId === selectedAccountId) {
        outflow += transfer.amount;
      }
    });
    return { inflow, outflow };
  }, [accountTransfers, selectedAccountId]);

  const accountForecasts = useMemo(() => {
    const now = new Date();
    const results = new Map<string, { expected: number | null }>();
    visibleAccounts.forEach((account) => {
      if (account.type !== "savings" || !account.maturityDate) {
        results.set(account.id, { expected: null });
        return;
      }
      const rate = account.interestRate ?? null;
      if (rate === null) {
        results.set(account.id, { expected: null });
        return;
      }
      const maturity = account.maturityDate.toDate();
      const start = account.startDate ? account.startDate.toDate() : now;
      const basis = start > now ? start : now;
      const months = Math.max(0, differenceInCalendarMonths(maturity, basis));
      const kind = account.savingsKind ?? "deposit";
      const effectiveInterestType =
        kind === "compound" ? "monthly_compound" : account.interestType ?? "simple";
      const monthlyDepositValue = account.monthlyDeposit ?? 0;
      const principal = account.balance;
      const deposits = kind === "installment" ? monthlyDepositValue * months : 0;
      let interest = 0;

      if (kind === "installment") {
        if (effectiveInterestType === "monthly_compound") {
          const monthlyRate = rate / 100 / 12;
          if (monthlyRate > 0 && months > 0) {
            const futureDeposits =
              monthlyDepositValue * ((Math.pow(1 + monthlyRate, months) - 1) / monthlyRate);
            const total = principal + futureDeposits;
            interest = total - principal - deposits;
          }
        } else {
          const avgBalance = principal + deposits / 2;
          interest = calcSimpleInterest(avgBalance, rate, months);
        }
      } else {
        if (effectiveInterestType === "monthly_compound") {
          interest = calcMonthlyCompoundInterest(principal, rate, months);
        } else {
          interest = calcSimpleInterest(principal, rate, months);
        }
      }

      const interestAfterTax = interest * (1 - 0.154);
      const expected = principal + deposits + interestAfterTax;
      results.set(account.id, { expected });
    });
    return results;
  }, [visibleAccounts]);

  const handleAddAccount = async () => {
    if (!householdId || !user) {
      return;
    }
    setErrorMessage(null);
    const cleaned = normalizeNumberInput(initialBalance);
    if (!accountName.trim()) {
      setErrorMessage("계좌 이름을 입력해주세요.");
      return;
    }
    if (accountType === "savings") {
      if (!startDate) {
        setErrorMessage("시작일을 입력해주세요.");
        return;
      }
      if (!maturityDate) {
        setErrorMessage("만기일을 입력해주세요.");
        return;
      }
      const rateValue = parseRate(interestRate);
      if (rateValue === null) {
        setErrorMessage("금리를 입력해주세요.");
        return;
      }
      if (savingsKind === "installment") {
        const depositCleaned = normalizeNumberInput(monthlyDeposit);
        if (!depositCleaned) {
          setErrorMessage("월 납입액을 입력해주세요.");
          return;
        }
      }
    }
    setSaving(true);
    try {
      const start = accountType === "savings" ? parseLocalDate(startDate) : null;
      if (accountType === "savings" && !start) {
        throw new Error("시작일을 확인해주세요.");
      }
      const maturity =
        accountType === "savings" && maturityDate ? parseLocalDate(maturityDate) : null;
      if (accountType === "savings" && !maturity) {
        throw new Error("만기일을 확인해주세요.");
      }
      const rateValue = accountType === "savings" ? parseRate(interestRate) : null;
      const monthlyDepositValue =
        accountType === "savings" ? Number(normalizeNumberInput(monthlyDeposit) || 0) : null;
      const effectiveInterestType =
        accountType === "savings" && savingsKind === "compound"
          ? "monthly_compound"
          : interestType;
      const docRef = await addAccount(householdId, {
        name: accountName.trim(),
        type: accountType,
        order: accounts.length + 1,
        balance: cleaned ? Number(cleaned) : 0,
        groupId: effectiveGroupId === DEFAULT_GROUP_ID ? null : effectiveGroupId,
        savingsKind: accountType === "savings" ? savingsKind : undefined,
        interestType: accountType === "savings" ? effectiveInterestType : undefined,
        interestRate: accountType === "savings" ? rateValue ?? 0 : undefined,
        monthlyDeposit:
          accountType === "savings" && savingsKind === "installment"
            ? monthlyDepositValue ?? 0
            : undefined,
        startDate: accountType === "savings" && start ? start : undefined,
        maturityDate: accountType === "savings" && maturity ? maturity : undefined,
        taxType: accountType === "savings" ? taxType : undefined,
        createdBy: user.uid,
      });
      setAccountName("");
      setAccountType("bank");
      setInitialBalance("");
      setSavingsKind("installment");
      setInterestType("simple");
      setInterestRate("");
      setMonthlyDeposit("");
      setStartDate("");
      setMaturityDate("");
      setTaxType("standard");
      setShowAccountSheet(false);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "저장 실패");
    } finally {
      setSaving(false);
    }
  };

  const handleAddTransfer = async () => {
    if (!householdId || !user) {
      return;
    }
    setErrorMessage(null);
    const cleaned = normalizeNumberInput(transferAmount);
    const parsedDate = parseLocalDate(transferDate);
    if (!parsedDate) {
      setErrorMessage("이체 날짜를 확인해주세요.");
      return;
    }
    if (!cleaned) {
      setErrorMessage("이체 금액을 입력해주세요.");
      return;
    }
    const fromId = transferFrom === "external" ? null : transferFrom;
    const toId = transferTo === "external" ? null : transferTo;
    if (!fromId && !toId) {
      setErrorMessage("출금/입금 계좌를 선택해주세요.");
      return;
    }
    setSaving(true);
    try {
      if (editingTransferId) {
        await updateTransfer({
          householdId,
          transferId: editingTransferId,
          fromAccountId: fromId,
          toAccountId: toId,
          amount: Number(cleaned),
          date: parsedDate,
          memo: transferMemo.trim(),
        });
      } else {
        await addTransfer({
          householdId,
          fromAccountId: fromId,
          toAccountId: toId,
          amount: Number(cleaned),
          date: parsedDate,
          memo: transferMemo.trim(),
          createdBy: user.uid,
        });
      }
      setEditingTransferId(null);
      setTransferAmount("");
      setTransferMemo("");
      setTransferDate(format(new Date(), "yyyy-MM-dd"));
      setShowTransferSheet(false);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "이체 실패");
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteTransfer = async () => {
    if (!householdId || !editingTransferId) {
      return;
    }
    const confirmed = window.confirm("이 이체 내역을 삭제할까요?");
    if (!confirmed) {
      return;
    }
    setSaving(true);
    setErrorMessage(null);
    try {
      await deleteTransfer({
        householdId,
        transferId: editingTransferId,
      });
      setShowTransferSheet(false);
      setEditingTransferId(null);
      setTransferFrom("external");
      setTransferTo("external");
      setTransferAmount("");
      setTransferMemo("");
      setTransferDate(format(new Date(), "yyyy-MM-dd"));
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "삭제 실패");
    } finally {
      setSaving(false);
    }
  };

  const handleAddTrade = async () => {
    if (!householdId || !user || !selectedAccountId) {
      return;
    }
    setErrorMessage(null);
    const cleaned = normalizeNumberInput(tradeAmount);
    const parsedDate = parseLocalDate(tradeDate);
    if (!parsedDate) {
      setErrorMessage("거래 날짜를 확인해주세요.");
      return;
    }
    if (!cleaned) {
      setErrorMessage("거래 금액을 입력해주세요.");
      return;
    }
    setSaving(true);
    try {
      await addInvestmentTrade(householdId, selectedAccountId, {
        accountId: selectedAccountId,
        type: tradeType,
        amount: Number(cleaned),
        date: parsedDate,
        memo: tradeMemo.trim(),
        createdBy: user.uid,
      });
      setTradeType("buy");
      setTradeAmount("");
      setTradeMemo("");
      setTradeDate(format(new Date(), "yyyy-MM-dd"));
      setShowTradeSheet(false);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "거래 실패");
    } finally {
      setSaving(false);
    }
  };

  const openTransferEditor = (transfer: typeof transfers[number]) => {
    setEditingTransferId(transfer.id);
    setTransferFrom(transfer.fromAccountId ?? "external");
    setTransferTo(transfer.toAccountId ?? "external");
    setTransferAmount(formatNumberInput(String(transfer.amount)));
    setTransferMemo(transfer.memo ?? "");
    setTransferDate(format(transfer.date.toDate(), "yyyy-MM-dd"));
    setShowTransferSheet(true);
  };

  const handleAccountGroupChange = async (groupId: string) => {
    if (!householdId || !selectedAccountId) {
      return;
    }
    await updateAccount(householdId, selectedAccountId, {
      groupId: groupId === DEFAULT_GROUP_ID ? null : groupId,
    });
  };

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-lg font-semibold">자산</h1>
          <p className="text-xs text-[color:rgba(45,38,34,0.6)]">
            현금성 자산을 관리하세요.
          </p>
        </div>
        <div className="flex gap-2">
          <a
            className="flex h-8 w-8 items-center justify-center rounded-full border border-[var(--border)] text-sm"
            href="/assets/manage"
            aria-label="탭 추가"
          >
            +
          </a>
          <button
            type="button"
            className="rounded-full border border-[var(--border)] px-3 py-1 text-xs"
            onClick={() => {
              setEditingTransferId(null);
              setTransferFrom("external");
              setTransferTo("external");
              setTransferAmount("");
              setTransferMemo("");
              setTransferDate(format(new Date(), "yyyy-MM-dd"));
              setShowTransferSheet(true);
            }}
          >
            이체
          </button>
          <button
            type="button"
            className="rounded-full bg-[var(--text)] px-3 py-1 text-xs text-white"
            onClick={() => setShowAccountSheet(true)}
          >
            계좌 추가
          </button>
        </div>
      </div>
      <div className="flex items-center gap-2 overflow-x-auto pb-1 text-xs">
        {accountGroupsWithDefault.map((group) => {
          const isActive = effectiveGroupId === group.id;
          return (
            <button
              key={group.id}
              type="button"
              onClick={() => setActiveGroupId(group.id)}
              className={`rounded-full border px-3 py-1 ${
                isActive
                  ? "border-[var(--text)] bg-[color:rgba(45,38,34,0.06)] font-semibold"
                  : "border-[var(--border)] text-[color:rgba(45,38,34,0.6)]"
              }`}
            >
              {group.name}
            </button>
          );
        })}
      </div>

      <section className="rounded-3xl border border-[var(--border)] bg-white p-5">
        <div className="flex items-center justify-between gap-2">
          <div>
            <p className="text-xs text-[color:rgba(45,38,34,0.6)]">현재 자산</p>
            <p className="text-2xl font-semibold">{formatKrw(totalBalance)}</p>
          </div>
          <div className="text-right text-xs text-[color:rgba(45,38,34,0.6)]">
            <p>이번 달 증액 {formatKrw(summary.increase)}</p>
            <p>이번 달 감액 {formatKrw(summary.decrease)}</p>
          </div>
        </div>
        <div className="mt-4 flex gap-2 text-xs">
          <button
            type="button"
            className={`rounded-full border px-3 py-1 ${
              includeExtended
                ? "border-[var(--border)] text-[color:rgba(45,38,34,0.6)]"
                : "border-[var(--text)] bg-[color:rgba(45,38,34,0.06)] font-semibold"
            }`}
            onClick={() => setIncludeExtended(false)}
          >
            현금성만
          </button>
          <button
            type="button"
            className={`rounded-full border px-3 py-1 ${
              includeExtended
                ? "border-[var(--text)] bg-[color:rgba(45,38,34,0.06)] font-semibold"
                : "border-[var(--border)] text-[color:rgba(45,38,34,0.6)]"
            }`}
            onClick={() => setIncludeExtended(true)}
          >
            투자·부채 포함
          </button>
        </div>
      </section>

      <section className="rounded-3xl border border-[var(--border)] bg-white p-5">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm font-semibold">월간 순증감</p>
            <p className="text-xs text-[color:rgba(45,38,34,0.6)]">
              최근 {chartRangeMonths}개월 기준
            </p>
          </div>
          <div className="flex gap-2 text-xs">
            <button
              type="button"
              className={`rounded-full border px-3 py-1 ${
                chartRangeMonths === 6
                  ? "border-[var(--text)] bg-[color:rgba(45,38,34,0.06)] font-semibold"
                  : "border-[var(--border)] text-[color:rgba(45,38,34,0.6)]"
              }`}
              onClick={() => setChartRangeMonths(6)}
            >
              6개월
            </button>
            <button
              type="button"
              className={`rounded-full border px-3 py-1 ${
                chartRangeMonths === 12
                  ? "border-[var(--text)] bg-[color:rgba(45,38,34,0.06)] font-semibold"
                  : "border-[var(--border)] text-[color:rgba(45,38,34,0.6)]"
              }`}
              onClick={() => setChartRangeMonths(12)}
            >
              12개월
            </button>
          </div>
        </div>
        <div className="mt-4 flex items-end gap-2">
          {monthlyNet.map((item) => {
            const height = Math.round(
              (Math.abs(item.net) / maxAbsNet) * 100
            );
            const isPositive = item.net >= 0;
            return (
              <div key={toMonthKey(item.month)} className="flex flex-1 flex-col items-center">
                <span className="text-[10px] text-[color:rgba(45,38,34,0.6)]">
                  {formatKrw(item.net)}
                </span>
                <div className="flex h-20 w-full items-end">
                  <div
                    className={`w-full rounded-full ${
                      isPositive ? "bg-emerald-400/70" : "bg-rose-400/70"
                    }`}
                    style={{ height: `${Math.max(height, 6)}%` }}
                    title={`${format(item.month, "M월")} ${formatKrw(item.net)}`}
                  />
                </div>
                <span className="mt-2 text-[10px] text-[color:rgba(45,38,34,0.6)]">
                  {format(item.month, "M월")}
                </span>
              </div>
            );
          })}
        </div>
      </section>

      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <p className="text-sm font-semibold">내 계좌</p>
          <p className="text-xs text-[color:rgba(45,38,34,0.6)]">
            {visibleAccounts.length}개
          </p>
        </div>
        {loading ? (
          <p className="text-sm text-[color:rgba(45,38,34,0.6)]">
            불러오는 중...
          </p>
        ) : visibleAccounts.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-[var(--border)] px-4 py-6 text-center text-sm text-[color:rgba(45,38,34,0.6)]">
            등록된 계좌가 없습니다.
          </div>
        ) : (
          visibleAccounts.map((account) => {
            const typeLabel =
              ACCOUNT_TYPES.find((type) => type.value === account.type)?.label ??
              "계좌";
            const kindLabel =
              account.type === "savings"
                ? SAVINGS_KINDS.find((kind) => kind.value === account.savingsKind)
                    ?.label
                : null;
            const forecast = accountForecasts.get(account.id)?.expected ?? null;
            const startText =
              account.type === "savings" && account.startDate
                ? format(account.startDate.toDate(), "yyyy.MM.dd")
                : null;
            const maturityText =
              account.type === "savings" && account.maturityDate
                ? format(account.maturityDate.toDate(), "yyyy.MM.dd")
                : null;
            return (
              <button
                type="button"
                key={account.id}
                className="w-full rounded-2xl border border-[var(--border)] bg-white px-4 py-3 text-left"
                onClick={() => setSelectedAccountId(account.id)}
              >
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-semibold">{account.name}</p>
                    <p className="text-xs text-[color:rgba(45,38,34,0.6)]">
                      {typeLabel}
                      {kindLabel ? ` · ${kindLabel}` : ""}
                    </p>
                  </div>
                  <p className="text-sm font-semibold">
                    {formatKrw(account.balance)}
                  </p>
                </div>
                {startText || maturityText ? (
                  <p className="mt-2 text-xs text-[color:rgba(45,38,34,0.6)]">
                    {startText ? `시작 ${startText}` : ""}
                    {startText && maturityText ? " · " : ""}
                    {maturityText ? `만기 ${maturityText}` : ""}
                    {maturityText && forecast !== null
                      ? ` · 세후 예상 ${formatKrw(forecast)}`
                      : ""}
                  </p>
                ) : null}
              </button>
            );
          })
        )}
      </section>

      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <p className="text-sm font-semibold">최근 이체</p>
          <p className="text-xs text-[color:rgba(45,38,34,0.6)]">
            {format(new Date(), "M월")}
          </p>
        </div>
        {recentTransfers.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-[var(--border)] px-4 py-6 text-center text-sm text-[color:rgba(45,38,34,0.6)]">
            이번 달 이체 내역이 없습니다.
          </div>
        ) : (
          <div className="space-y-2">
            {recentTransfers.map((transfer) => {
              const fromName =
                (transfer.fromAccountId &&
                  accountMap.get(transfer.fromAccountId)?.name) ||
                "외부";
              const toName =
                (transfer.toAccountId &&
                  accountMap.get(transfer.toAccountId)?.name) ||
                "외부";
              return (
                <div
                  key={transfer.id}
                  className="flex items-center justify-between rounded-2xl border border-[var(--border)] bg-white px-4 py-3 text-sm"
                >
                  <div>
                    <p className="font-semibold">
                      {fromName} → {toName}
                    </p>
                    <p className="text-xs text-[color:rgba(45,38,34,0.6)]">
                      {format(transfer.date.toDate(), "MM.dd")} ·{" "}
                      {transfer.memo || "메모 없음"}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <p className="font-semibold">{formatKrw(transfer.amount)}</p>
                    <button
                      type="button"
                      className="text-xs text-[color:rgba(45,38,34,0.6)]"
                      onClick={() => openTransferEditor(transfer)}
                    >
                      편집
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>

      {selectedAccount && (
        <div className="fixed inset-0 z-50">
          <button
            type="button"
            className="absolute inset-0 bg-black/40"
            onClick={() => setSelectedAccountId(null)}
            aria-label="닫기"
          />
          <div className="absolute bottom-0 left-0 right-0 max-h-[80vh] overflow-hidden rounded-t-3xl bg-white">
            <div className="p-6">
              <div className="mx-auto mb-4 h-1.5 w-12 rounded-full bg-[color:rgba(45,38,34,0.15)]" />
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-base font-semibold">{selectedAccount.name}</p>
                  <p className="text-xs text-[color:rgba(45,38,34,0.6)]">
                    {ACCOUNT_TYPES.find((type) => type.value === selectedAccount.type)?.label ??
                      "계좌"}
                  </p>
                </div>
                <p className="text-base font-semibold">
                  {formatKrw(selectedAccount.balance)}
                </p>
              </div>
              <div className="mt-4 flex gap-2 text-xs">
                {[1, 3, 12].map((months) => (
                  <button
                    key={months}
                    type="button"
                    className={`rounded-full border px-3 py-1 ${
                      accountFilterMonths === months
                        ? "border-[var(--text)] bg-[color:rgba(45,38,34,0.06)] font-semibold"
                        : "border-[var(--border)] text-[color:rgba(45,38,34,0.6)]"
                    }`}
                    onClick={() => setAccountFilterMonths(months as 1 | 3 | 12)}
                  >
                    {months}개월
                  </button>
                ))}
              </div>
              <div className="mt-4 flex items-center justify-between text-xs text-[color:rgba(45,38,34,0.6)]">
                <span>입금 {formatKrw(accountSummary.inflow)}</span>
                <span>출금 {formatKrw(accountSummary.outflow)}</span>
              </div>
              <div className="mt-4">
                <label className="text-xs text-[color:rgba(45,38,34,0.6)]">
                  탭 이동
                </label>
                <select
                  value={
                    selectedAccount.groupId
                      ? selectedAccount.groupId
                      : DEFAULT_GROUP_ID
                  }
                  onChange={(event) => handleAccountGroupChange(event.target.value)}
                  className="mt-1 w-full rounded-xl border border-[var(--border)] px-3 py-2 text-sm"
                >
                  {accountGroupsWithDefault.map((group) => (
                    <option key={group.id} value={group.id}>
                      {group.name}
                    </option>
                  ))}
                </select>
              </div>
              {selectedAccount.type === "investment" && investmentSummary ? (
                <div className="mt-4 rounded-2xl border border-[var(--border)] bg-[color:rgba(45,38,34,0.04)] p-4 text-sm">
                  <div className="flex items-center justify-between">
                    <p className="text-xs text-[color:rgba(45,38,34,0.6)]">
                      투자 평가
                    </p>
                    <button
                      type="button"
                      className="rounded-full border border-[var(--border)] px-3 py-1 text-xs"
                      onClick={() => setShowTradeSheet(true)}
                    >
                      거래 추가
                    </button>
                  </div>
                  <div className="mt-2 space-y-1 text-xs text-[color:rgba(45,38,34,0.7)]">
                    <div className="flex items-center justify-between">
                      <span>투자 원금</span>
                      <span className="font-semibold">
                        {formatKrw(investmentSummary.invested)}
                      </span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span>평가 손익</span>
                      <span
                        className={`font-semibold ${
                          investmentSummary.profit >= 0
                            ? "text-emerald-600"
                            : "text-red-500"
                        }`}
                      >
                        {formatKrw(investmentSummary.profit)}
                      </span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span>수익률</span>
                      <span className="font-semibold">
                        {investmentSummary.roi}%
                      </span>
                    </div>
                  </div>
                  {investmentAllocation.length > 1 ? (
                    <div className="mt-3 space-y-1 text-xs text-[color:rgba(45,38,34,0.6)]">
                      <p className="font-semibold text-[var(--text)]">
                        투자 비중
                      </p>
                      {investmentAllocation.map((account) => (
                        <div
                          key={account.id}
                          className="flex items-center justify-between"
                        >
                          <span>{account.name}</span>
                          <span>{account.share}%</span>
                        </div>
                      ))}
                    </div>
                  ) : null}
                </div>
              ) : null}
            </div>
            <div className="max-h-[50vh] overflow-y-auto px-6 pb-6">
              {selectedAccount.type === "investment" ? (
                <div className="mb-4 space-y-2">
                  <div className="flex items-center justify-between">
                    <p className="text-sm font-semibold">보유 종목</p>
                  </div>
                  {holdingsLoading ? (
                    <p className="text-xs text-[color:rgba(45,38,34,0.6)]">
                      불러오는 중...
                    </p>
                  ) : accountHoldings.length === 0 ? (
                    <div className="rounded-2xl border border-dashed border-[var(--border)] px-4 py-4 text-center text-sm text-[color:rgba(45,38,34,0.6)]">
                      보유 종목이 없습니다.
                    </div>
                  ) : (
                    <div className="space-y-2">
                      {accountHoldings.slice(0, 20).map((holding) => (
                        <div
                          key={holding.pdno}
                          className="flex items-center justify-between rounded-2xl border border-[var(--border)] bg-white px-4 py-3 text-sm"
                        >
                          <div>
                            <p className="font-semibold">
                              {holding.prdtName || holding.pdno}
                            </p>
                            <p className="text-xs text-[color:rgba(45,38,34,0.6)]">
                              보유 {holding.hldgQty}주 · 수익률{" "}
                              {holding.evluPflsRt}%
                            </p>
                          </div>
                          <p className="font-semibold">
                            {formatKrw(holding.evluAmt)}
                          </p>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              ) : null}
              {selectedAccount.type === "investment" ? (
                <div className="mb-4 space-y-2">
                  <p className="text-sm font-semibold">투자 내역</p>
                  {tradesLoading ? (
                    <p className="text-xs text-[color:rgba(45,38,34,0.6)]">
                      불러오는 중...
                    </p>
                  ) : accountTrades.length === 0 ? (
                    <div className="rounded-2xl border border-dashed border-[var(--border)] px-4 py-4 text-center text-sm text-[color:rgba(45,38,34,0.6)]">
                      등록된 거래가 없습니다.
                    </div>
                  ) : (
                    <div className="space-y-2">
                      {accountTrades.slice(0, 20).map((trade) => (
                        <div
                          key={trade.id}
                          className="flex items-center justify-between rounded-2xl border border-[var(--border)] bg-white px-4 py-3 text-sm"
                        >
                          <div>
                            <p className="font-semibold">
                              {trade.type === "buy" ? "매수" : "매도"}
                            </p>
                            <p className="text-xs text-[color:rgba(45,38,34,0.6)]">
                              {format(trade.date.toDate(), "MM.dd")} ·{" "}
                              {trade.memo || "메모 없음"}
                            </p>
                          </div>
                          <p className="font-semibold">
                            {formatKrw(trade.amount)}
                          </p>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              ) : null}
              {accountTransfers.length === 0 ? (
                <div className="rounded-2xl border border-dashed border-[var(--border)] px-4 py-6 text-center text-sm text-[color:rgba(45,38,34,0.6)]">
                  선택한 기간에 이체 내역이 없습니다.
                </div>
              ) : (
                <div className="space-y-2">
                  {accountTransfers.slice(0, 20).map((transfer) => {
                    const fromName =
                      (transfer.fromAccountId &&
                        accountMap.get(transfer.fromAccountId)?.name) ||
                      "외부";
                    const toName =
                      (transfer.toAccountId &&
                        accountMap.get(transfer.toAccountId)?.name) ||
                      "외부";
                    return (
                      <div
                        key={transfer.id}
                        className="flex items-center justify-between rounded-2xl border border-[var(--border)] bg-white px-4 py-3 text-sm"
                      >
                        <div>
                          <p className="font-semibold">
                            {fromName} → {toName}
                          </p>
                          <p className="text-xs text-[color:rgba(45,38,34,0.6)]">
                            {format(transfer.date.toDate(), "MM.dd")} ·{" "}
                            {transfer.memo || "메모 없음"}
                          </p>
                        </div>
                        <div className="flex items-center gap-2">
                          <p className="font-semibold">{formatKrw(transfer.amount)}</p>
                          <button
                            type="button"
                            className="text-xs text-[color:rgba(45,38,34,0.6)]"
                            onClick={() => openTransferEditor(transfer)}
                          >
                            편집
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {errorMessage ? (
        <p className="text-sm text-red-500">{errorMessage}</p>
      ) : null}

      {showAccountSheet ? (
        <div className="fixed inset-0 z-50">
          <button
            type="button"
            className="absolute inset-0 bg-black/40"
            onClick={() => setShowAccountSheet(false)}
            aria-label="닫기"
          />
          <div className="absolute bottom-0 left-0 right-0 max-h-[85vh] overflow-y-auto rounded-t-3xl bg-white p-6">
            <div className="mx-auto mb-4 h-1.5 w-12 rounded-full bg-[color:rgba(45,38,34,0.15)]" />
            <h2 className="text-base font-semibold">계좌 추가</h2>
            <div className="mt-4 space-y-3">
              <div>
                <label className="text-xs text-[color:rgba(45,38,34,0.6)]">
                  계좌 이름
                </label>
                <input
                  value={accountName}
                  onChange={(event) => setAccountName(event.target.value)}
                  className="mt-1 w-full rounded-xl border border-[var(--border)] px-3 py-2 text-sm"
                />
              </div>
              <div>
                <label className="text-xs text-[color:rgba(45,38,34,0.6)]">
                  계좌 유형
                </label>
                <select
                  value={accountType}
                  onChange={(event) => {
                    const nextType = event.target
                      .value as typeof ACCOUNT_TYPES[number]["value"];
                    setAccountType(nextType);
                  }}
                  className="mt-1 w-full rounded-xl border border-[var(--border)] px-3 py-2 text-sm"
                >
                  {ACCOUNT_TYPES.map((type) => (
                    <option key={type.value} value={type.value}>
                      {type.label}
                    </option>
                  ))}
                </select>
              </div>
              {accountType === "savings" ? (
                <>
                  <div>
                    <label className="text-xs text-[color:rgba(45,38,34,0.6)]">
                      상품 유형
                    </label>
                    <select
                      value={savingsKind}
                      onChange={(event) =>
                        setSavingsKind(
                          event.target.value as typeof SAVINGS_KINDS[number]["value"]
                        )
                      }
                      className="mt-1 w-full rounded-xl border border-[var(--border)] px-3 py-2 text-sm"
                    >
                      {SAVINGS_KINDS.map((kind) => (
                        <option key={kind.value} value={kind.value}>
                          {kind.label}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="text-xs text-[color:rgba(45,38,34,0.6)]">
                      금리 방식
                    </label>
                    <select
                      value={
                        savingsKind === "compound" ? "monthly_compound" : interestType
                      }
                      onChange={(event) =>
                        setInterestType(
                          event.target.value as typeof INTEREST_TYPES[number]["value"]
                        )
                      }
                      disabled={savingsKind === "compound"}
                      className="mt-1 w-full rounded-xl border border-[var(--border)] px-3 py-2 text-sm disabled:bg-[color:rgba(45,38,34,0.06)]"
                    >
                      {INTEREST_TYPES.map((type) => (
                        <option key={type.value} value={type.value}>
                          {type.label}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="text-xs text-[color:rgba(45,38,34,0.6)]">
                      금리(연, %)
                    </label>
                    <input
                      inputMode="decimal"
                      value={interestRate}
                      onChange={(event) =>
                        setInterestRate(normalizeRateInput(event.target.value))
                      }
                      className="mt-1 w-full rounded-xl border border-[var(--border)] px-3 py-2 text-sm"
                    />
                  </div>
                  {savingsKind === "installment" ? (
                    <div>
                      <label className="text-xs text-[color:rgba(45,38,34,0.6)]">
                        월 납입액
                      </label>
                      <input
                        inputMode="numeric"
                        value={monthlyDeposit}
                        onChange={(event) =>
                          setMonthlyDeposit(formatNumberInput(event.target.value))
                        }
                        className="mt-1 w-full rounded-xl border border-[var(--border)] px-3 py-2 text-sm text-right"
                      />
                    </div>
                  ) : null}
                  <div>
                    <label className="text-xs text-[color:rgba(45,38,34,0.6)]">
                      시작일
                    </label>
                    <input
                      type="date"
                      value={startDate}
                      onChange={(event) => setStartDate(event.target.value)}
                      className="mt-1 w-full rounded-xl border border-[var(--border)] px-3 py-2 text-sm"
                    />
                  </div>
                  <div>
                    <label className="text-xs text-[color:rgba(45,38,34,0.6)]">
                      만기일
                    </label>
                    <input
                      type="date"
                      value={maturityDate}
                      onChange={(event) => setMaturityDate(event.target.value)}
                      className="mt-1 w-full rounded-xl border border-[var(--border)] px-3 py-2 text-sm"
                    />
                  </div>
                  <div>
                    <label className="text-xs text-[color:rgba(45,38,34,0.6)]">
                      과세 방식
                    </label>
                    <select
                      value={taxType}
                      onChange={(event) =>
                        setTaxType(
                          event.target.value as typeof TAX_TYPES[number]["value"]
                        )
                      }
                      className="mt-1 w-full rounded-xl border border-[var(--border)] px-3 py-2 text-sm"
                    >
                      {TAX_TYPES.map((type) => (
                        <option key={type.value} value={type.value}>
                          {type.label}
                        </option>
                      ))}
                    </select>
                  </div>
                </>
              ) : null}
              <div>
                <label className="text-xs text-[color:rgba(45,38,34,0.6)]">
                  초기 잔액
                </label>
                <input
                  inputMode="numeric"
                  value={initialBalance}
                  onChange={(event) =>
                    setInitialBalance(formatNumberInput(event.target.value))
                  }
                  className="mt-1 w-full rounded-xl border border-[var(--border)] px-3 py-2 text-sm text-right"
                />
              </div>
              <button
                type="button"
                onClick={handleAddAccount}
                disabled={saving}
                className="mt-2 w-full rounded-full bg-[var(--text)] px-4 py-3 text-sm text-white"
              >
                {saving ? "저장 중..." : "저장"}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {showTransferSheet ? (
        <div className="fixed inset-0 z-50">
          <button
            type="button"
            className="absolute inset-0 bg-black/40"
            onClick={() => {
              setShowTransferSheet(false);
              setEditingTransferId(null);
            }}
            aria-label="닫기"
          />
          <div className="absolute bottom-0 left-0 right-0 max-h-[85vh] overflow-y-auto rounded-t-3xl bg-white p-6">
            <div className="mx-auto mb-4 h-1.5 w-12 rounded-full bg-[color:rgba(45,38,34,0.15)]" />
            <h2 className="text-base font-semibold">이체 기록</h2>
            <div className="mt-4 space-y-3">
              <div className="grid gap-3 sm:grid-cols-2">
                <div>
                  <label className="text-xs text-[color:rgba(45,38,34,0.6)]">
                    출금 계좌
                  </label>
                  <select
                    value={transferFrom}
                    onChange={(event) => setTransferFrom(event.target.value)}
                    className="mt-1 w-full rounded-xl border border-[var(--border)] px-3 py-2 text-sm"
                  >
                    <option value="external">외부</option>
                    {visibleAccounts.map((account) => (
                      <option key={account.id} value={account.id}>
                        {account.name}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="text-xs text-[color:rgba(45,38,34,0.6)]">
                    입금 계좌
                  </label>
                  <select
                    value={transferTo}
                    onChange={(event) => setTransferTo(event.target.value)}
                    className="mt-1 w-full rounded-xl border border-[var(--border)] px-3 py-2 text-sm"
                  >
                    <option value="external">외부</option>
                    {visibleAccounts.map((account) => (
                      <option key={account.id} value={account.id}>
                        {account.name}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
              <div>
                <label className="text-xs text-[color:rgba(45,38,34,0.6)]">
                  금액
                </label>
                <input
                  inputMode="numeric"
                  value={transferAmount}
                  onChange={(event) =>
                    setTransferAmount(formatNumberInput(event.target.value))
                  }
                  className="mt-1 w-full rounded-xl border border-[var(--border)] px-3 py-2 text-sm text-right"
                />
              </div>
              <div>
                <label className="text-xs text-[color:rgba(45,38,34,0.6)]">
                  날짜
                </label>
                <input
                  type="date"
                  value={transferDate}
                  onChange={(event) => setTransferDate(event.target.value)}
                  className="mt-1 w-full rounded-xl border border-[var(--border)] px-3 py-2 text-sm"
                />
              </div>
              <div>
                <label className="text-xs text-[color:rgba(45,38,34,0.6)]">
                  메모
                </label>
                <input
                  value={transferMemo}
                  onChange={(event) => setTransferMemo(event.target.value)}
                  className="mt-1 w-full rounded-xl border border-[var(--border)] px-3 py-2 text-sm"
                />
              </div>
              <div className="mt-2 flex gap-2">
                {editingTransferId ? (
                  <button
                    type="button"
                    onClick={handleDeleteTransfer}
                    disabled={saving}
                    className="flex-1 rounded-full border border-[var(--border)] px-4 py-3 text-sm text-red-600"
                  >
                    삭제
                  </button>
                ) : null}
                <button
                  type="button"
                  onClick={handleAddTransfer}
                  disabled={saving}
                  className="flex-1 rounded-full bg-[var(--text)] px-4 py-3 text-sm text-white"
                >
                  {saving ? "저장 중..." : editingTransferId ? "수정" : "저장"}
                </button>
              </div>
            </div>
          </div>
        </div>
      ) : null}

      {showTradeSheet ? (
        <div className="fixed inset-0 z-50">
          <button
            type="button"
            className="absolute inset-0 bg-black/40"
            onClick={() => setShowTradeSheet(false)}
            aria-label="닫기"
          />
          <div className="absolute bottom-0 left-0 right-0 max-h-[85vh] overflow-y-auto rounded-t-3xl bg-white p-6">
            <div className="mx-auto mb-4 h-1.5 w-12 rounded-full bg-[color:rgba(45,38,34,0.15)]" />
            <h2 className="text-base font-semibold">투자 거래 추가</h2>
            <div className="mt-4 space-y-3">
              <div>
                <label className="text-xs text-[color:rgba(45,38,34,0.6)]">
                  거래 유형
                </label>
                <div className="mt-2 flex gap-2">
                  {(["buy", "sell"] as const).map((value) => (
                    <button
                      key={value}
                      type="button"
                      className={`rounded-full border px-4 py-2 text-sm ${
                        tradeType === value
                          ? "border-[var(--text)] bg-[color:rgba(45,38,34,0.06)] font-semibold"
                          : "border-[var(--border)] text-[color:rgba(45,38,34,0.6)]"
                      }`}
                      onClick={() => setTradeType(value)}
                    >
                      {value === "buy" ? "매수" : "매도"}
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <label className="text-xs text-[color:rgba(45,38,34,0.6)]">
                  금액
                </label>
                <input
                  inputMode="numeric"
                  value={tradeAmount}
                  onChange={(event) =>
                    setTradeAmount(formatNumberInput(event.target.value))
                  }
                  className="mt-1 w-full rounded-xl border border-[var(--border)] px-3 py-2 text-sm text-right"
                />
              </div>
              <div>
                <label className="text-xs text-[color:rgba(45,38,34,0.6)]">
                  날짜
                </label>
                <input
                  type="date"
                  value={tradeDate}
                  onChange={(event) => setTradeDate(event.target.value)}
                  className="mt-1 w-full rounded-xl border border-[var(--border)] px-3 py-2 text-sm"
                />
              </div>
              <div>
                <label className="text-xs text-[color:rgba(45,38,34,0.6)]">
                  메모
                </label>
                <input
                  value={tradeMemo}
                  onChange={(event) => setTradeMemo(event.target.value)}
                  className="mt-1 w-full rounded-xl border border-[var(--border)] px-3 py-2 text-sm"
                />
              </div>
              <button
                type="button"
                onClick={handleAddTrade}
                disabled={saving}
                className="mt-2 w-full rounded-full bg-[var(--text)] px-4 py-3 text-sm text-white"
              >
                {saving ? "저장 중..." : "저장"}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
