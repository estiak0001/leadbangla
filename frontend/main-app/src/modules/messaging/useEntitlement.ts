import { useEffect, useState } from "react";
import { fetchSmsEntitlement, type SmsEntitlement } from "../../lib/sms";

/** What the customer's plan allows for SMS/WhatsApp (null while loading). */
export function useEntitlement() {
  const [ent, setEnt] = useState<SmsEntitlement | null>(null);
  useEffect(() => { fetchSmsEntitlement().then(setEnt).catch(() => undefined); }, []);
  return ent;
}
