import { FormEvent, useEffect, useState } from "react";
import { Link2, X } from "lucide-react";
import AppLayout from "../../components/AppLayout";
import Button from "../../components/Button";
import Card from "../../components/Card";
import Badge from "../../components/Badge";
import Alert from "../../components/Alert";
import PageHeader from "../../components/PageHeader";
import EmptyState from "../../components/EmptyState";
import Input from "../../components/Input";
import Select from "../../components/Select";
import Spinner from "../../components/Spinner";
import {
  Commission, ReferralLink, ReferralProgram, createLink, createProgram,
  deleteLink, deleteProgram, listCommissions, listLinks, listPrograms,
  recordConversion, trackingUrl, updateCommissionStatus,
} from "../../lib/affiliate";
import { confirmText } from "../../components/ConfirmDialog";

function fmt(n: number) { return n.toLocaleString("en-BD", { maximumFractionDigits: 2 }); }

function ConversionModal({ code, onClose, onDone }: { code: string; onClose: () => void; onDone: (c: Commission) => void }) {
  const [value, setValue] = useState("0");
  const [notes, setNotes] = useState("");
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState("");

  const submit = async (e: FormEvent) => {
    e.preventDefault(); setLoading(true); setErr("");
    try { onDone(await recordConversion(code, parseFloat(value) || 0, notes || undefined)); }
    catch (ex: any) { setErr(ex.message); }
    finally { setLoading(false); }
  };

  return (
    <div className="fixed inset-0 bg-surface-900/40 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-md shadow-xl w-full max-w-sm p-6 animate-slide-up">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-base font-bold text-surface-900">Record Conversion</h3>
          <button onClick={onClose} className="text-surface-400 hover:text-surface-600 transition-colors"><X size={18} /></button>
        </div>
        <p className="text-xs text-surface-600 mb-4">Code: <span className="font-mono font-semibold text-brand-600">{code}</span></p>
        <form onSubmit={submit} className="space-y-3">
          <Input label="Sale amount (BDT)" type="number" min="0" step="0.01" value={value} onChange={(e) => setValue(e.target.value)} />
          <Input label="Notes (optional)" placeholder="e.g. Order #1234" value={notes} onChange={(e) => setNotes(e.target.value)} />
          {err && <Alert variant="error">{err}</Alert>}
          <div className="flex gap-2 pt-1">
            <Button type="submit" loading={loading} size="sm" className="flex-1">Record</Button>
            <Button type="button" variant="ghost" size="sm" className="flex-1" onClick={onClose}>Cancel</Button>
          </div>
        </form>
      </div>
    </div>
  );
}

function LinkRow({ link, onDelete, onConversion }: { link: ReferralLink; onDelete: () => void; onConversion: () => void }) {
  const [copied, setCopied] = useState(false);
  const url = trackingUrl(link.code);
  const copy = () => { navigator.clipboard.writeText(url); setCopied(true); setTimeout(() => setCopied(false), 1500); };

  return (
    <div className="flex items-center gap-3 py-2.5 border-b border-surface-100 last:border-0 flex-wrap text-sm">
      <span className="font-mono text-brand-700 bg-brand-50 px-2 py-0.5 rounded text-xs">{link.code}</span>
      <span className="flex-1 text-surface-400 text-xs truncate min-w-0">{url}</span>
      <div className="flex items-center gap-3 text-xs text-surface-600 flex-shrink-0">
        <span>{link.clicks} clicks</span>
        <span>{link.conversions} conv.</span>
      </div>
      <div className="flex items-center gap-1.5 flex-shrink-0">
        <Button size="xs" variant="secondary" onClick={copy}>{copied ? "Copied!" : "Copy"}</Button>
        <Button size="xs" variant="ghost" onClick={onConversion}>Record Conv.</Button>
        <Button size="xs" variant="danger" onClick={onDelete}>Delete</Button>
      </div>
    </div>
  );
}

function ProgramCard({ program, onDelete, onCommission }: { program: ReferralProgram; onDelete: () => void; onCommission: (c: Commission) => void }) {
  const [expanded, setExpanded] = useState(false);
  const [links, setLinks] = useState<ReferralLink[]>([]);
  const [loadingLinks, setLoadingLinks] = useState(false);
  const [conversionTarget, setConversionTarget] = useState<string | null>(null);

  const loadLinks = async () => { setLoadingLinks(true); try { setLinks(await listLinks(program.id)); } finally { setLoadingLinks(false); } };
  const handleExpand = () => { if (!expanded) loadLinks(); setExpanded((v) => !v); };
  const handleGenerateLink = async () => { const link = await createLink(program.id); setLinks((prev) => [link, ...prev]); };
  const handleDeleteLink = async (id: string) => { if (!(await confirmText("Delete this referral link?"))) return; await deleteLink(id); setLinks((prev) => prev.filter((l) => l.id !== id)); };
  const commissionLabel = program.commission_type === "percentage" ? `${program.commission_value}%` : `৳${fmt(program.commission_value)} flat`;

  return (
    <>
      {conversionTarget && (
        <ConversionModal code={conversionTarget} onClose={() => setConversionTarget(null)} onDone={(c) => {
          setConversionTarget(null); onCommission(c);
          setLinks((prev) => prev.map((l) => (l.code === conversionTarget ? { ...l, conversions: l.conversions + 1 } : l)));
        }} />
      )}
      <Card>
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 mb-0.5 flex-wrap">
              <span className="font-semibold text-surface-900">{program.name}</span>
              {!program.is_active && <Badge size="sm">Inactive</Badge>}
              <Badge variant="primary" size="sm">{commissionLabel}</Badge>
            </div>
            {program.description && <p className="text-xs text-surface-500">{program.description}</p>}
            <p className="text-xs text-surface-600 mt-0.5 truncate">→ {program.target_url} · cookie {program.cookie_days}d</p>
          </div>
          <div className="flex items-center gap-2 flex-shrink-0">
            <Button size="xs" variant="secondary" onClick={handleExpand}>{expanded ? "Hide" : "Links"}</Button>
            <Button size="xs" variant="danger" onClick={onDelete}>Delete</Button>
          </div>
        </div>
        {expanded && (
          <div className="mt-4 border-t border-surface-100 pt-4">
            <div className="flex items-center justify-between mb-3">
              <span className="section-label">Referral Links</span>
              <Button size="xs" onClick={handleGenerateLink}>+ Generate Link</Button>
            </div>
            {loadingLinks ? <Spinner size="sm" /> : links.length === 0
              ? <p className="text-xs text-surface-600">No links yet — click Generate Link to create one.</p>
              : links.map((l) => (
                <LinkRow key={l.id} link={l} onDelete={() => handleDeleteLink(l.id)} onConversion={() => setConversionTarget(l.code)} />
              ))
            }
          </div>
        )}
      </Card>
    </>
  );
}

const EMPTY_FORM = { name: "", description: "", commission_type: "percentage" as "flat" | "percentage", commission_value: 10, cookie_days: 30, target_url: "https://", is_active: true };

function NewProgramForm({ onCreated }: { onCreated: (p: ReferralProgram) => void }) {
  const [form, setForm] = useState(EMPTY_FORM);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState("");
  const set = <K extends keyof typeof EMPTY_FORM>(k: K, v: (typeof EMPTY_FORM)[K]) => setForm((p) => ({ ...p, [k]: v }));

  const submit = async (e: FormEvent) => {
    e.preventDefault(); setLoading(true); setErr("");
    try { onCreated(await createProgram(form)); setForm(EMPTY_FORM); }
    catch (ex: any) { setErr(ex.message); }
    finally { setLoading(false); }
  };

  return (
    <Card className="mb-5">
      <h3 className="text-sm font-semibold text-surface-800 mb-4">New Referral Program</h3>
      <form onSubmit={submit} className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div className="sm:col-span-2">
          <Input label="Program Name" type="text" value={form.name} onChange={(e) => set("name", e.target.value)} required placeholder="e.g. Customer Referral Q3" />
        </div>
        <Select label="Commission Type" value={form.commission_type} onChange={(e) => set("commission_type", e.target.value as "flat" | "percentage")}>
          <option value="percentage">Percentage of sale</option>
          <option value="flat">Flat amount (BDT)</option>
        </Select>
        <Input label={form.commission_type === "percentage" ? "Commission %" : "Commission (BDT)"} type="number" min="0" step="0.01" value={form.commission_value} onChange={(e) => set("commission_value", parseFloat(e.target.value) || 0)} />
        <Input label="Cookie window (days)" type="number" min="1" value={form.cookie_days} onChange={(e) => set("cookie_days", parseInt(e.target.value) || 30)} />
        <Input label="Target URL" type="url" value={form.target_url} onChange={(e) => set("target_url", e.target.value)} required />
        <div className="sm:col-span-2">
          <Input label="Description (optional)" type="text" value={form.description} onChange={(e) => set("description", e.target.value)} placeholder="Internal note about this program" />
        </div>
        {err && <div className="sm:col-span-2"><Alert variant="error">{err}</Alert></div>}
        <div className="sm:col-span-2">
          <Button type="submit" size="sm" loading={loading}>Create Program</Button>
        </div>
      </form>
    </Card>
  );
}

function CommissionsTab() {
  const [commissions, setCommissions] = useState<Commission[]>([]);
  const [loading, setLoading] = useState(true);
  useEffect(() => { listCommissions().then(setCommissions).finally(() => setLoading(false)); }, []);
  const handleStatus = async (id: string, status: Commission["status"]) => {
    setCommissions((prev) => prev.map((c) => (c.id === id ? { ...c, status } : c)));
    await updateCommissionStatus(id, status);
  };

  if (loading) return <div className="flex justify-center py-12"><Spinner size="lg" /></div>;
  if (!commissions.length) return <Card><EmptyState icon={<Link2 size={36} />} title="No commissions yet" description="Record a conversion on a referral link to generate one." /></Card>;

  const total = commissions.reduce((s, c) => s + c.commission_amount, 0);
  const pending = commissions.filter((c) => c.status === "pending").length;

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <Card className="p-4"><p className="text-xs text-surface-500">Total commissions</p><p className="text-xl font-bold text-surface-900 mt-0.5">৳{fmt(total)}</p></Card>
        <Card className="p-4"><p className="text-xs text-surface-500">Total conversions</p><p className="text-xl font-bold text-surface-900 mt-0.5">{commissions.length}</p></Card>
        <Card className="p-4"><p className="text-xs text-surface-500">Pending approval</p><p className="text-xl font-bold text-warning-dark mt-0.5">{pending}</p></Card>
      </div>
      <Card padding={false} className="overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="border-b border-surface-200 bg-surface-50">
              <tr>
                {["Date", "Link code", "Sale value", "Commission", "Notes", "Status"].map((h) => (
                  <th key={h} className="px-4 py-3 text-xs font-semibold uppercase tracking-wide text-surface-600 text-left">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-surface-100">
              {commissions.map((c) => (
                <tr key={c.id} className="hover:bg-surface-50 transition-colors">
                  <td className="px-4 py-3 text-xs text-surface-600 whitespace-nowrap">{new Date(c.created_at).toLocaleDateString("en-BD")}</td>
                  <td className="px-4 py-3"><span className="font-mono text-xs text-brand-700 bg-brand-50 px-1.5 py-0.5 rounded">{c.link_id.slice(0, 8)}…</span></td>
                  <td className="px-4 py-3 font-medium text-right">৳{fmt(c.conversion_value)}</td>
                  <td className="px-4 py-3 font-bold text-success-dark text-right">৳{fmt(c.commission_amount)}</td>
                  <td className="px-4 py-3 text-xs text-surface-600">{c.notes ?? "—"}</td>
                  <td className="px-4 py-3">
                    <select value={c.status} onChange={(e) => handleStatus(c.id, e.target.value as Commission["status"])}
                      className="text-xs rounded-full px-2 py-1 border-0 cursor-pointer focus:outline-none focus:ring-1 focus:ring-brand-500 bg-surface-100 text-surface-700">
                      <option value="pending">Pending</option>
                      <option value="approved">Approved</option>
                      <option value="paid">Paid</option>
                      <option value="rejected">Rejected</option>
                    </select>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}

export default function AffiliatePage() {
  const [tab, setTab]         = useState<"programs" | "commissions">("programs");
  const [programs, setPrograms] = useState<ReferralProgram[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => { listPrograms().then(setPrograms).finally(() => setLoading(false)); }, []);

  const handleDelete = async (id: string) => {
    if (!(await confirmText("Delete this program and all its links?"))) return;
    await deleteProgram(id);
    setPrograms((prev) => prev.filter((p) => p.id !== id));
  };

  return (
    <AppLayout>
      <PageHeader
        title="Affiliate & Referral"
        description="Create referral programs, generate tracking links, and record commissions on conversion."
        actions={
          <div className="flex gap-1 bg-surface-100 rounded-md p-1">
            {(["programs", "commissions"] as const).map((t) => (
              <button key={t} onClick={() => setTab(t)}
                className={`px-4 py-1.5 text-sm font-medium rounded-md transition-colors capitalize ${tab === t ? "bg-white text-surface-900 shadow-sm" : "text-surface-500 hover:text-surface-700"}`}>
                {t}
              </button>
            ))}
          </div>
        }
      />

      {tab === "programs" && (
        <>
          <NewProgramForm onCreated={(p) => setPrograms((prev) => [p, ...prev])} />
          {loading ? (
            <div className="flex justify-center py-12"><Spinner size="lg" /></div>
          ) : programs.length === 0 ? (
            <Card><EmptyState icon={<Link2 size={40} />} title="No programs yet" description="Create one above to start generating referral links." /></Card>
          ) : (
            <div className="space-y-3">
              {programs.map((p) => <ProgramCard key={p.id} program={p} onDelete={() => handleDelete(p.id)} onCommission={() => {}} />)}
            </div>
          )}
        </>
      )}
      {tab === "commissions" && <CommissionsTab />}
    </AppLayout>
  );
}
