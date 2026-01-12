import { Timestamp, addDoc, serverTimestamp } from "firebase/firestore";
import { accountTradesCol } from "@/lib/firebase/firestore";
type InvestmentTradeInput = {
  type: "buy" | "sell";
  amount: number;
  date: Date;
  memo?: string;
  createdBy: string;
};

export async function addInvestmentTrade(
  householdId: string,
  accountId: string,
  data: InvestmentTradeInput
) {
  return addDoc(accountTradesCol(householdId, accountId), {
    ...data,
    accountId,
    date: Timestamp.fromDate(data.date),
    createdAt: serverTimestamp(),
  });
}
