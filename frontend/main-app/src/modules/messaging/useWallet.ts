import { useEffect, useState } from "react";
import { fetchCreditRates, fetchWalletBalance } from "../../lib/billing";
import type { SmsChannel } from "../../lib/sms";

/** Wallet balance and how many messages it covers for a channel. */
export function useWallet(channel: SmsChannel) {
  const [balance, setBalance] = useState<number | null>(null);
  const [rate, setRate] = useState<number | null>(null);
  useEffect(() => {
    fetchWalletBalance().then((w) => setBalance(w.balance_bdt)).catch(() => undefined);
    fetchCreditRates().then((rs) => { const r = rs.find((x) => x.service === channel); if (r) setRate(Number(r.rate_bdt)); }).catch(() => undefined);
  }, [channel]);
  const available = balance !== null && rate ? Math.floor(balance / rate) : null;
  return { balance, rate, available };
}
