import { FormEvent, useEffect, useState } from "react";
import { Star } from "lucide-react";
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
import { listLinks, ReferralLink } from "../../lib/affiliate";
import {
  createDeliverable, createInfluencer, deleteDeliverable, deleteInfluencer,
  Deliverable, DELIVERABLE_TYPES, Influencer, listDeliverables, listInfluencers,
  OUTREACH_STATUSES, PLATFORMS, updateDeliverable, updateInfluencer,
} from "../../lib/influencer";
import { confirmText } from "../../components/ConfirmDialog";

const OUTREACH_BADGE: Record<string, "default" | "info" | "primary" | "warning" | "success" | "danger"> = {
  new: "default", contacted: "info", replied: "primary", agreed: "warning", completed: "success", rejected: "danger",
};
const PLATFORM_EMOJI: Record<string, string> = {
  instagram: "📸", youtube: "🎬", tiktok: "🎵", facebook: "👤", twitter: "🐦", linkedin: "💼", blog: "✍️", other: "🌐",
};
function fmt(n: number) { return n >= 1_000_000 ? `${(n / 1_000_000).toFixed(1)}M` : n >= 1_000 ? `${(n / 1_000).toFixed(1)}k` : String(n); }

function DeliverableRow({ d, availableLinks, onUpdate, onDelete }: { d: Deliverable; availableLinks: ReferralLink[]; onUpdate: (u: Deliverable) => void; onDelete: () => void }) {
  const [assigning, setAssigning] = useState(false);
  const [selectedLink, setSelectedLink] = useState(d.referral_link_id ?? "");

  const handleStatusChange = async (status: string) => { onUpdate(await updateDeliverable(d.id, { status: status as Deliverable["status"] })); };
  const handleAssignLink = async () => { onUpdate(await updateDeliverable(d.id, { referral_link_id: selectedLink || null } as any)); setAssigning(false); };

  return (
    <div className="rounded-md border border-surface-200 bg-surface-50 p-3">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 mb-1 flex-wrap">
            <Badge size="sm">{d.type.replace("_", " ")}</Badge>
            <select value={d.status} onChange={(e) => handleStatusChange(e.target.value)}
              className="text-xs rounded-full px-2 py-0.5 border-0 cursor-pointer focus:outline-none bg-surface-200 text-surface-700">
              <option value="pending">Pending</option>
              <option value="submitted">Submitted</option>
              <option value="approved">Approved</option>
              <option value="rejected">Rejected</option>
            </select>
            {d.due_date && <span className="text-xs text-surface-600">Due {d.due_date}</span>}
          </div>
          <p className="text-sm text-surface-700">{d.description}</p>
        </div>
        <Button size="xs" variant="danger" onClick={onDelete}>Remove</Button>
      </div>
      <div className="mt-2 pt-2 border-t border-surface-200">
        {d.referral_link_id && d.referral_link_code ? (
          <div className="flex items-center gap-4 flex-wrap text-xs">
            <span className="text-surface-400">Link: <span className="font-mono text-brand-700 bg-brand-50 px-1.5 py-0.5 rounded">{d.referral_link_code}</span></span>
            <span className="text-surface-500"><span className="font-bold text-info-dark">{d.outcome_clicks}</span> clicks · <span className="font-bold text-success-dark">{d.outcome_conversions}</span> conv.</span>
            <button onClick={() => { setAssigning(true); setSelectedLink(d.referral_link_id ?? ""); }} className="text-surface-400 hover:text-surface-600 underline">Change link</button>
          </div>
        ) : (
          <button onClick={() => setAssigning(true)} className="text-xs text-brand-600 hover:text-brand-700 font-medium">+ Assign referral link to track ROI</button>
        )}
        {assigning && (
          <div className="mt-2 flex items-center gap-2 flex-wrap">
            <select value={selectedLink} onChange={(e) => setSelectedLink(e.target.value)}
              className="flex-1 border border-surface-200 rounded-md px-2 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-brand-500/20">
              <option value="">— No link (untrack) —</option>
              {availableLinks.map((l) => <option key={l.id} value={l.id}>{l.code} ({l.clicks} clicks, {l.conversions} conv.)</option>)}
            </select>
            <Button size="xs" onClick={handleAssignLink}>Save</Button>
            <Button size="xs" variant="ghost" onClick={() => setAssigning(false)}>Cancel</Button>
          </div>
        )}
      </div>
    </div>
  );
}

function InfluencerCard({ influencer, availableLinks, onDelete, onStatusChange }: { influencer: Influencer; availableLinks: ReferralLink[]; onDelete: () => void; onStatusChange: (u: Influencer) => void }) {
  const [expanded, setExpanded] = useState(false);
  const [deliverables, setDeliverables] = useState<Deliverable[]>([]);
  const [loadingDel, setLoadingDel] = useState(false);
  const [showNewDel, setShowNewDel] = useState(false);
  const [newDel, setNewDel] = useState({ type: "post", description: "", due_date: "", referral_link_id: "" });
  const [savingDel, setSavingDel] = useState(false);
  const [err, setErr] = useState("");

  const loadDeliverables = async () => { setLoadingDel(true); try { setDeliverables(await listDeliverables(influencer.id)); } finally { setLoadingDel(false); } };
  const handleExpand = () => { if (!expanded) loadDeliverables(); setExpanded((v) => !v); };
  const handleStatusChange = async (status: string) => { onStatusChange(await updateInfluencer(influencer.id, { outreach_status: status as Influencer["outreach_status"] })); };
  const handleAddDeliverable = async (e: FormEvent) => {
    e.preventDefault(); setSavingDel(true); setErr("");
    try {
      const d = await createDeliverable(influencer.id, { type: newDel.type, description: newDel.description, due_date: newDel.due_date || null, referral_link_id: newDel.referral_link_id || null });
      setDeliverables((prev) => [d, ...prev]);
      setNewDel({ type: "post", description: "", due_date: "", referral_link_id: "" });
      setShowNewDel(false);
    } catch (ex: any) { setErr(ex.message); }
    finally { setSavingDel(false); }
  };
  const handleDeleteDeliverable = async (id: string) => { if (!(await confirmText("Remove this deliverable?"))) return; await deleteDeliverable(id); setDeliverables((prev) => prev.filter((d) => d.id !== id)); };
  const totalClicks = deliverables.reduce((s, d) => s + d.outcome_clicks, 0);
  const totalConversions = deliverables.reduce((s, d) => s + d.outcome_conversions, 0);

  return (
    <Card>
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 flex-wrap mb-1">
            <span className="text-base">{PLATFORM_EMOJI[influencer.platform] ?? "🌐"}</span>
            <span className="font-semibold text-surface-900">{influencer.name}</span>
            {influencer.handle && <span className="text-sm text-surface-600">@{influencer.handle}</span>}
            <select value={influencer.outreach_status} onChange={(e) => handleStatusChange(e.target.value)}
              className="text-xs rounded-full px-2 py-0.5 border-0 cursor-pointer focus:outline-none bg-surface-100 text-surface-600">
              {OUTREACH_STATUSES.map((s) => <option key={s} value={s}>{s.charAt(0).toUpperCase() + s.slice(1)}</option>)}
            </select>
          </div>
          <div className="flex items-center gap-3 text-xs text-surface-600 flex-wrap">
            <span>{fmt(influencer.followers)} followers</span>
            {influencer.niche && <span>· {influencer.niche}</span>}
            {influencer.engagement_rate != null && <span>· {influencer.engagement_rate}% eng.</span>}
            {influencer.email && <span>· {influencer.email}</span>}
            {expanded && deliverables.length > 0 && (
              <><span className="text-info-dark font-medium">· {totalClicks} clicks</span><span className="text-success-dark font-medium">· {totalConversions} conversions</span></>
            )}
          </div>
          {influencer.notes && <p className="text-xs text-surface-600 mt-1 italic">{influencer.notes}</p>}
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          <Button size="xs" variant="secondary" onClick={handleExpand}>{expanded ? "Hide" : "Deliverables"}</Button>
          <Button size="xs" variant="danger" onClick={onDelete}>Delete</Button>
        </div>
      </div>

      {expanded && (
        <div className="mt-4 border-t border-surface-100 pt-4 space-y-3">
          <div className="flex items-center justify-between">
            <span className="section-label">Deliverables</span>
            <Button size="xs" onClick={() => setShowNewDel((v) => !v)}>+ Add</Button>
          </div>
          {showNewDel && (
            <form onSubmit={handleAddDeliverable} className="rounded-md border border-brand-100 bg-brand-50 p-3 space-y-2 animate-slide-up">
              <div className="flex gap-2 flex-wrap">
                <select value={newDel.type} onChange={(e) => setNewDel((p) => ({ ...p, type: e.target.value }))}
                  className="border border-surface-200 rounded-md px-2 py-1.5 text-xs focus:outline-none">
                  {DELIVERABLE_TYPES.map((t) => <option key={t} value={t}>{t.replace("_", " ")}</option>)}
                </select>
                <input type="date" value={newDel.due_date} onChange={(e) => setNewDel((p) => ({ ...p, due_date: e.target.value }))}
                  className="border border-surface-200 rounded-md px-2 py-1.5 text-xs focus:outline-none" />
              </div>
              <input type="text" required placeholder="Description (e.g. Instagram post featuring product launch)" value={newDel.description}
                onChange={(e) => setNewDel((p) => ({ ...p, description: e.target.value }))}
                className="w-full border border-surface-200 rounded-md px-2 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-brand-500/20" />
              <select value={newDel.referral_link_id} onChange={(e) => setNewDel((p) => ({ ...p, referral_link_id: e.target.value }))}
                className="w-full border border-surface-200 rounded-md px-2 py-1.5 text-xs focus:outline-none">
                <option value="">— No referral link yet —</option>
                {availableLinks.map((l) => <option key={l.id} value={l.id}>{l.code} ({l.clicks} clicks)</option>)}
              </select>
              {err && <Alert variant="error">{err}</Alert>}
              <div className="flex gap-2">
                <Button type="submit" size="xs" loading={savingDel}>Save</Button>
                <Button type="button" size="xs" variant="ghost" onClick={() => setShowNewDel(false)}>Cancel</Button>
              </div>
            </form>
          )}
          {loadingDel ? <Spinner size="sm" />
            : deliverables.length === 0 ? <p className="text-xs text-surface-600">No deliverables yet.</p>
            : deliverables.map((d) => (
              <DeliverableRow key={d.id} d={d} availableLinks={availableLinks}
                onUpdate={(u) => setDeliverables((prev) => prev.map((x) => (x.id === u.id ? u : x)))}
                onDelete={() => handleDeleteDeliverable(d.id)} />
            ))
          }
        </div>
      )}
    </Card>
  );
}

const EMPTY = { name: "", handle: "", platform: "instagram", followers: 0, niche: "", engagement_rate: "", email: "", phone: "", outreach_status: "new", notes: "" };

function NewInfluencerForm({ onCreated }: { onCreated: (i: Influencer) => void }) {
  const [form, setForm] = useState(EMPTY);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState("");
  const set = (k: keyof typeof EMPTY, v: string | number) => setForm((p) => ({ ...p, [k]: v }));

  const submit = async (e: FormEvent) => {
    e.preventDefault(); setLoading(true); setErr("");
    try {
      onCreated(await createInfluencer({ ...form, followers: Number(form.followers), engagement_rate: form.engagement_rate ? Number(form.engagement_rate) : null, handle: form.handle || null, niche: form.niche || null, email: form.email || null, phone: form.phone || null, notes: form.notes || null, contact_id: null, outreach_status: form.outreach_status as Influencer["outreach_status"] }));
      setForm(EMPTY);
    } catch (ex: any) { setErr(ex.message); }
    finally { setLoading(false); }
  };

  return (
    <Card className="mb-5">
      <h3 className="text-sm font-semibold text-surface-800 mb-4">Add Influencer</h3>
      <form onSubmit={submit} className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div className="sm:col-span-2"><Input label="Name *" type="text" required value={form.name} onChange={(e) => set("name", e.target.value)} placeholder="Rahim's Tech Reviews" /></div>
        <Select label="Platform" value={form.platform} onChange={(e) => set("platform", e.target.value)}>
          {PLATFORMS.map((p) => <option key={p} value={p}>{p}</option>)}
        </Select>
        <Input label="Handle / Username" type="text" value={form.handle} onChange={(e) => set("handle", e.target.value)} placeholder="@username" />
        <Input label="Followers" type="number" min="0" value={form.followers} onChange={(e) => set("followers", e.target.value)} />
        <Input label="Engagement rate %" type="number" step="0.01" min="0" max="100" value={form.engagement_rate} onChange={(e) => set("engagement_rate", e.target.value)} placeholder="4.5" />
        <Input label="Niche" type="text" value={form.niche} onChange={(e) => set("niche", e.target.value)} placeholder="tech / lifestyle / food" />
        <Input label="Email" type="email" value={form.email} onChange={(e) => set("email", e.target.value)} />
        <Select label="Outreach status" value={form.outreach_status} onChange={(e) => set("outreach_status", e.target.value)}>
          {OUTREACH_STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
        </Select>
        <div className="sm:col-span-3"><Input label="Notes" type="text" value={form.notes} onChange={(e) => set("notes", e.target.value)} placeholder="Internal notes" /></div>
        {err && <div className="sm:col-span-3"><Alert variant="error">{err}</Alert></div>}
        <div className="sm:col-span-3"><Button type="submit" size="sm" loading={loading}>Add Influencer</Button></div>
      </form>
    </Card>
  );
}

export default function InfluencersPage() {
  const [influencers, setInfluencers] = useState<Influencer[]>([]);
  const [links, setLinks]             = useState<ReferralLink[]>([]);
  const [loading, setLoading]         = useState(true);

  useEffect(() => {
    Promise.all([listInfluencers(), listLinks()]).then(([inf, lnk]) => { setInfluencers(inf); setLinks(lnk); }).finally(() => setLoading(false));
  }, []);

  const handleDelete = async (id: string) => {
    if (!(await confirmText("Delete this influencer and all their deliverables?"))) return;
    await deleteInfluencer(id);
    setInfluencers((prev) => prev.filter((i) => i.id !== id));
  };

  const statusCounts = OUTREACH_STATUSES.reduce((acc, s) => { acc[s] = influencers.filter((i) => i.outreach_status === s).length; return acc; }, {} as Record<string, number>);

  return (
    <AppLayout>
      <PageHeader title="Influencer Marketing" description="Track influencers, outreach status, deliverables and ROI via referral link data." />

      {influencers.length > 0 && (
        <div className="flex items-center gap-2 flex-wrap mb-5">
          {OUTREACH_STATUSES.filter((s) => statusCounts[s] > 0).map((s) => (
            <Badge key={s} variant={OUTREACH_BADGE[s] ?? "default"} size="sm" dot>{statusCounts[s]} {s}</Badge>
          ))}
        </div>
      )}

      <NewInfluencerForm onCreated={(i) => setInfluencers((prev) => [i, ...prev])} />

      {loading ? <div className="flex justify-center py-12"><Spinner size="lg" /></div>
        : influencers.length === 0 ? <Card><EmptyState icon={<Star size={40} />} title="No influencers yet" description="Add your first influencer above to start tracking outreach." /></Card>
        : <div className="space-y-3">{influencers.map((inf) => <InfluencerCard key={inf.id} influencer={inf} availableLinks={links} onDelete={() => handleDelete(inf.id)} onStatusChange={(u) => setInfluencers((prev) => prev.map((i) => (i.id === u.id ? u : i)))} />)}</div>
      }
    </AppLayout>
  );
}
