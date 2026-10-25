import { ChangeEvent, FormEvent, Fragment, useEffect, useRef, useState } from "react";
import { CheckCircle2, Circle, Download, ExternalLink, FileUp, Loader2, MessageSquareWarning, Trash2, XCircle } from "lucide-react";
import Alert from "../../components/Alert";
import Badge from "../../components/Badge";
import Button from "../../components/Button";
import Card from "../../components/Card";
import Input from "../../components/Input";
import Spinner from "../../components/Spinner";
import { useConfirm } from "../../components/ConfirmDialog";
import {
  STATUS_META, cancelVerification, createVerification, deleteVerificationDoc, fetchVerifications,
  openVerificationDoc, uploadVerificationDoc, type Requirement, type VerificationKind, type VerificationRequest,
} from "../../lib/verifications";
import { formatDate } from "./shared";

interface Props {
  kind: VerificationKind;
  valueLabel: string;
  valuePlaceholder: string;
  valueHelp?: string;
  /** Shown on the form, e.g. the one-time Sender ID fee. */
  formNote?: string;
  maxLength?: number;
  onChange?: () => void;
}

const STEPS = ["Request", "Documents", "Review", "Operator", "Approved"];

function stepIndex(r: VerificationRequest): number {
  if (r.status === "approved") return 5;
  if (r.status === "rejected" || r.status === "cancelled") return -1;
  if (r.missing_required.length > 0 || r.status === "needs_info") return 1;
  if (r.status === "submitted") return 3;
  return 2;
}

/** A starting text for the official application form; the customer puts it on their letterhead. */
function downloadApplicationSample(senderId: string) {
  const text = `[Your organisation's letterhead / pad]

Date: ____ / ____ / ________

To
The Manager, SMS Services
LeadBangla

Subject: Application for a masking SMS Sender ID "${senderId}"

Dear Sir / Madam,

We request approval of the masking Sender ID "${senderId}" so that we can send SMS to our customers
under our organisation's name.

Organisation name : ____________________________
Address           : ____________________________
Trade license no. : ____________________________   (or institution registration no.)
Authorised person : ____________________________
Designation       : ____________________________
Mobile            : ____________________________
Email             : ____________________________

We confirm that the SMS will be sent only to people who agreed to receive messages from us, and will follow
the rules set by BTRC and the SMS operator.

Sincerely,

(Signature)                          [Organisation seal]
Name and designation
`;
  const url = URL.createObjectURL(new Blob([text], { type: "text/plain;charset=utf-8" }));
  const a = document.createElement("a");
  a.href = url; a.download = "sender-id-application-sample.txt"; a.click();
  URL.revokeObjectURL(url);
}

const fmtSize = (n: number) => (n > 1024 * 1024 ? `${(n / 1024 / 1024).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1024))} KB`);

export default function VerificationPanel({ kind, valueLabel, valuePlaceholder, valueHelp, formNote, maxLength = 20, onChange }: Props) {
  const confirmAsk = useConfirm();
  const [items, setItems] = useState<VerificationRequest[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [value, setValue] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const uploadFor = useRef<Requirement | null>(null);

  const load = () => fetchVerifications(kind).then(setItems).catch(() => setError("Failed to load your requests"));
  useEffect(() => { load(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [kind]);

  const open = items?.find((r) => r.status === "pending" || r.status === "needs_info" || r.status === "submitted") ?? null;
  const latest = open ?? items?.[0] ?? null;
  const active = latest && latest.status !== "cancelled" ? latest : null;
  const history = (items ?? []).filter((r) => r.id !== active?.id);

  const replace = (r: VerificationRequest) => setItems((prev) => [r, ...(prev ?? []).filter((x) => x.id !== r.id)].sort((a, b) => b.created_at.localeCompare(a.created_at)));
  async function run<T>(key: string, fn: () => Promise<T>) {
    setBusy(key); setError(null);
    try { return await fn(); } catch (e) { setError(e instanceof Error ? e.message : "Something went wrong"); } finally { setBusy(null); }
  }

  async function submit(e: FormEvent) {
    e.preventDefault();
    const r = await run("create", () => createVerification(kind, value.trim(), note));
    if (r) { replace(r); setValue(""); setNote(""); onChange?.(); }
  }

  function pick(req: Requirement) { uploadFor.current = req; fileRef.current?.click(); }
  async function onFile(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]; const req = uploadFor.current;
    e.target.value = "";
    if (!file || !req || !open) return;
    if (file.size > 5 * 1024 * 1024) { setError("File is too large (max 5 MB)."); return; }
    const r = await run(`up-${req.type}`, () => uploadVerificationDoc(open.id, req.type, file));
    if (r) { replace(r); onChange?.(); }
  }

  async function removeDoc(req: VerificationRequest, docId: string) {
    const r = await run(`del-${docId}`, () => deleteVerificationDoc(req.id, docId));
    if (r) replace(r);
  }

  async function cancel(req: VerificationRequest) {
    if (!(await confirmAsk({ title: "Cancel this request?", message: "Your documents stay on file, but the request will be closed. You can start a new one any time.", confirmLabel: "Cancel request", tone: "danger" }))) return;
    const r = await run("cancel", () => cancelVerification(req.id));
    if (r) { replace(r); onChange?.(); }
  }

  if (!items) return error ? <Alert variant="error">{error}</Alert> : <div className="py-12 flex justify-center"><Spinner size="lg" /></div>;

  const step = active ? stepIndex(active) : 0;

  return (
    <div className="space-y-4">
      {error && <Alert variant="error" onDismiss={() => setError(null)}>{error}</Alert>}
      <input ref={fileRef} type="file" accept="application/pdf,image/png,image/jpeg" className="hidden" onChange={onFile} />

      {!active || ["cancelled"].includes(active.status) ? null : (
        <Card className="!p-4">
          <div className="flex items-start justify-between gap-3 flex-wrap">
            <div className="min-w-0">
              <p className="text-xs text-surface-500">{valueLabel}</p>
              <p className="text-lg font-bold text-surface-900 font-mono break-all">{active.value}</p>
              <p className="text-xs text-surface-400 mt-0.5">Requested {formatDate(active.created_at)}</p>
            </div>
            <div className="flex items-center gap-2">
              <Badge variant={STATUS_META[active.status].variant} dot>{STATUS_META[active.status].label}</Badge>
              {open && <Button size="xs" variant="ghost" loading={busy === "cancel"} onClick={() => cancel(open)}>Cancel request</Button>}
            </div>
          </div>

          {step >= 0 && (
            <ol className="mt-4 grid grid-cols-5 gap-1.5">
              {STEPS.map((s, i) => {
                const done = i < step; const current = i === step && step < 5;
                return (
                  <li key={s} className="min-w-0">
                    <div className={`h-1.5 rounded-full ${done || step === 5 ? "bg-success-base" : current ? "bg-brand-500" : "bg-surface-200"}`} />
                    <p className={`mt-1 text-[11px] truncate ${current ? "font-semibold text-brand-700" : done || step === 5 ? "text-success-dark" : "text-surface-400"}`}>{s}</p>
                  </li>
                );
              })}
            </ol>
          )}

          {active.admin_note && (
            <div className={`mt-4 flex items-start gap-2.5 rounded-lg border p-3 text-sm ${active.status === "approved" ? "border-success-base/30 bg-success-light" : active.status === "rejected" ? "border-danger-base/30 bg-danger-light" : "border-info-base/30 bg-info-light"}`}>
              <MessageSquareWarning size={16} className="mt-0.5 flex-shrink-0 text-surface-600" />
              <div><p className="text-xs font-semibold text-surface-600">Message from our team</p><p className="text-surface-800 whitespace-pre-line">{active.admin_note}</p></div>
            </div>
          )}
          {active.status === "rejected" && <p className="mt-3 text-sm text-danger-dark flex items-center gap-1.5"><XCircle size={15} /> This request wasn't approved. You can start a new request below.</p>}
          {active.status === "approved" && <p className="mt-3 text-sm text-success-dark flex items-center gap-1.5"><CheckCircle2 size={15} /> Approved — you can use it now.</p>}

          {/* documents */}
          <h3 className="mt-5 text-sm font-semibold text-surface-700">Documents</h3>
          <p className="text-xs text-surface-500 mb-2">PDF, PNG or JPG, up to 5 MB each. Items marked * are required before we can review.</p>
          {active.kind === "sms_sender_id" && open && (
            <button type="button" onClick={() => downloadApplicationSample(active.value)} className="mb-2 inline-flex items-center gap-1.5 text-xs font-medium text-brand-600 hover:text-brand-700">
              <Download size={13} /> Download a sample application text to copy onto your letterhead
            </button>
          )}
          <div className="rounded-lg border border-surface-200 divide-y divide-surface-100">
            {active.requirements.map((r, idx, arr) => {
              const extra = r.type === "other" ? active.documents.filter((d) => d.doc_type === "other") : r.uploaded ? [r.uploaded] : [];
              const firstInGroup = !!r.group && arr[idx - 1]?.group !== r.group;
              const groupDone = !!r.group && arr.some((x) => x.group === r.group && (x.uploaded || active.documents.some((d) => d.doc_type === x.type)));
              return (
                <Fragment key={r.type}>
                {firstInGroup && (
                  <div className={`px-3 py-2 text-xs font-semibold flex items-center gap-2 ${groupDone ? "bg-success-light text-success-dark" : "bg-warning-light text-warning-dark"}`}>
                    {groupDone ? <CheckCircle2 size={14} /> : <Circle size={14} />} Provide one of these: {r.group_label}
                  </div>
                )}
                {r.group && !firstInGroup && <div className="px-3 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-surface-400 bg-surface-50 text-center">— or —</div>}
                <div className="px-3 py-2.5">
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex items-start gap-2 min-w-0">
                      {extra.length > 0 ? <CheckCircle2 size={16} className="mt-0.5 text-success-base flex-shrink-0" /> : <Circle size={16} className="mt-0.5 text-surface-300 flex-shrink-0" />}
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-surface-900">{r.label}{r.required && <span className="ml-1 text-danger-base">*</span>}</p>
                        <p className="text-xs text-surface-500">{r.hint}</p>
                      </div>
                    </div>
                    {open && (
                      <Button size="xs" variant="secondary" icon={busy === `up-${r.type}` ? <Loader2 size={12} className="animate-spin" /> : <FileUp size={12} />} disabled={busy === `up-${r.type}`} onClick={() => pick(r)}>
                        {r.uploaded && r.type !== "other" ? "Replace" : "Upload"}
                      </Button>
                    )}
                  </div>
                  {extra.map((d) => (
                    <div key={d.id} className="mt-1.5 ml-6 flex items-center justify-between gap-2 rounded bg-surface-50 px-2 py-1 text-xs">
                      <button type="button" onClick={() => openVerificationDoc(active.id, d).catch((e) => setError(e.message))} className="flex items-center gap-1.5 min-w-0 text-brand-700 hover:underline">
                        <ExternalLink size={12} className="flex-shrink-0" /><span className="truncate">{d.filename}</span><span className="text-surface-400 flex-shrink-0">· {fmtSize(d.size)}</span>
                      </button>
                      {open && <button type="button" onClick={() => removeDoc(active, d.id)} disabled={busy === `del-${d.id}`} aria-label="Remove" className="p-1 rounded text-surface-400 hover:text-danger-base hover:bg-danger-light"><Trash2 size={12} /></button>}
                    </div>
                  ))}
                </div>
                </Fragment>
              );
            })}
          </div>
          {open && (
            <p className={`mt-3 text-xs ${active.missing_required.length ? "text-warning-dark" : "text-success-dark"}`}>
              {active.missing_required.length
                ? `Upload the remaining required document${active.missing_required.length > 1 ? "s" : ""} to get your request reviewed.`
                : active.status === "submitted" ? "Our team has sent your documents to the SMS operator. Approval usually takes a few working days — we'll email you as soon as it's done."
                : active.status === "needs_info" ? "Upload what our team asked for above and it goes back into review automatically." : "All required documents are in — our team will review it soon. You'll get an email when there is an update."}
            </p>
          )}
        </Card>
      )}

      {!open && (
        <Card className="!p-4">
          <h3 className="text-sm font-semibold text-surface-800 mb-1">{active ? "Start a new request" : "Request approval"}</h3>
          {valueHelp && <p className="text-xs text-surface-500 mb-3">{valueHelp}</p>}
          <form onSubmit={submit} className="space-y-3 max-w-lg">
            <Input inputSize="sm" label={valueLabel} placeholder={valuePlaceholder} value={value} onChange={(e) => setValue(e.target.value)} maxLength={maxLength} required />
            <div>
              <label className="block text-sm font-medium text-surface-700 mb-1.5">Note for our team <span className="text-surface-400 font-normal">(optional)</span></label>
              <textarea value={note} onChange={(e) => setNote(e.target.value)} rows={2} maxLength={1000} placeholder="Anything that helps us approve this faster"
                className="block w-full rounded-md border border-surface-200 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/20" />
            </div>
            {formNote && <p className="text-xs text-warning-dark font-medium">{formNote}</p>}
            <Button type="submit" size="sm" loading={busy === "create"} disabled={!value.trim()}>Submit request</Button>
          </form>
        </Card>
      )}

      {history.length > 0 && (
        <Card padding={false} className="overflow-hidden">
          <div className="px-4 py-2.5 border-b border-surface-100 text-sm font-semibold text-surface-700">Earlier requests</div>
          <div className="divide-y divide-surface-100">
            {history.map((r) => (
              <div key={r.id} className="px-4 py-2.5 flex items-center justify-between gap-3 text-sm">
                <div className="min-w-0"><span className="font-mono text-surface-900">{r.value}</span><span className="ml-2 text-xs text-surface-400">{formatDate(r.created_at)}</span>
                  {r.admin_note && <p className="text-xs text-surface-500 truncate">{r.admin_note}</p>}</div>
                <Badge variant={STATUS_META[r.status].variant} size="sm">{STATUS_META[r.status].label}</Badge>
              </div>
            ))}
          </div>
        </Card>
      )}
    </div>
  );
}
