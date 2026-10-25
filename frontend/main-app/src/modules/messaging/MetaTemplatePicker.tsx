import { useMemo } from "react";
import { Link } from "react-router-dom";
import { AlertTriangle } from "lucide-react";
import Alert from "../../components/Alert";
import Card from "../../components/Card";
import type { MetaTemplate } from "../../lib/sms";

export const fillTemplate = (body: string, params: string[]) => body.replace(/\{\{(\d+)\}\}/g, (_, n) => params[Number(n) - 1] || `{{${n}}}`);
export const keyOf = (t: { name: string; language: string }) => `${t.name}|${t.language}`;

/** WhatsApp (Meta Cloud API): business-started messages must use an approved template. */
export default function MetaTemplatePicker({ templates, error, value, params, onPick, onParams, tags }: {
  templates: MetaTemplate[]; error?: string; value: string; params: string[];
  onPick: (key: string) => void; onParams: (p: string[]) => void; tags: { key: string; label: string }[];
}) {
  const t = useMemo(() => templates.find((x) => keyOf(x) === value), [templates, value]);
  return (
    <Card className="!p-3 space-y-3">
      {error && <Alert variant="warning">{error}</Alert>}
      {templates.length === 0 && !error ? (
        <Alert variant="info"><span className="inline-flex items-start gap-1.5"><AlertTriangle size={14} className="mt-0.5 flex-shrink-0" />No approved WhatsApp templates yet. Templates are created and approved in Meta; ask the platform admin to add one.</span></Alert>
      ) : (
        <>
          <div>
            <label className="block text-xs font-semibold text-surface-600 mb-1">Approved template</label>
            <select value={value} onChange={(e) => onPick(e.target.value)} className="w-full border border-surface-300 rounded-[3px] px-2.5 py-2 text-base sm:text-sm bg-white">
              <option value="">Choose a template…</option>
              {templates.map((x) => <option key={keyOf(x)} value={keyOf(x)}>{x.name} · {x.language} · {x.category}</option>)}
            </select>
          </div>
          {t && (
            <>
              <div className="rounded-[3px] border border-surface-200 bg-surface-50 px-3 py-2 text-sm text-surface-800 whitespace-pre-wrap">{t.body || "(no text)"}</div>
              {t.params > 0 && (
                <div className="space-y-2">
                  <p className="text-xs font-semibold text-surface-600">Fill the blanks <span className="font-normal text-surface-400">— type text or use a name tag like {"{{first_name}}"}</span></p>
                  {Array.from({ length: t.params }, (_, i) => (
                    <div key={i} className="flex items-center gap-2">
                      <span className="w-10 text-xs text-surface-500 font-mono">{`{{${i + 1}}}`}</span>
                      <input value={params[i] ?? ""} onChange={(e) => { const p = [...params]; p[i] = e.target.value; onParams(p); }} placeholder="e.g. {{first_name}}"
                        className="flex-1 min-w-0 border border-surface-300 rounded-[3px] px-2.5 py-1.5 text-base sm:text-sm" />
                      <span className="hidden sm:flex gap-1">{tags.slice(0, 3).map((b) => (
                        <button type="button" key={b.key} onClick={() => { const p = [...params]; p[i] = `${p[i] ?? ""}{{${b.key}}}`; onParams(p); }}
                          className="text-[11px] rounded-[3px] border border-surface-200 bg-white px-1.5 py-0.5 text-surface-700 hover:border-brand-300">{b.label}</button>))}</span>
                    </div>
                  ))}
                </div>
              )}
            </>
          )}
        </>
      )}
      <p className="text-[11px] text-surface-500">Templates are approved by Meta. Customers who reply STOP are opted out automatically. <Link to="/whatsapp" className="text-brand-600 hover:underline">Back to WhatsApp</Link></p>
    </Card>
  );
}
