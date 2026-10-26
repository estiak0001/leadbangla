import { FormEvent, useEffect, useState } from "react";
import { Search, ChevronDown, ChevronUp } from "lucide-react";
import AppLayout from "../../components/AppLayout";
import PlanUsageStrip from "../../components/PlanUsageStrip";
import Button from "../../components/Button";
import Card from "../../components/Card";
import Input from "../../components/Input";
import Badge from "../../components/Badge";
import Alert from "../../components/Alert";
import PageHeader from "../../components/PageHeader";
import EmptyState from "../../components/EmptyState";
import Spinner from "../../components/Spinner";
import {
  auditIssueSummary, createAudit, deleteAudit, getAudit, issueCounts,
  listAudits, type SeoAudit, type SeoPageResult,
} from "../../lib/seo";
import { confirmText } from "../../components/ConfirmDialog";

const SEV_BADGE: Record<"critical" | "warning" | "info", "danger" | "warning" | "info"> = {
  critical: "danger", warning: "warning", info: "info",
};

function IssuePill({ sev, count }: { sev: "critical" | "warning" | "info"; count: number }) {
  if (!count) return null;
  return <Badge variant={SEV_BADGE[sev]} size="sm" dot>{count} {sev === "critical" ? "Critical" : sev === "warning" ? "Warning" : "Info"}</Badge>;
}

function PageRow({ page }: { page: SeoPageResult }) {
  const [open, setOpen] = useState(false);
  const counts = issueCounts(page);
  const totalIssues = counts.critical + counts.warning + counts.info;
  const statusColor = page.http_status >= 500 ? "text-danger-dark" : page.http_status >= 400 ? "text-danger-base" : page.http_status >= 300 ? "text-warning-dark" : "text-success-dark";

  return (
    <div className="border-b border-surface-100 last:border-0">
      <button
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-surface-50 transition-colors"
      >
        <span className={`font-mono text-xs font-bold ${statusColor} w-10 flex-shrink-0`}>
          {page.http_status || "ERR"}
        </span>
        <span className="flex-1 text-sm text-surface-700 truncate min-w-0">{page.url}</span>
        <div className="flex items-center gap-1.5 flex-shrink-0">
          <IssuePill sev="critical" count={counts.critical} />
          <IssuePill sev="warning" count={counts.warning} />
          <IssuePill sev="info" count={counts.info} />
          {totalIssues === 0 && <Badge variant="success" size="sm">No issues</Badge>}
        </div>
        {open ? <ChevronUp size={14} className="text-surface-400 flex-shrink-0" /> : <ChevronDown size={14} className="text-surface-400 flex-shrink-0" />}
      </button>

      {open && (
        <div className="px-4 pb-4 bg-surface-50 border-t border-surface-100">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 py-3 text-xs text-surface-600">
            <div><span className="text-surface-600 block">Title</span><p className="font-medium text-surface-800 truncate">{page.title || "—"}</p><p className="text-surface-600">{page.title_length} chars</p></div>
            <div><span className="text-surface-600 block">H1</span><p className="font-medium text-surface-800 truncate">{page.h1_text || "—"}</p><p className="text-surface-600">{page.h1_count} tag(s)</p></div>
            <div><span className="text-surface-600 block">Meta desc</span><p className="font-medium text-surface-800">{page.meta_description_length} chars</p>{page.has_noindex && <p className="text-danger-dark font-semibold">NOINDEX</p>}</div>
            <div><span className="text-surface-600 block">Internal links</span><p className="font-medium text-surface-800">{page.internal_links_count}</p>{page.img_without_alt > 0 && <p className="text-warning-dark">{page.img_without_alt} img missing alt</p>}</div>
          </div>
          {page.issues.length > 0 ? (
            <div className="space-y-2 mt-1">
              {page.issues.map((issue, i) => (
                <div key={i} className="flex items-start gap-2">
                  <span className={`mt-1 status-dot flex-shrink-0 ${issue.severity === "critical" ? "bg-danger-base" : issue.severity === "warning" ? "bg-warning-base" : "bg-info-base"}`} />
                  <div>
                    <Badge variant={SEV_BADGE[issue.severity as "critical" | "warning" | "info"]} size="sm" className="mr-2">{issue.severity}</Badge>
                    <span className="text-sm text-surface-700">{issue.message}</span>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm text-success-dark font-medium mt-1">All on-page checks passed!</p>
          )}
        </div>
      )}
    </div>
  );
}

const STATUS_BADGE: Record<string, "default" | "info" | "success" | "danger"> = {
  pending: "default", running: "info", completed: "success", failed: "danger",
};

function AuditCard({ audit, onDelete, onRefresh }: { audit: SeoAudit; onDelete: () => void; onRefresh: (u: SeoAudit) => void }) {
  const [expanded, setExpanded] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const summary = auditIssueSummary(audit);
  const duration = audit.started_at && audit.completed_at
    ? Math.round((new Date(audit.completed_at).getTime() - new Date(audit.started_at).getTime()) / 1000)
    : null;

  const handleRefresh = async () => {
    setRefreshing(true);
    try { onRefresh(await getAudit(audit.id)); } catch (e: any) { alert(e.message); } finally { setRefreshing(false); }
  };

  return (
    <Card>
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 flex-wrap mb-1">
            <Badge variant={STATUS_BADGE[audit.status] ?? "default"} size="sm" dot>{audit.status}</Badge>
            <span className="text-sm font-semibold text-surface-800 truncate">{audit.url}</span>
          </div>
          <div className="flex items-center gap-4 text-xs text-surface-600 flex-wrap">
            <span>{audit.pages_crawled} page(s) crawled</span>
            {audit.status === "completed" && (
              <>
                {summary.critical > 0 && <span className="text-danger-dark font-medium">{summary.critical} critical</span>}
                {summary.warning > 0 && <span className="text-warning-dark font-medium">{summary.warning} warnings</span>}
                {summary.info > 0 && <span className="text-info-dark font-medium">{summary.info} info</span>}
              </>
            )}
            {duration !== null && <span>{duration}s</span>}
            <span>{new Date(audit.created_at).toLocaleDateString("en-BD")}</span>
            {audit.error_message && <span className="text-danger-dark">Error: {audit.error_message}</span>}
          </div>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          {(audit.status === "running" || audit.status === "pending") && (
            <Button size="xs" variant="secondary" loading={refreshing} onClick={handleRefresh}>Refresh</Button>
          )}
          {audit.status === "completed" && audit.pages.length > 0 && (
            <Button size="xs" variant="ghost" onClick={() => setExpanded((v) => !v)}>
              {expanded ? "Hide" : "View Results"}
            </Button>
          )}
          {audit.status === "completed" && audit.pages.length === 0 && (
            <Button size="xs" variant="secondary" loading={refreshing} onClick={handleRefresh}>Load Results</Button>
          )}
          <Button size="xs" variant="danger" onClick={onDelete}>Delete</Button>
        </div>
      </div>

      {expanded && audit.pages.length > 0 && (
        <div className="mt-4 border border-surface-200 rounded-md overflow-hidden">
          <div className="bg-surface-50 px-4 py-2 text-xs font-semibold text-surface-400 uppercase tracking-wide border-b border-surface-200">
            {audit.pages.length} page(s) audited
          </div>
          {audit.pages.map((p) => <PageRow key={p.id} page={p} />)}
        </div>
      )}
    </Card>
  );
}

export default function SeoPage() {
  const [audits, setAudits]     = useState<SeoAudit[]>([]);
  const [loading, setLoading]   = useState(true);
  const [url, setUrl]           = useState("https://example.com");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError]       = useState("");

  const load = () => {
    setLoading(true);
    listAudits().then(setAudits).catch((e) => setError(e.message)).finally(() => setLoading(false));
  };
  useEffect(load, []);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!url.trim()) return;
    setSubmitting(true); setError("");
    try { const audit = await createAudit(url.trim()); setAudits((prev) => [audit, ...prev]); setUrl("https://example.com"); }
    catch (e: any) { setError(e.message); }
    finally { setSubmitting(false); }
  };

  const handleDelete = async (id: string) => {
    if (!(await confirmText("Delete this audit and all its results?"))) return;
    try { await deleteAudit(id); setAudits((prev) => prev.filter((a) => a.id !== id)); }
    catch (e: any) { alert(e.message); }
  };

  return (
    <AppLayout>
      <PageHeader
        title="SEO Audit"
        description="On-page audit: crawls up to 15 pages, checks meta tags, H1, canonical, broken links, noindex — zero third-party API cost."
      />
      <PlanUsageStrip items={["seo"]} />

      <Card className="mb-6">
        <form onSubmit={handleSubmit} className="flex flex-wrap items-end gap-3">
          <div className="flex-1 min-w-64">
            <Input
              label="Site URL to audit"
              type="url"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="https://your-site.com"
              required
            />
          </div>
          <Button type="submit" loading={submitting} disabled={!url.trim()}>Run Audit</Button>
        </form>
        <p className="text-xs text-surface-600 mt-2">The crawler stays within the same domain and respects a 15-page limit per audit.</p>
      </Card>

      {error && <Alert variant="error" className="mb-4">{error}</Alert>}

      {loading ? (
        <div className="flex justify-center py-16"><Spinner size="lg" /></div>
      ) : audits.length === 0 ? (
        <Card>
          <EmptyState icon={<Search size={40} />} title="No audits yet" description="Enter a URL above and click Run Audit to start." />
        </Card>
      ) : (
        <div className="space-y-3">
          {audits.map((a) => (
            <AuditCard key={a.id} audit={a} onDelete={() => handleDelete(a.id)} onRefresh={(u) => setAudits((prev) => prev.map((x) => (x.id === u.id ? u : x)))} />
          ))}
        </div>
      )}
    </AppLayout>
  );
}
