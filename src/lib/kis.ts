import { httpsCallable } from "firebase/functions";
import { functions } from "@/lib/firebase/client";

export async function connectKis(params: {
  householdId: string;
  accountId: string;
  appKey: string;
  appSecret: string;
}) {
  const callable = httpsCallable(functions, "kisConnect");
  const result = await callable(params);
  return result.data as { ok: boolean; message?: string };
}

export async function syncKisHoldings(params: {
  householdId: string;
  accountId: string;
}) {
  const callable = httpsCallable(functions, "kisSyncHoldings");
  const result = await callable(params);
  return result.data as { ok: boolean; message?: string };
}

