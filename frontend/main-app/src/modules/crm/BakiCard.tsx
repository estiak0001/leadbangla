import { FormEvent, useCallback, useEffect, useState } from "react";
import { Trash2 } from "lucide-react";
import Button from "../../components/Button";
import Card from "../../components/Card";
import Alert from "../../components/Alert";
import { addDue, deleteDue, fetchContactDues, taka, type DueEntry } from "../../lib/crm";

function Wrap({ bare, children }: { bare: boolean; children: React.ReactNode }) {
  return bare ? <div>{children}</div> : <Card>{children}</Card>;
}

/** Credit-sale ledger: "due" adds to what the customer owes, "payment" reduces it. */
export default function BakiCard({ contactId, onChanged, bare = false }: { contactId: string; onChanged: () => void; bare?: boolean }) {
  const [data, setData] = useState<{ balance: number; entries: DueEntry[] } | null>(null);
  const [error, setError] = useState("");
  const [kind, setKind] = useState<"due" | "payment">("due");
  const [amount, setAmount] = useState("");
  const [note, setNote] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [saving, setSaving] = useState(false);

  const load = useCallback(() => { fetchContactDues(contactId).then(setData).catch((e) => setError(e.message)); }, [contactId]);
  useEffect(load, [load]);

  const add = async (e: FormEvent) => {
    e.preventDefault();
    const n = Number(amount);
    if (!(n > 0)) return;
    setSaving(true); setError("");
    try { await addDue(contactId, { kind, amount: n, note: note.trim() || undefined, due_date: kind === "due" && dueDate ? dueDate : null }); setAmount(""); setNote(""); setDueDate(""); load(); onChanged(); }
    catch (err: any) { setError(err.message); } finally { setSaving(false); }
  };

  if (!data) return null;
  return (
    <Wrap bare={bare}>
      <div className="flex items-baseline justify-between mb-3">
        <h2 className="text-sm font-semibold text-surface-900">Dues (credit account)</h2>
        <p className={`text-lg font-bold ${data.balance > 0 ? "text-danger-dark" : "text-success-dark"}`}>{data.balance > 0 ? `${taka(data.balance)} due` : data.balance < 0 ? `${taka(-data.balance)} advance` : "Settled"}</p>
      </div>
      {error && <Alert variant="error" className="mb-3">{error}</Alert>}
      <form onSubmit={add} className="grid grid-cols-2 sm:grid-cols-[110px_1fr_1fr_auto] gap-2 mb-3">
        <select value={kind} onChange={(e) => setKind(e.target.value as "due" | "payment")} className="border border-surface-200 rounded-md px-2 py-2 text-sm bg-white">
          <option value="due">Sold on credit</option><option value="payment">Payment received</option>
        </select>
        <input type="number" min="0" step="any" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="Amount ৳" className="border border-surface-200 rounded-md px-2.5 py-2 text-sm" />
        <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Note (optional)" maxLength={300} className="border border-surface-200 rounded-md px-2.5 py-2 text-sm" />
        <Button type="submit" size="sm" loading={saving} disabled={!(Number(amount) > 0)}>Add</Button>
        {kind === "due" && <div className="col-span-2 sm:col-span-4 flex items-center gap-2 text-xs text-surface-600"><label htmlFor="dd">Pay by</label><input id="dd" type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} className="border border-surface-200 rounded px-2 py-1 text-sm" /></div>}
      </form>
      {data.entries.length > 0 && (
        <ul className="divide-y divide-surface-100 text-sm">
          {data.entries.slice(0, 8).map((e) => (
            <li key={e.id} className="flex items-center gap-3 py-2">
              <span className={`font-semibold ${e.kind === "due" ? "text-danger-dark" : "text-success-dark"}`}>{e.kind === "due" ? "+" : "−"}{taka(e.amount)}</span>
              <span className="flex-1 min-w-0 truncate text-surface-600">{e.note || (e.kind === "due" ? "Credit sale" : "Payment")}{e.due_date && <span className="text-surface-400"> · by {new Date(e.due_date).toLocaleDateString("en-BD", { day: "numeric", month: "short" })}</span>}</span>
              <span className="text-xs text-surface-400">{new Date(e.created_at).toLocaleDateString("en-BD", { day: "numeric", month: "short" })}</span>
              <button onClick={() => deleteDue(e.id).then(() => { load(); onChanged(); })} aria-label="Delete entry" className="text-surface-300 hover:text-danger-base"><Trash2 size={13} /></button>
            </li>
          ))}
        </ul>
      )}
    </Wrap>
  );
}
