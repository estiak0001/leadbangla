import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Plus, Search } from "lucide-react";
import AppLayout from "../components/AppLayout";
import Alert from "../components/Alert";
import Badge from "../components/Badge";
import Button from "../components/Button";
import Card from "../components/Card";
import EmptyState from "../components/EmptyState";
import PageHeader from "../components/PageHeader";
import { fetchRegistrations, fetchTenants, type Registration, type Tenant } from "../lib/admin";

const STATUS_VARIANT: Record<string, "success" | "default" | "info" | "warning"> = {
  active:   "success",
  inactive: "default",
  trialing: "info",
  past_due: "warning",
};

function StatusBadge({ status }: { status: string | null | undefined }) {
  if (!status) return <span className="text-surface-400">—</span>;
  return <Badge variant={STATUS_VARIANT[status] ?? "default"}>{status}</Badge>;
}

const STAGE_META: Record<string, { label: string; variant: "success" | "default" | "info" | "warning" | "danger" }> = {
  unverified:      { label: "Email unverified",   variant: "warning" },
  no_payment:      { label: "No payment started", variant: "default" },
  payment_pending: { label: "Payment pending",    variant: "info" },
  payment_failed:  { label: "Payment failed",     variant: "danger" },
  cancelled:       { label: "Cancelled",          variant: "default" },
  active:          { label: "Active (paid)",      variant: "success" },
};

function StageBadge({ stage }: { stage: string }) {
  const meta = STAGE_META[stage] ?? { label: stage, variant: "default" as const };
  return <Badge variant={meta.variant}>{meta.label}</Badge>;
}

export default function TenantListPage() {
  const [tab, setTab] = useState<"organizations" | "registrations">("organizations");

  const [tenants, setTenants] = useState<Tenant[]>([]);
  const [tenantsError, setTenantsError] = useState<string | null>(null);
  const [tenantsLoading, setTenantsLoading] = useState(true);
  const [q, setQ] = useState("");
  const [filter, setFilter] = useState<"all" | "active" | "suspended" | "noplan">("all");

  const [registrations, setRegistrations] = useState<Registration[]>([]);
  const [regError, setRegError] = useState<string | null>(null);
  const [regLoading, setRegLoading] = useState(true);
  const [regQ, setRegQ] = useState("");
  const [stageFilter, setStageFilter] = useState<"all" | Registration["stage"]>("all");

  const navigate = useNavigate();

  useEffect(() => {
    fetchTenants()
      .then((t) => { setTenants(t); setTenantsLoading(false); })
      .catch((err) => {
        if (err instanceof Error && err.message === "UNAUTHORIZED") { navigate("/login"); return; }
        setTenantsError("Failed to load tenants"); setTenantsLoading(false);
      });
    fetchRegistrations()
      .then((r) => { setRegistrations(r); setRegLoading(false); })
      .catch((err) => {
        if (err instanceof Error && err.message === "UNAUTHORIZED") { navigate("/login"); return; }
        setRegError("Failed to load registrations"); setRegLoading(false);
      });
  }, [navigate]);

  const shownTenants = tenants.filter((t) => {
    const hay = `${t.name} ${t.owner_email ?? ""} ${t.phone ?? ""}`.toLowerCase();
    if (q.trim() && !hay.includes(q.trim().toLowerCase())) return false;
    if (filter === "suspended") return !!t.is_suspended;
    if (filter === "active") return !t.is_suspended;
    if (filter === "noplan") return !t.plan_name || t.subscription_status !== "active";
    return true;
  });

  const shownRegistrations = registrations.filter((r) => {
    const hay = `${r.email} ${r.org_name ?? ""}`.toLowerCase();
    if (regQ.trim() && !hay.includes(regQ.trim().toLowerCase())) return false;
    if (stageFilter !== "all" && r.stage !== stageFilter) return false;
    return true;
  });

  const stageCounts = registrations.reduce<Record<string, number>>((acc, r) => {
    acc[r.stage] = (acc[r.stage] ?? 0) + 1;
    return acc;
  }, {});

  return (
    <AppLayout>
      <PageHeader
        title="Tenants"
        description={
          tab === "organizations"
            ? `${tenants.length} organization${tenants.length !== 1 ? "s" : ""}`
            : `${registrations.length} registration${registrations.length !== 1 ? "s" : ""} — every signed-up user, by funnel stage`
        }
        actions={
          <Link to="/tenants/new">
            <Button size="sm" icon={<Plus size={15} />}>New Tenant</Button>
          </Link>
        }
      />

      <div className="flex gap-1 bg-surface-100 p-0.5 rounded-md mb-4 w-fit">
        {([["organizations", "Organizations"], ["registrations", "Registrations"]] as const).map(([k, label]) => (
          <button
            key={k}
            onClick={() => setTab(k)}
            className={`px-3 py-1.5 rounded text-sm font-medium transition-colors ${tab === k ? "bg-white shadow-sm text-surface-900" : "text-surface-600 hover:text-surface-900"}`}
          >
            {label}
          </button>
        ))}
      </div>

      {tab === "organizations" ? (
        <>
          {tenantsError && <Alert className="mb-4">{tenantsError}</Alert>}

          {!tenantsLoading && tenants.length > 0 && (
            <div className="flex items-center gap-2 flex-wrap mb-4">
              <div className="relative flex-1 min-w-[12rem] max-w-sm">
                <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-surface-400" />
                <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search name, owner email or phone…"
                  className="w-full rounded-md border border-surface-200 bg-white py-1.5 pl-8 pr-3 text-sm focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/20" />
              </div>
              <div className="flex gap-1 bg-surface-100 p-0.5 rounded-md">
                {([["all", "All"], ["active", "Active"], ["suspended", "Suspended"], ["noplan", "No plan"]] as const).map(([k, label]) => (
                  <button key={k} onClick={() => setFilter(k)} className={`px-2.5 py-1 rounded text-xs font-medium ${filter === k ? "bg-white shadow-sm text-surface-900" : "text-surface-600 hover:text-surface-900"}`}>{label}</button>
                ))}
              </div>
            </div>
          )}

          {tenantsLoading ? (
            <Card>
              <div className="py-16 text-center text-surface-400 text-sm">Loading tenants…</div>
            </Card>
          ) : tenants.length === 0 ? (
            <Card>
              <EmptyState title="No tenants found" description="Onboard a tenant to get started." />
            </Card>
          ) : (
            <>
              {/* Desktop table */}
              <Card padding={false} className="hidden md:block overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="border-b border-surface-200 bg-surface-50">
                      <tr>
                        {["Organization", "Owner", "Plan", "Status", "Members"].map((h) => (
                          <th key={h} className="px-4 py-3.5 text-xs font-semibold uppercase tracking-wide text-surface-400 text-left">{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-surface-100">
                      {shownTenants.map((t) => (
                        <tr key={t.id} className="hover:bg-surface-50 transition-colors">
                          <td className="px-4 py-3.5">
                            <Link to={`/tenants/${t.id}`} className="font-semibold text-brand-600 hover:text-brand-700 transition-colors">
                              {t.name}
                            </Link>
                            {t.is_suspended && <Badge variant="danger" size="sm" className="ml-2">Suspended</Badge>}
                          </td>
                          <td className="px-4 py-3.5 text-surface-600">{t.owner_email ?? "—"}</td>
                          <td className="px-4 py-3.5 text-surface-600">{t.plan_name ?? "—"}</td>
                          <td className="px-4 py-3.5"><StatusBadge status={t.subscription_status} /></td>
                          <td className="px-4 py-3.5 text-surface-600 font-medium">{t.member_count}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </Card>

              {/* Mobile card list */}
              <div className="space-y-3 md:hidden">
                {shownTenants.map((t) => (
                  <Card key={t.id} className="p-4">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <Link to={`/tenants/${t.id}`} className="font-semibold text-brand-600 hover:text-brand-700 transition-colors block truncate">
                          {t.name}
                        </Link>
                        <p className="text-sm text-surface-600 mt-0.5 truncate">{t.owner_email ?? "—"}</p>
                      </div>
                      <StatusBadge status={t.subscription_status} />
                    </div>
                    <div className="flex items-center justify-between mt-3 pt-3 border-t border-surface-100 text-sm">
                      <span className="text-surface-500">{t.plan_name ?? "No plan"}</span>
                      <span className="text-surface-600 font-medium">{t.member_count} member{t.member_count !== 1 ? "s" : ""}</span>
                    </div>
                  </Card>
                ))}
              </div>
            </>
          )}
        </>
      ) : (
        <>
          {regError && <Alert className="mb-4">{regError}</Alert>}

          {!regLoading && registrations.length > 0 && (
            <div className="flex items-center gap-2 flex-wrap mb-4">
              <div className="relative flex-1 min-w-[12rem] max-w-sm">
                <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-surface-400" />
                <input value={regQ} onChange={(e) => setRegQ(e.target.value)} placeholder="Search email or organization…"
                  className="w-full rounded-md border border-surface-200 bg-white py-1.5 pl-8 pr-3 text-sm focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/20" />
              </div>
              <div className="flex gap-1 bg-surface-100 p-0.5 rounded-md flex-wrap">
                {([
                  ["all", `All (${registrations.length})`],
                  ["unverified", `Unverified (${stageCounts.unverified ?? 0})`],
                  ["no_payment", `No payment (${stageCounts.no_payment ?? 0})`],
                  ["payment_pending", `Payment pending (${stageCounts.payment_pending ?? 0})`],
                  ["payment_failed", `Payment failed (${stageCounts.payment_failed ?? 0})`],
                  ["active", `Active (${stageCounts.active ?? 0})`],
                  ["cancelled", `Cancelled (${stageCounts.cancelled ?? 0})`],
                ] as const).map(([k, label]) => (
                  <button key={k} onClick={() => setStageFilter(k)} className={`px-2.5 py-1 rounded text-xs font-medium whitespace-nowrap ${stageFilter === k ? "bg-white shadow-sm text-surface-900" : "text-surface-600 hover:text-surface-900"}`}>{label}</button>
                ))}
              </div>
            </div>
          )}

          {regLoading ? (
            <Card>
              <div className="py-16 text-center text-surface-400 text-sm">Loading registrations…</div>
            </Card>
          ) : registrations.length === 0 ? (
            <Card>
              <EmptyState title="No registrations found" description="Signups will show up here as soon as they come in." />
            </Card>
          ) : shownRegistrations.length === 0 ? (
            <Card>
              <EmptyState title="No matches" description="Try a different search or stage filter." />
            </Card>
          ) : (
            <>
              {/* Desktop table */}
              <Card padding={false} className="hidden md:block overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="border-b border-surface-200 bg-surface-50">
                      <tr>
                        {["Email", "Organization", "Plan", "Stage", "Signed up"].map((h) => (
                          <th key={h} className="px-4 py-3.5 text-xs font-semibold uppercase tracking-wide text-surface-400 text-left">{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-surface-100">
                      {shownRegistrations.map((r) => (
                        <tr key={r.user_id} className="hover:bg-surface-50 transition-colors">
                          <td className="px-4 py-3.5 font-medium text-surface-900">
                            {r.organization_id ? (
                              <Link to={`/tenants/${r.organization_id}`} className="font-semibold text-brand-600 hover:text-brand-700 transition-colors">{r.email}</Link>
                            ) : r.email}
                          </td>
                          <td className="px-4 py-3.5 text-surface-600">{r.org_name ?? "—"}</td>
                          <td className="px-4 py-3.5 text-surface-600">{r.plan_name ?? "—"}</td>
                          <td className="px-4 py-3.5"><StageBadge stage={r.stage} /></td>
                          <td className="px-4 py-3.5 text-surface-500">{new Date(r.created_at).toLocaleDateString()}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </Card>

              {/* Mobile card list */}
              <div className="space-y-3 md:hidden">
                {shownRegistrations.map((r) => (
                  <Card key={r.user_id} className="p-4">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="font-semibold text-surface-900 truncate">{r.email}</p>
                        <p className="text-sm text-surface-600 mt-0.5 truncate">{r.org_name ?? "No organization yet"}</p>
                      </div>
                      <StageBadge stage={r.stage} />
                    </div>
                    <div className="flex items-center justify-between mt-3 pt-3 border-t border-surface-100 text-sm">
                      <span className="text-surface-500">{r.plan_name ?? "No plan"}</span>
                      <span className="text-surface-500">{new Date(r.created_at).toLocaleDateString()}</span>
                    </div>
                  </Card>
                ))}
              </div>
            </>
          )}
        </>
      )}
    </AppLayout>
  );
}
