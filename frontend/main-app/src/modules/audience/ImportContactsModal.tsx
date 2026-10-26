import { DragEvent, useEffect, useRef, useState } from "react";
import { fetchCustomFields, type CustomField } from "../../lib/crm";
import { AlertTriangle, CheckCircle2, Download, FileSpreadsheet, FileUp, Loader2, X } from "lucide-react";
import Alert from "../../components/Alert";
import Button from "../../components/Button";
import { analyzeContactsCsv, decodeCsv, downloadContactsTemplate, downloadFile, FIELD_LABEL, TEMPLATE_COLUMNS, toCsv, type CsvAnalysis } from "../../lib/csv";
import { importContactsCsv, type ContactImportResult } from "../../lib/audience";

export default function ImportContactsModal({ onClose, onImported }: { onClose: () => void; onImported: () => void }) {
  const [file, setFile] = useState<File | null>(null);
  const [customFields, setCustomFields] = useState<CustomField[]>([]);
  useEffect(() => { fetchCustomFields().then(setCustomFields).catch(() => undefined); }, []);
  const [info, setInfo] = useState<CsvAnalysis | null>(null);
  const [consent, setConsent] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<ContactImportResult | null>(null);
  const input = useRef<HTMLInputElement>(null);

  async function pick(f: File | undefined | null) {
    if (!f) return;
    setError(null); setInfo(null); setConsent(false);
    if (!f.name.toLowerCase().endsWith(".csv")) { setFile(null); setError("Please choose a .csv file. In Excel: File → Save As → CSV."); return; }
    if (f.size > 10 * 1024 * 1024) { setFile(null); setError("That file is over 10 MB. Split it and import in parts."); return; }
    setFile(f);
    setInfo(analyzeContactsCsv(decodeCsv(await f.arrayBuffer()), customFields));
  }
  const onDrop = (e: DragEvent) => { e.preventDefault(); setDragging(false); pick(e.dataTransfer.files?.[0]); };

  async function run() {
    if (!file) return;
    setBusy(true); setError(null);
    try { setResult(await importContactsCsv(file)); onImported(); }
    catch (e) { setError(e instanceof Error ? e.message : "Import failed"); }
    finally { setBusy(false); }
  }

  const reset = () => { setFile(null); setInfo(null); setResult(null); setConsent(false); setError(null); };
  const blocked = !info || !info.hasIdentifier || info.total === 0 || (info.hasOptIn && !consent);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-surface-900/40 backdrop-blur-sm p-4" onClick={() => !busy && onClose()}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-3xl max-h-[92vh] flex flex-col" role="dialog" aria-modal="true" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between px-4 py-3.5 border-b border-surface-100 flex-shrink-0">
          <div><h2 className="font-semibold text-surface-900">{result ? "Import finished" : "Import contacts from a CSV file"}</h2>
            {!result && <p className="text-xs text-surface-500">Add many people at once. Existing contacts are updated, never duplicated.</p>}</div>
          <button onClick={onClose} className="p-1 rounded text-surface-400 hover:bg-surface-100" aria-label="Close"><X size={18} /></button>
        </div>

        <div className="p-4 overflow-y-auto space-y-5">
          {error && <Alert variant="error" onDismiss={() => setError(null)}>{error}</Alert>}

          {result ? (
            <div className="space-y-4">
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                {[["Added", result.created, "text-success-dark bg-success-light"], ["Updated", result.updated, "text-brand-700 bg-brand-50"], ...(result.restored ? [["Restored from Trash", result.restored, "text-sky-700 bg-sky-50"]] : []), ["Skipped", result.skipped, result.skipped ? "text-warning-dark bg-warning-light" : "text-surface-500 bg-surface-100"], ["Over plan limit", result.blocked, result.blocked ? "text-danger-dark bg-danger-light" : "text-surface-500 bg-surface-100"]].map(([l, n, tone]) => (
                  <div key={l as string} className={`rounded-xl px-3 py-3 ${tone}`}><p className="text-2xl font-bold tabular-nums">{n as number}</p><p className="text-xs font-medium">{l as string}</p></div>
                ))}
              </div>
              <p className="text-sm text-surface-600">{result.total_rows.toLocaleString()} rows read.{(result.sms_opted_in > 0 || result.whatsapp_opted_in > 0) && ` Opt-in recorded: ${result.sms_opted_in} for SMS, ${result.whatsapp_opted_in} for WhatsApp.`}</p>
              {result.blocked > 0 && <Alert variant="warning">Your plan allows {result.limit?.toLocaleString()} contacts, so {result.blocked} new contact{result.blocked === 1 ? " was" : "s were"} not added. Upgrade your plan to add more.</Alert>}
              {result.ignored_columns.length > 0 && <p className="text-xs text-surface-500">Columns we didn't use: {result.ignored_columns.join(", ")}.</p>}
              {result.errors.length > 0 && (
                <div className="rounded-lg border border-surface-200 overflow-hidden">
                  <div className="flex items-center justify-between px-3 py-2 bg-surface-50 border-b border-surface-200">
                    <p className="text-sm font-semibold text-surface-800 flex items-center gap-1.5"><AlertTriangle size={14} className="text-warning-dark" /> {result.errors.length}{result.errors.length >= 100 ? "+" : ""} row{result.errors.length === 1 ? "" : "s"} need attention</p>
                    <button onClick={() => downloadFile("import-problems.csv", toCsv([["row", "problem", "value"], ...result.errors.map((e) => [String(e.row), e.reason, e.value])]))} className="text-xs font-medium text-brand-600 hover:text-brand-700 inline-flex items-center gap-1"><Download size={12} /> Download list</button>
                  </div>
                  <div className="max-h-48 overflow-y-auto divide-y divide-surface-100 text-sm">
                    {result.errors.map((e, i) => <div key={i} className="px-3 py-1.5 flex gap-3"><span className="w-14 text-surface-400 tabular-nums">Row {e.row}</span><span className="text-surface-700">{e.reason}</span>{e.value && <span className="ml-auto font-mono text-xs text-surface-500 truncate">{e.value}</span>}</div>)}
                  </div>
                </div>
              )}
            </div>
          ) : (
            <>
              {/* Step 1 */}
              <section>
                <div className="flex items-center justify-between gap-3 flex-wrap mb-2">
                  <h3 className="text-sm font-semibold text-surface-800"><span className="mr-2 inline-flex w-5 h-5 rounded-full bg-brand-50 text-brand-700 text-xs items-center justify-center">1</span>Get the sample file</h3>
                  <Button type="button" size="sm" variant="secondary" icon={<Download size={14} />} onClick={() => downloadContactsTemplate(customFields)}>Download sample (.csv)</Button>
                </div>
                <div className="rounded-lg border border-surface-200 overflow-hidden">
                  <table data-no-cards className="w-full text-xs">
                    <thead className="bg-surface-50 text-surface-500"><tr><th className="text-left px-3 py-2 font-semibold">Column</th><th className="text-left px-3 py-2 font-semibold">Needed?</th><th className="text-left px-3 py-2 font-semibold hidden sm:table-cell">Example</th><th className="text-left px-3 py-2 font-semibold hidden md:table-cell">Notes</th></tr></thead>
                    <tbody className="divide-y divide-surface-100">
                      {[...TEMPLATE_COLUMNS, ...customFields.map((d) => ({ column: d.label, required: "Optional", example: d.options[0] ?? "", note: d.options.length ? `Your extra field. One of: ${d.options.join(", ")}.` : "Your extra field." }))].map((c) => (
                        <tr key={c.column}><td className="px-3 py-1.5 font-mono text-surface-800">{c.column}</td><td className={`px-3 py-1.5 ${c.required === "Optional" ? "text-surface-500" : "text-brand-700 font-medium"}`}>{c.required}</td><td className="px-3 py-1.5 text-surface-600 hidden sm:table-cell">{c.example}</td><td className="px-3 py-1.5 text-surface-500 hidden md:table-cell">{c.note}</td></tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </section>

              {/* Step 2 */}
              <section>
                <h3 className="text-sm font-semibold text-surface-800 mb-2"><span className="mr-2 inline-flex w-5 h-5 rounded-full bg-brand-50 text-brand-700 text-xs items-center justify-center">2</span>Choose your file</h3>
                <div onDragOver={(e) => { e.preventDefault(); setDragging(true); }} onDragLeave={() => setDragging(false)} onDrop={onDrop} onClick={() => input.current?.click()}
                  className={`cursor-pointer rounded-xl border-2 border-dashed px-4 py-5 text-center transition ${dragging ? "border-brand-500 bg-brand-50" : file ? "border-success-base/40 bg-success-light/40" : "border-surface-300 hover:border-brand-400 hover:bg-surface-50"}`}>
                  <input ref={input} type="file" accept=".csv,text/csv" className="hidden" onChange={(e) => pick(e.target.files?.[0])} />
                  {file ? (
                    <div className="flex items-center justify-center gap-3"><FileSpreadsheet size={26} className="text-success-dark" />
                      <div className="text-left"><p className="text-sm font-semibold text-surface-900">{file.name}</p><p className="text-xs text-surface-500">{info ? `${info.total.toLocaleString()} row${info.total === 1 ? "" : "s"} found` : "Reading…"} · click to choose another</p></div></div>
                  ) : (
                    <><FileUp size={28} className="mx-auto text-surface-400" /><p className="mt-2 text-sm font-medium text-surface-800">Drop your CSV here, or click to browse</p><p className="text-xs text-surface-500">Up to 10 MB · 20,000 rows · saved from Excel or Google Sheets as CSV</p></>
                  )}
                </div>
              </section>

              {/* Check */}
              {info && (
                <section className="space-y-3">
                  <h3 className="text-sm font-semibold text-surface-800"><span className="mr-2 inline-flex w-5 h-5 rounded-full bg-brand-50 text-brand-700 text-xs items-center justify-center">3</span>Check it looks right</h3>
                  {!info.hasIdentifier ? (
                    <Alert variant="error">We couldn't find an <b>email</b> or <b>phone</b> column. We found: {info.header.filter(Boolean).join(", ") || "nothing"}. Rename a column, or start from the sample file.</Alert>
                  ) : info.total === 0 ? (
                    <Alert variant="warning">The file has a header row but no contacts.</Alert>
                  ) : (
                    <>
                      <div className="flex flex-wrap gap-1.5">
                        {info.recognised.map((r) => <span key={r.field} className="inline-flex items-center gap-1 rounded-full bg-success-light text-success-dark px-2.5 py-1 text-xs font-medium"><CheckCircle2 size={12} />{FIELD_LABEL[r.field]}{r.header.toLowerCase() !== r.field.replace("_", " ") && <span className="text-success-dark/60">← “{r.header}”</span>}</span>)}
                        {info.ignored.map((h) => <span key={h} className="rounded-full bg-surface-100 text-surface-500 px-2.5 py-1 text-xs" title="Not used">{h} <span className="text-surface-400">(ignored)</span></span>)}
                      </div>
                      <div className="rounded-lg border border-surface-200 overflow-x-auto">
                        <table data-no-cards className="w-full text-xs"><thead className="bg-surface-50 text-surface-500"><tr>{info.header.map((h, i) => <th key={i} className="text-left px-3 py-1.5 font-semibold whitespace-nowrap">{h}</th>)}</tr></thead>
                          <tbody className="divide-y divide-surface-100">{info.preview.map((r, i) => <tr key={i}>{info.header.map((_, j) => <td key={j} className="px-3 py-1.5 text-surface-700 whitespace-nowrap">{r[j]}</td>)}</tr>)}</tbody></table>
                        {info.total > info.preview.length && <p className="px-3 py-1.5 text-[11px] text-surface-400 border-t border-surface-100">…and {(info.total - info.preview.length).toLocaleString()} more rows</p>}
                      </div>
                      {info.hasOptIn && (
                        <label className="flex items-start gap-2.5 rounded-lg border border-warning-base/40 bg-warning-light/60 px-3 py-2.5 text-sm text-surface-800 cursor-pointer">
                          <input type="checkbox" className="mt-1" checked={consent} onChange={(e) => setConsent(e.target.checked)} />
                          <span>I confirm that everyone marked <b>yes</b> for SMS or WhatsApp agreed to receive messages from my business.</span>
                        </label>
                      )}
                    </>
                  )}
                </section>
              )}
            </>
          )}
        </div>

        <div className="flex items-center justify-between gap-2 px-4 py-3.5 border-t border-surface-100 flex-shrink-0">
          {result ? (
            <><Button size="sm" variant="ghost" onClick={reset}>Import another file</Button><Button size="sm" onClick={onClose}>Done</Button></>
          ) : (
            <><Button size="sm" variant="ghost" onClick={onClose} disabled={busy}>Cancel</Button>
              <Button size="sm" onClick={run} disabled={blocked} loading={busy} icon={busy ? <Loader2 size={14} className="animate-spin" /> : undefined}>{info && info.hasIdentifier && info.total > 0 ? `Import ${info.total.toLocaleString()} contact${info.total === 1 ? "" : "s"}` : "Import"}</Button></>
          )}
        </div>
      </div>
    </div>
  );
}
