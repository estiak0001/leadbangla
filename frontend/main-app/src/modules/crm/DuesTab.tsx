import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Phone, MessageCircle, Wallet } from "lucide-react";
import Alert from "../../components/Alert";
import Spinner from "../../components/Spinner";
import { fetchDuesOverview, taka, whatsappLink, type DuesOverview } from "../../lib/crm";

export default function DuesTab() {
  const [data, setData] = useState<DuesOverview | null>(null);
  const [error, setError] = useState("");
  useEffect(() => { fetchDuesOverview().then(setData).catch((e) => setError(e.message)); }, []);

  if (error) return <Alert variant="error">{error}</Alert>;
  if (!data) return <div className="flex justify-center py-12"><Spinner /></div>;

  return (
    <div>
      <div className="grid grid-cols-2 gap-3 mb-4 max-w-md">
        <div className="bg-white border border-surface-200 rounded-md px-4 py-3">
          <p className="text-lg font-bold text-surface-900 leading-none">{taka(data.total)}</p>
          <p className="text-xs text-surface-600 mt-1">Total dues (owed to you)</p>
        </div>
        <div className="bg-white border border-surface-200 rounded-md px-4 py-3">
          <p className="text-lg font-bold text-surface-900 leading-none">{data.count}</p>
          <p className="text-xs text-surface-600 mt-1">Customers who owe you</p>
        </div>
      </div>

      {data.items.length === 0 ? (
        <div className="text-center py-14 bg-white border border-surface-200 rounded-lg">
          <Wallet size={28} className="mx-auto text-surface-300 mb-2" />
          <p className="text-sm font-medium text-surface-700">No outstanding dues</p>
          <p className="text-xs text-surface-500 mt-1">Record a credit sale from a customer’s page (“Dues” tab) and it will be listed here.</p>
        </div>
      ) : (
        <ul className="space-y-2">
          {data.items.map((i) => {
            const msg = `আসসালামু আলাইকুম ${i.name}, আপনার ${taka(i.balance)} বাকি আছে। অনুগ্রহ করে পরিশোধ করুন। ধন্যবাদ।`;
            const wa = whatsappLink(i.phone, msg);
            return (
              <li key={i.contact_id} className="bg-white border border-surface-200 rounded-lg px-3.5 py-3 flex items-center gap-3">
                <div className="min-w-0 flex-1">
                  <Link to={`/contacts/${i.contact_id}`} state={{ from: "crm" }} className="text-sm font-semibold text-surface-900 hover:text-brand-600 truncate block">{i.name}</Link>
                  <p className="text-xs text-surface-600 mt-0.5">
                    {i.next_due_date ? <>Due {new Date(i.next_due_date).toLocaleDateString("en-BD", { day: "numeric", month: "short" })}{i.overdue && <span className="ml-1.5 text-danger-dark font-medium">overdue</span>}</> : "No due date"}
                  </p>
                </div>
                <p className="text-base font-bold text-danger-dark">{taka(i.balance)}</p>
                <div className="flex items-center gap-1">
                  {i.phone && <a href={`tel:${i.phone}`} aria-label="Call" className="p-2 rounded bg-surface-100 text-surface-600 hover:text-brand-600"><Phone size={14} /></a>}
                  {wa && <a href={wa} target="_blank" rel="noreferrer" aria-label="WhatsApp reminder" title="Send a WhatsApp reminder" className="p-2 rounded bg-success-light text-success-dark"><MessageCircle size={14} /></a>}
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
