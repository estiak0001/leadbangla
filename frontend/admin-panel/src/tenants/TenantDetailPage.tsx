import { FormEvent, useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import {
  AlertTriangle, ArrowLeft, Building2, LogIn, Mail, MapPin, Pencil, PauseCircle, PlayCircle, Plus, Save, StickyNote, Trash2, Wallet, X,
} from "lucide-react";
import AppLayout from "../components/AppLayout";
import Alert from "../components/Alert";
import Badge from "../components/Badge";
import Button from "../components/Button";
import Card from "../components/Card";
import Input from "../components/Input";
import Select from "../components/Select";
import TenantPlanCard from "./TenantPlanCard";
import { COMPANY_SIZE_OPTIONS, INDUSTRY_OPTIONS, industryLabel } from "./tenantOptions";
import {
  addTenantMember, buildImpersonationUrl, changeMemberRole, fetchTenantDetail, impersonate, removeTenantMember, resendMemberInvite,
  suspendTenant, unsuspendTenant, updateTenant, type TenantDetail, type TenantProfileEdit,
} from "../lib/admin";
import { adjustWallet } from "../lib/wallets";

const fmt = (ts: string) => new Date(ts).toLocaleDateString("en-BD", { year: "numeric", month: "short", day: "numeric" });

function Field({ label, value }: { label: string; value: React.ReactNode }) {
  return <div className="min-w-0"><p className="text-[11px] uppercase tracking-wide text-surface-400">{label}</p><p className="text-sm font-medium text-surface-800 truncate">{value || <span className="text-surface-300">—</span>}</p></div>;
}

function Modal({ title, onClose, children, wide }: { title: string; onClose: () => void; children: React.ReactNode; wide?: boolean }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-surface-900/40 backdrop-blur-sm p-4" onClick={onClose}>
      <div className={`bg-white rounded-2xl shadow-2xl w-full ${wide ? "max-w-2xl" : "max-w-md"} max-h-[90vh] overflow-y-auto`} role="dialog" aria-modal="true" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between px-4 py-3.5 border-b border-surface-100"><h2 className="font-semibold text-surface-900">{title}</h2>
          <button onClick={onClose} className="p-1 rounded text-surface-400 hover:bg-surface-100" aria-label="Close"><X size={18} /></button></div>
        {children}
      </div>
    </div>
  );
}

export default function TenantDetailPage() {
  const { orgId = "" } = useParams<{ orgId: string }>();
  const navigate = useNavigate();
  const [t, setT] = useState<TenantDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState<Record<string, string>>({});
  const [addOpen, setAddOpen] = useState(false);
  const [newMember, setNewMember] = useState({ email: "", role: "member", invite: true });
  const [creditOpen, setCreditOpen] = useState(false);
  const [credit, setCredit] = useState({ amount: "", note: "", sign: 1 });
  const [suspendOpen, setSuspendOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [notes, setNotes] = useState("");
  const [removing, setRemoving] = useState<string | null>(null);

  const fail = (e: unknown) => {
    if (e instanceof Error && e.message === "UNAUTHORIZED") { navigate("/login"); return; }
    setError(e instanceof Error ? e.message : "Something went wrong");
  };
  const load = () => fetchTenantDetail(orgId).then((d) => { setT(d); setNotes(d.internal_notes ?? ""); }).catch(fail);
  useEffect(() => { load(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [orgId]);

  async function run<R>(key: string, fn: () => Promise<R>, ok?: string): Promise<R | undefined> {
    setBusy(key); setError(null); setNotice(null);
    try { const r = await fn(); if (ok) setNotice(ok); return r; } catch (e) { fail(e); } finally { setBusy(null); }
  }
  const apply = (key: string, fn: () => Promise<TenantDetail>, ok?: string) => run(key, fn, ok).then((d) => { if (d) { setT(d); setNotes(d.internal_notes ?? ""); } return d; });

  if (!t) return <AppLayout><div className="py-16 text-center text-sm text-surface-400">{error ?? "Loading company…"}</div></AppLayout>;

  function openEdit() {
    setForm({
      name: t!.name, display_name: t!.display_name ?? "", language: t!.language, phone: t!.phone ?? "", website: t!.website ?? "", industry: t!.industry ?? INDUSTRY_OPTIONS[0].value,
      company_size: t!.company_size ?? COMPANY_SIZE_OPTIONS[0], contact_email: t!.contact_email ?? "", address: t!.address ?? "", city: t!.city ?? "", country: t!.country ?? "",
      trade_license_no: t!.trade_license_no ?? "", tin: t!.tin ?? "",
    });
    setEditing(true);
  }
  async function saveProfile(e: FormEvent) {
    e.preventDefault();
    if (await apply("profile", () => updateTenant(orgId, form as TenantProfileEdit), "Company details saved.")) setEditing(false);
  }
  async function addMember(e: FormEvent) {
    e.preventDefault();
    if (await apply("add", () => addTenantMember(orgId, newMember.email.trim(), newMember.role, newMember.invite), "Person added.")) { setAddOpen(false); setNewMember({ email: "", role: "member", invite: true }); }
  }
  async function submitCredit(e: FormEvent) {
    e.preventDefault();
    const amt = Number(credit.amount) * credit.sign;
    if (await run("credit", () => adjustWallet(orgId, amt, credit.note || (amt > 0 ? "Credit added by staff" : "Adjustment by staff")), "Wallet updated.")) { setCreditOpen(false); setCredit({ amount: "", note: "", sign: 1 }); load(); }
  }
  async function loginAs(userId: string) {
    const r = await run(`login-${userId}`, () => impersonate(orgId, userId));
    if (r) window.open(buildImpersonationUrl(r.access_token), "_blank");
  }

  return (
    <AppLayout>
      <Link to="/tenants" className="inline-flex items-center gap-1.5 text-sm text-surface-500 hover:text-brand-600 font-medium mb-2"><ArrowLeft size={14} /> Tenants</Link>

      {/* Header */}
      <div className="flex items-start justify-between gap-4 flex-wrap mb-4">
        <div className="flex items-center gap-3 min-w-0">
          <span className="w-12 h-12 rounded-xl bg-brand-50 text-brand-600 flex items-center justify-center flex-shrink-0"><Building2 size={24} /></span>
          <div className="min-w-0">
            <div className="flex items-center gap-2.5 flex-wrap">
              <h1 className="text-xl font-bold text-surface-900 tracking-tight">{t.name}</h1>
              {t.is_suspended ? <Badge variant="danger" dot>Suspended</Badge> : <Badge variant="success" dot>Active</Badge>}
              {t.plan_name && <Badge variant="primary">{t.plan_name}</Badge>}
            </div>
            <p className="text-sm text-surface-500">{t.display_name ? `${t.display_name} · ` : ""}Joined {fmt(t.created_at)} · {t.owner_email ?? "no owner"}</p>
          </div>
        </div>
        <div className="flex gap-2">
          <Button size="sm" variant="secondary" icon={<Pencil size={14} />} onClick={openEdit}>Edit company</Button>
          {t.is_suspended
            ? <Button size="sm" icon={<PlayCircle size={14} />} loading={busy === "unsuspend"} onClick={() => apply("unsuspend", () => unsuspendTenant(orgId), "Company reactivated.")}>Reactivate</Button>
            : <Button size="sm" variant="ghost" className="text-danger-base hover:bg-danger-light" icon={<PauseCircle size={14} />} onClick={() => { setReason(""); setSuspendOpen(true); }}>Suspend</Button>}
        </div>
      </div>

      {error && <Alert className="mb-3" onDismiss={() => setError(null)}>{error}</Alert>}
      {notice && <Alert variant="success" className="mb-3" onDismiss={() => setNotice(null)}>{notice}</Alert>}
      {t.is_suspended && <Alert variant="warning" className="mb-3">This company is suspended — its people can't log in.{t.suspended_reason && ` Reason: ${t.suspended_reason}.`}</Alert>}

      <TenantPlanCard orgId={orgId} onChanged={load} />

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-4 mb-4 items-start">
        {/* Company details */}
        <Card className="xl:col-span-2 !p-4 sm:!p-4">
          <div className="flex items-center justify-between mb-4"><h2 className="text-sm font-semibold text-surface-800">Company details</h2>
            <button onClick={openEdit} className="text-xs font-medium text-brand-600 hover:text-brand-700 inline-flex items-center gap-1"><Pencil size={12} /> Edit</button></div>
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-x-6 gap-y-3.5">
            <Field label="Industry" value={industryLabel(t.industry)} />
            <Field label="Company size" value={t.company_size && `${t.company_size} people`} />
            <Field label="Language" value={t.language === "bn" ? "বাংলা" : "English"} />
            <Field label="Phone" value={t.phone} />
            <Field label="Contact email" value={t.contact_email && <span className="inline-flex items-center gap-1"><Mail size={12} />{t.contact_email}</span>} />
            <Field label="Website" value={t.website} />
            <Field label="Address" value={[t.address, t.city, t.country].filter(Boolean).join(", ") && <span className="inline-flex items-center gap-1"><MapPin size={12} />{[t.address, t.city, t.country].filter(Boolean).join(", ")}</span>} />
            <Field label="Trade license no." value={t.trade_license_no} />
            <Field label="TIN" value={t.tin} />
          </div>
        </Card>

        {/* Wallet */}
        <Card className="!p-4 sm:!p-4">
          <div className="flex items-center gap-2 mb-1"><Wallet size={15} className="text-surface-500" /><h2 className="text-sm font-semibold text-surface-800">Wallet</h2></div>
          <p className="text-3xl font-bold text-surface-900 tabular-nums">৳{t.wallet_balance_bdt.toLocaleString("en-BD", { minimumFractionDigits: 2 })}</p>
          <p className="text-xs text-surface-500">Used for SMS, WhatsApp and email overage.</p>
          <div className="mt-3 flex gap-2"><Button size="sm" icon={<Plus size={14} />} onClick={() => { setCredit({ amount: "", note: "", sign: 1 }); setCreditOpen(true); }}>Add / remove credit</Button>
            <Link to="/wallets"><Button size="sm" variant="ghost">History</Button></Link></div>
        </Card>
      </div>

      {/* People */}
      <Card padding={false} className="mb-4 overflow-hidden">
        <div className="flex items-center justify-between px-4 sm:px-5 py-3 border-b border-surface-100">
          <h2 className="text-sm font-semibold text-surface-800">People <span className="text-surface-400 font-normal">({t.members.length})</span></h2>
          <Button size="sm" variant="secondary" icon={<Plus size={14} />} onClick={() => setAddOpen(true)}>Add person</Button>
        </div>
        <div className="divide-y divide-surface-100">
          {t.members.map((m) => (
            <div key={m.user_id} className="px-4 sm:px-5 py-3 flex items-center justify-between gap-3 flex-wrap">
              <div className="flex items-center gap-3 min-w-0">
                <span className="w-9 h-9 rounded-full bg-brand-50 text-brand-700 flex items-center justify-center text-sm font-bold uppercase flex-shrink-0">{m.email[0]}</span>
                <div className="min-w-0"><p className="text-sm font-medium text-surface-900 truncate">{m.email}</p><p className="text-xs text-surface-500">Joined {fmt(m.joined_at)}</p></div>
              </div>
              <div className="flex items-center gap-2 flex-wrap">
                <select value={m.role} disabled={busy === `role-${m.user_id}`} onChange={(e) => apply(`role-${m.user_id}`, () => changeMemberRole(orgId, m.user_id, e.target.value), "Role updated.")}
                  className="rounded-md border border-surface-200 bg-white px-2 py-1 text-xs focus:border-brand-500 focus:outline-none">
                  <option value="owner">Owner</option><option value="admin">Admin</option><option value="member">Member</option><option value="sales">Sales (own leads only)</option>
                </select>
                <Button size="xs" variant="secondary" icon={<Mail size={12} />} loading={busy === `inv-${m.user_id}`} onClick={() => run(`inv-${m.user_id}`, () => resendMemberInvite(orgId, m.user_id), `Invite sent to ${m.email}.`)}>Resend invite</Button>
                <Button size="xs" variant="secondary" icon={<LogIn size={12} />} loading={busy === `login-${m.user_id}`} onClick={() => loginAs(m.user_id)}>Log in as</Button>
                <button onClick={() => setRemoving(m.user_id)} aria-label="Remove" className="p-1.5 rounded text-surface-400 hover:bg-danger-light hover:text-danger-base"><Trash2 size={14} /></button>
              </div>
            </div>
          ))}
        </div>
      </Card>

      {/* Private notes */}
      <Card className="!p-4 sm:!p-4">
        <div className="flex items-center gap-2 mb-2"><StickyNote size={15} className="text-surface-500" /><h2 className="text-sm font-semibold text-surface-800">Private notes</h2><span className="text-xs text-surface-400">only your team sees these</span></div>
        <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={4} maxLength={4000} placeholder="Agreements, special terms, who to call…"
          className="block w-full rounded-md border border-surface-200 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/20" />
        <div className="mt-2 flex justify-end"><Button size="sm" icon={<Save size={14} />} disabled={notes === (t.internal_notes ?? "")} loading={busy === "notes"} onClick={() => apply("notes", () => updateTenant(orgId, { internal_notes: notes }), "Notes saved.")}>Save notes</Button></div>
      </Card>

      {/* Edit company */}
      {editing && (
        <Modal title="Edit company" wide onClose={() => setEditing(false)}>
          <form onSubmit={saveProfile}>
            <div className="p-4 grid sm:grid-cols-2 gap-3">
              <Input inputSize="sm" label="Company name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required minLength={2} />
              <Input inputSize="sm" label="Trading / branch name" value={form.display_name} onChange={(e) => setForm({ ...form, display_name: e.target.value })} />
              <Select selectSize="sm" label="Industry" value={form.industry} onChange={(e) => setForm({ ...form, industry: e.target.value })}>{INDUSTRY_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}</Select>
              <Select selectSize="sm" label="Company size" value={form.company_size} onChange={(e) => setForm({ ...form, company_size: e.target.value })}>{COMPANY_SIZE_OPTIONS.map((o) => <option key={o} value={o}>{o} people</option>)}</Select>
              <Select selectSize="sm" label="Language" value={form.language} onChange={(e) => setForm({ ...form, language: e.target.value })}><option value="bn">বাংলা</option><option value="en">English</option></Select>
              <Input inputSize="sm" label="Phone" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
              <Input inputSize="sm" label="Contact email" value={form.contact_email} onChange={(e) => setForm({ ...form, contact_email: e.target.value })} />
              <Input inputSize="sm" label="Website" value={form.website} onChange={(e) => setForm({ ...form, website: e.target.value })} />
              <div className="sm:col-span-2"><Input inputSize="sm" label="Address" value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} /></div>
              <Input inputSize="sm" label="City" value={form.city} onChange={(e) => setForm({ ...form, city: e.target.value })} />
              <Input inputSize="sm" label="Country" value={form.country} onChange={(e) => setForm({ ...form, country: e.target.value })} />
              <Input inputSize="sm" label="Trade license no." value={form.trade_license_no} onChange={(e) => setForm({ ...form, trade_license_no: e.target.value })} />
              <Input inputSize="sm" label="TIN" value={form.tin} onChange={(e) => setForm({ ...form, tin: e.target.value })} />
            </div>
            <div className="flex justify-end gap-2 px-4 py-3.5 border-t border-surface-100"><Button type="button" size="sm" variant="ghost" onClick={() => setEditing(false)}>Cancel</Button><Button type="submit" size="sm" loading={busy === "profile"}>Save changes</Button></div>
          </form>
        </Modal>
      )}

      {/* Add person */}
      {addOpen && (
        <Modal title="Add a person" onClose={() => setAddOpen(false)}>
          <form onSubmit={addMember}>
            <div className="p-4 space-y-3">
              <Input inputSize="sm" label="Email" type="email" value={newMember.email} onChange={(e) => setNewMember({ ...newMember, email: e.target.value })} required autoFocus />
              <Select selectSize="sm" label="Role" value={newMember.role} onChange={(e) => setNewMember({ ...newMember, role: e.target.value })}><option value="member">Member</option><option value="sales">Sales (own leads only)</option><option value="admin">Admin</option><option value="owner">Owner</option></Select>
              <label className="flex items-start gap-2 text-sm text-surface-700 cursor-pointer"><input type="checkbox" className="mt-1" checked={newMember.invite} onChange={(e) => setNewMember({ ...newMember, invite: e.target.checked })} /><span>Email them a link to set a password</span></label>
              <p className="text-xs text-surface-500">A person can belong to one company only.</p>
            </div>
            <div className="flex justify-end gap-2 px-4 py-3.5 border-t border-surface-100"><Button type="button" size="sm" variant="ghost" onClick={() => setAddOpen(false)}>Cancel</Button><Button type="submit" size="sm" loading={busy === "add"}>Add person</Button></div>
          </form>
        </Modal>
      )}

      {/* Wallet credit */}
      {creditOpen && (
        <Modal title="Adjust wallet" onClose={() => setCreditOpen(false)}>
          <form onSubmit={submitCredit}>
            <div className="p-4 space-y-3">
              <div className="flex gap-1 bg-surface-100 p-0.5 rounded-md w-fit">
                {([[1, "Add credit"], [-1, "Remove credit"]] as const).map(([s, label]) => <button type="button" key={s} onClick={() => setCredit({ ...credit, sign: s })} className={`px-3 py-1 rounded text-xs font-medium ${credit.sign === s ? "bg-white shadow-sm text-surface-900" : "text-surface-600"}`}>{label}</button>)}
              </div>
              <Input inputSize="sm" label="Amount (৳)" type="number" min={1} step="1" value={credit.amount} onChange={(e) => setCredit({ ...credit, amount: e.target.value })} required autoFocus />
              <Input inputSize="sm" label="Reason" value={credit.note} onChange={(e) => setCredit({ ...credit, note: e.target.value })} placeholder="e.g. bKash payment received, refund, goodwill" />
            </div>
            <div className="flex justify-end gap-2 px-4 py-3.5 border-t border-surface-100"><Button type="button" size="sm" variant="ghost" onClick={() => setCreditOpen(false)}>Cancel</Button><Button type="submit" size="sm" loading={busy === "credit"} disabled={!credit.amount}>Apply</Button></div>
          </form>
        </Modal>
      )}

      {/* Suspend */}
      {suspendOpen && (
        <Modal title="Suspend this company?" onClose={() => setSuspendOpen(false)}>
          <div className="p-4">
            <div className="flex items-start gap-3"><span className="w-10 h-10 rounded-full bg-danger-light text-danger-base flex items-center justify-center flex-shrink-0"><AlertTriangle size={18} /></span>
              <p className="text-sm text-surface-600">Everyone in {t.name} is locked out until you reactivate it. Their data is kept and nothing is deleted.</p></div>
            <input value={reason} onChange={(e) => setReason(e.target.value)} maxLength={300} placeholder="Reason (shown to them), e.g. unpaid invoice" className="mt-3 w-full rounded-md border border-surface-200 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/20" />
          </div>
          <div className="flex justify-end gap-2 px-4 py-3.5 border-t border-surface-100"><Button size="sm" variant="ghost" onClick={() => setSuspendOpen(false)}>Cancel</Button>
            <Button size="sm" variant="danger" loading={busy === "suspend"} onClick={async () => { if (await apply("suspend", () => suspendTenant(orgId, reason), "Company suspended.")) setSuspendOpen(false); }}>Suspend</Button></div>
        </Modal>
      )}

      {/* Remove person */}
      {removing && (
        <Modal title="Remove this person?" onClose={() => setRemoving(null)}>
          <div className="p-4 text-sm text-surface-600">{t.members.find((m) => m.user_id === removing)?.email} will lose access to {t.name}. Their login is kept, but they won't belong to any company.</div>
          <div className="flex justify-end gap-2 px-4 py-3.5 border-t border-surface-100"><Button size="sm" variant="ghost" onClick={() => setRemoving(null)}>Cancel</Button>
            <Button size="sm" variant="danger" loading={busy === "remove"} onClick={async () => { if (await apply("remove", () => removeTenantMember(orgId, removing), "Person removed.")) setRemoving(null); }}>Remove</Button></div>
        </Modal>
      )}
    </AppLayout>
  );
}
